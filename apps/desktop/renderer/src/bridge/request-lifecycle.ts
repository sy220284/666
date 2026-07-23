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
  readonly mode?: 'reject' | 'replace';
  readonly signal?: AbortSignal;
}

interface ActiveRequest {
  readonly generation: number;
  readonly controller: AbortController;
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

export class BridgeRequestCoordinator {
  readonly #active = new Map<string, ActiveRequest>();

  isPending(requestKey: string): boolean {
    return this.#active.has(requestKey);
  }

  cancel(requestKey: string): boolean {
    const active = this.#active.get(requestKey);
    if (!active) return false;
    active.controller.abort();
    return true;
  }

  cancelAll(): void {
    for (const active of this.#active.values()) active.controller.abort();
  }

  async run<T>(
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
