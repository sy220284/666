import type { CommandFailure, CommandResult } from '@worldforge/contracts';

export type BridgeRequestState = 'idle' | 'pending' | 'success' | 'failure' | 'cancelled' | 'stale';

type ContractBridgeError = CommandFailure['error'];

export type BridgeRequestError = Omit<ContractBridgeError, 'code'> & {
  readonly code: ContractBridgeError['code'] | 'BRIDGE_UNEXPECTED_FAILURE';
};

export type BridgeRequestOutcome<T> =
  | {
      readonly state: 'success';
      readonly generation: number;
      readonly requestId: string;
      readonly data: T;
    }
  | {
      readonly state: 'failure';
      readonly generation: number;
      readonly requestId: string | null;
      readonly error: BridgeRequestError;
    }
  | {
      readonly state: 'cancelled';
      readonly generation: number;
    }
  | {
      readonly state: 'stale';
      readonly generation: number;
    };

export interface BridgeRequestContext {
  readonly signal: AbortSignal;
  readonly generation: number;
}

export interface BridgeRequestOptions {
  readonly mode?: 'reject' | 'replace' | 'share';
  readonly signal?: AbortSignal;
}

interface ActiveRequest {
  readonly generation: number;
  readonly controller: AbortController;
}

interface SharedRequest {
  readonly generation: number;
  readonly controller: AbortController;
  readonly promise: Promise<BridgeRequestOutcome<unknown>>;
  subscribers: number;
  settled: boolean;
}

interface LatestOnlyRequest {
  readonly generation: number;
  readonly execute: () => Promise<BridgeRequestOutcome<unknown>>;
  readonly resolve: (outcome: BridgeRequestOutcome<unknown>) => void;
}

interface LatestOnlyLane {
  inFlight: boolean;
  latestGeneration: number;
  pending: LatestOnlyRequest | null;
}

type SettledOperation<T> =
  | { readonly kind: 'result'; readonly result: CommandResult<T> }
  | { readonly kind: 'error'; readonly error: unknown };

export class DuplicateBridgeRequestError extends Error {
  readonly requestKey: string;

  constructor(requestKey: string) {
    super(`A bridge request is already pending for ${requestKey}.`);
    this.name = 'DuplicateBridgeRequestError';
    this.requestKey = requestKey;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.toLowerCase().includes('aborted'))
  );
}

function unexpectedFailure(error: unknown): BridgeRequestError {
  return {
    code: 'BRIDGE_UNEXPECTED_FAILURE',
    message: error instanceof Error ? error.message : 'Unexpected bridge request failure.',
    retryable: true,
  };
}

const CONTINUATION_REQUEST_PREFIX = 'project.saveContinuation:';

function latestOnlyLaneKey(requestKey: string): string | null {
  if (!requestKey.startsWith(CONTINUATION_REQUEST_PREFIX)) return null;
  const identity = requestKey.slice(CONTINUATION_REQUEST_PREFIX.length);
  try {
    const input: unknown = JSON.parse(identity);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
    const projectId = (input as Record<string, unknown>).projectId;
    if (typeof projectId !== 'string' || projectId.length === 0) return null;
    return `${CONTINUATION_REQUEST_PREFIX}${JSON.stringify(projectId)}`;
  } catch {
    return null;
  }
}

function withGeneration<T>(
  outcome: BridgeRequestOutcome<T>,
  generation: number,
): BridgeRequestOutcome<T> {
  switch (outcome.state) {
    case 'success':
      return {
        state: 'success',
        generation,
        requestId: outcome.requestId,
        data: outcome.data,
      };
    case 'failure':
      return {
        state: 'failure',
        generation,
        requestId: outcome.requestId,
        error: outcome.error,
      };
    case 'cancelled':
      return { state: 'cancelled', generation };
    case 'stale':
      return { state: 'stale', generation };
  }
}

export class BridgeRequestCoordinator {
  readonly #active = new Map<string, ActiveRequest>();
  readonly #latestOnly = new Map<string, LatestOnlyLane>();
  readonly #shared = new Map<string, SharedRequest>();

  isPending(requestKey: string): boolean {
    const laneKey = latestOnlyLaneKey(requestKey);
    const lane = laneKey ? this.#latestOnly.get(laneKey) : undefined;
    return this.#active.has(requestKey) || Boolean(lane?.inFlight || lane?.pending);
  }

  cancel(requestKey: string): boolean {
    const laneKey = latestOnlyLaneKey(requestKey);
    if (laneKey) {
      const lane = this.#latestOnly.get(laneKey);
      let cancelled = false;
      if (lane) {
        lane.latestGeneration += 1;
        if (lane.pending) {
          lane.pending.resolve({ state: 'stale', generation: lane.pending.generation });
          lane.pending = null;
        }
        cancelled = lane.inFlight || cancelled;
      }
      for (const [activeKey, active] of this.#active) {
        if (!activeKey.startsWith(`${laneKey}#`)) continue;
        active.controller.abort();
        cancelled = true;
      }
      return cancelled;
    }

    const active = this.#active.get(requestKey);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  cancelAll(): void {
    for (const lane of this.#latestOnly.values()) {
      lane.latestGeneration += 1;
      if (lane.pending) {
        lane.pending.resolve({ state: 'stale', generation: lane.pending.generation });
        lane.pending = null;
      }
    }
    for (const active of this.#active.values()) active.controller.abort();
  }

  run<T>(
    requestKey: string,
    operation: (context: BridgeRequestContext) => Promise<CommandResult<T>>,
    options: BridgeRequestOptions = {},
  ): Promise<BridgeRequestOutcome<T>> {
    if (options.mode === 'share') return this.#runShared(requestKey, operation, options);
    const laneKey = options.mode === 'replace' ? latestOnlyLaneKey(requestKey) : null;
    if (laneKey) return this.#runLatestOnly(laneKey, operation, options);
    return this.#runImmediate(requestKey, operation, options);
  }

  #runShared<T>(
    requestKey: string,
    operation: (context: BridgeRequestContext) => Promise<CommandResult<T>>,
    options: BridgeRequestOptions,
  ): Promise<BridgeRequestOutcome<T>> {
    const existing = this.#shared.get(requestKey);
    if (existing && !existing.controller.signal.aborted) {
      return this.#subscribeShared<T>(existing, options.signal);
    }
    const replacingAbandonedRequest = Boolean(existing);
    if (existing) this.#shared.delete(requestKey);

    const controller = new AbortController();
    const pending = this.#runImmediate(
      requestKey,
      operation,
      replacingAbandonedRequest
        ? { mode: 'replace', signal: controller.signal }
        : { signal: controller.signal },
    );
    const shared: SharedRequest = {
      generation: this.#active.get(requestKey)?.generation ?? 0,
      controller,
      promise: pending as Promise<BridgeRequestOutcome<unknown>>,
      subscribers: 0,
      settled: false,
    };
    this.#shared.set(requestKey, shared);
    const clear = (): void => {
      shared.settled = true;
      if (this.#shared.get(requestKey) === shared) this.#shared.delete(requestKey);
    };
    void pending.then(clear, clear);
    return this.#subscribeShared<T>(shared, options.signal);
  }

  #subscribeShared<T>(
    shared: SharedRequest,
    signal: AbortSignal | undefined,
  ): Promise<BridgeRequestOutcome<T>> {
    shared.subscribers += 1;
    return new Promise<BridgeRequestOutcome<T>>((resolve, reject) => {
      let released = false;
      const release = (cancelUnderlying: boolean): boolean => {
        if (released) return false;
        released = true;
        signal?.removeEventListener('abort', abortSubscriber);
        shared.subscribers = Math.max(0, shared.subscribers - 1);
        if (cancelUnderlying && shared.subscribers === 0 && !shared.settled) {
          shared.controller.abort(signal?.reason);
        }
        return true;
      };
      const abortSubscriber = (): void => {
        if (!release(true)) return;
        resolve({ state: 'stale', generation: shared.generation });
      };

      if (signal?.aborted) {
        abortSubscriber();
        return;
      }
      signal?.addEventListener('abort', abortSubscriber, { once: true });
      void shared.promise.then(
        (outcome) => {
          if (!release(false)) return;
          resolve(outcome as BridgeRequestOutcome<T>);
        },
        (error: unknown) => {
          if (!release(false)) return;
          reject(error instanceof Error ? error : new Error('Shared bridge request failed.'));
        },
      );
    });
  }

  #runLatestOnly<T>(
    laneKey: string,
    operation: (context: BridgeRequestContext) => Promise<CommandResult<T>>,
    options: BridgeRequestOptions,
  ): Promise<BridgeRequestOutcome<T>> {
    const lane = this.#latestOnly.get(laneKey) ?? {
      inFlight: false,
      latestGeneration: 0,
      pending: null,
    };
    this.#latestOnly.set(laneKey, lane);

    const generation = lane.latestGeneration + 1;
    lane.latestGeneration = generation;
    const immediateOptions: BridgeRequestOptions = options.signal ? { signal: options.signal } : {};

    return new Promise<BridgeRequestOutcome<T>>((resolve) => {
      if (lane.pending) {
        lane.pending.resolve({ state: 'stale', generation: lane.pending.generation });
      }
      lane.pending = {
        generation,
        execute: async () =>
          withGeneration(
            await this.#runImmediate(`${laneKey}#${generation}`, operation, immediateOptions),
            generation,
          ) as BridgeRequestOutcome<unknown>,
        resolve: resolve as (outcome: BridgeRequestOutcome<unknown>) => void,
      };
      void this.#drainLatestOnly(laneKey, lane);
    });
  }

  async #drainLatestOnly(laneKey: string, lane: LatestOnlyLane): Promise<void> {
    if (lane.inFlight) return;
    const request = lane.pending;
    if (!request) return;

    lane.pending = null;
    lane.inFlight = true;
    const outcome = await request.execute().catch((error: unknown) => ({
      state: 'failure' as const,
      generation: request.generation,
      requestId: null,
      error: unexpectedFailure(error),
    }));
    const superseded = request.generation !== lane.latestGeneration;
    request.resolve(superseded ? { state: 'stale', generation: request.generation } : outcome);
    lane.inFlight = false;

    if (lane.pending) {
      void this.#drainLatestOnly(laneKey, lane);
      return;
    }
    this.#latestOnly.delete(laneKey);
  }

  async #runImmediate<T>(
    requestKey: string,
    operation: (context: BridgeRequestContext) => Promise<CommandResult<T>>,
    options: BridgeRequestOptions = {},
  ): Promise<BridgeRequestOutcome<T>> {
    const existing = this.#active.get(requestKey);
    if (existing && options.mode !== 'replace') {
      throw new DuplicateBridgeRequestError(requestKey);
    }
    existing?.controller.abort();

    const generation = (existing?.generation ?? 0) + 1;
    const controller = new AbortController();
    const active = { generation, controller };
    this.#active.set(requestKey, active);

    const abortFromExternal = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
      abortFromExternal();
    } else {
      options.signal?.addEventListener('abort', abortFromExternal, { once: true });
    }

    const operationPromise: Promise<SettledOperation<T>> = Promise.resolve()
      .then(() => operation({ signal: controller.signal, generation }))
      .then(
        (result) => ({ kind: 'result' as const, result }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      );
    const aborted = new Promise<{ readonly kind: 'aborted' }>((resolve) => {
      if (controller.signal.aborted) {
        resolve({ kind: 'aborted' });
        return;
      }
      controller.signal.addEventListener('abort', () => resolve({ kind: 'aborted' }), {
        once: true,
      });
    });

    try {
      const settled = await Promise.race([operationPromise, aborted]);
      if (settled.kind === 'aborted') {
        // The caller stops waiting immediately. The underlying IPC may still
        // complete, so its eventual result is consumed but never presented as
        // a successful cancellation or used to mutate Renderer state.
        void operationPromise.then(() => undefined);
        return { state: 'stale', generation };
      }

      const current = this.#active.get(requestKey);
      if (!current || current.generation !== generation) {
        return { state: 'stale', generation };
      }
      if (controller.signal.aborted) {
        return { state: 'stale', generation };
      }
      if (settled.kind === 'error') {
        if (isAbortError(settled.error)) return { state: 'cancelled', generation };
        return {
          state: 'failure',
          generation,
          requestId: null,
          error: unexpectedFailure(settled.error),
        };
      }
      if (settled.result.ok) {
        return {
          state: 'success',
          generation,
          requestId: settled.result.requestId,
          data: settled.result.data,
        };
      }
      return {
        state: 'failure',
        generation,
        requestId: settled.result.requestId,
        error: settled.result.error,
      };
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternal);
      const current = this.#active.get(requestKey);
      if (current?.generation === generation) this.#active.delete(requestKey);
    }
  }
}
