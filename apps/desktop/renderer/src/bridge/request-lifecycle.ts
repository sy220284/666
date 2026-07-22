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
  readonly #generations = new Map<string, number>();

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

    const generation = (this.#generations.get(requestKey) ?? 0) + 1;
    this.#generations.set(requestKey, generation);
    const controller = new AbortController();
    const active = { generation, controller };
    this.#active.set(requestKey, active);

    const abortFromExternal = (): void => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) {
      abortFromExternal();
    } else {
      options.signal?.addEventListener('abort', abortFromExternal, {
        once: true,
      });
    }

    try {
      const result = await operation({ signal: controller.signal, generation });
      const current = this.#active.get(requestKey);
      if (!current || current.generation !== generation) {
        return { state: 'stale', generation };
      }
      if (controller.signal.aborted) {
        // The underlying IPC completed despite the local abort. Its side effects
        // are unknown, so do not claim that the operation was cancelled.
        return { state: 'stale', generation };
      }
      if (result.ok) {
        return {
          state: 'success',
          generation,
          requestId: result.requestId,
          data: result.data,
        };
      }
      return {
        state: 'failure',
        generation,
        requestId: result.requestId,
        error: result.error,
      };
    } catch (error) {
      const current = this.#active.get(requestKey);
      if (!current || current.generation !== generation) {
        return { state: 'stale', generation };
      }
      if (controller.signal.aborted || isAbortError(error)) {
        return { state: 'cancelled', generation };
      }
      return {
        state: 'failure',
        generation,
        requestId: null,
        error: unexpectedFailure(error),
      };
    } finally {
      options.signal?.removeEventListener('abort', abortFromExternal);
      const current = this.#active.get(requestKey);
      if (current?.generation === generation) this.#active.delete(requestKey);
    }
  }
}
