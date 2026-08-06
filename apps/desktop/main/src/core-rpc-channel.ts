import type { CoreEvent } from '@worldforge/contracts';

export type CoreRpcRequestState =
  'response' | 'timeout' | 'send-failed' | 'conflict' | 'disconnected';

export type CoreRpcRequestResult =
  | { readonly state: 'response'; readonly event: CoreEvent }
  | { readonly state: Exclude<CoreRpcRequestState, 'response'>; readonly error?: unknown };

export interface CoreRpcRequest {
  readonly key: string;
  readonly timeoutMs: number;
  readonly matches: (event: CoreEvent) => boolean;
  readonly send: () => void;
}

interface PendingRequest {
  readonly matches: (event: CoreEvent) => boolean;
  readonly settle: (result: CoreRpcRequestResult) => void;
  readonly timer: NodeJS.Timeout;
}

export class CoreRpcChannel {
  readonly #pending = new Map<string, PendingRequest>();

  get pendingCount(): number {
    return this.#pending.size;
  }

  request(input: CoreRpcRequest): Promise<CoreRpcRequestResult> {
    if (this.#pending.has(input.key)) {
      return Promise.resolve({ state: 'conflict' });
    }

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: CoreRpcRequestResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(pending.timer);
        if (this.#pending.get(input.key) === pending) this.#pending.delete(input.key);
        resolve(result);
      };
      const pending: PendingRequest = {
        matches: input.matches,
        settle,
        timer: setTimeout(() => settle({ state: 'timeout' }), input.timeoutMs),
      };
      this.#pending.set(input.key, pending);

      try {
        input.send();
      } catch (error) {
        settle({ state: 'send-failed', error });
      }
    });
  }

  accept(event: CoreEvent): boolean {
    for (const pending of this.#pending.values()) {
      if (!pending.matches(event)) continue;
      pending.settle({ state: 'response', event });
      return true;
    }
    return false;
  }

  disconnect(): void {
    for (const pending of [...this.#pending.values()]) {
      pending.settle({ state: 'disconnected' });
    }
  }
}
