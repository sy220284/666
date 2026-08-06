export type RendererCommandPolicy = 'replace' | 'join' | 'reject';

export interface RendererCommandScope {
  readonly key: string;
  readonly token: number;
  isCurrent(): boolean;
}

export type RendererCommandResult<Value> =
  | {
      readonly state: 'completed';
      readonly key: string;
      readonly token: number;
      readonly value: Value;
    }
  | {
      readonly state: 'failed';
      readonly key: string;
      readonly token: number;
      readonly error: unknown;
    }
  | {
      readonly state: 'stale';
      readonly key: string;
      readonly token: number;
    }
  | {
      readonly state: 'rejected';
      readonly key: string;
      readonly token: number;
    };

export interface RendererCommandInput<Value> {
  readonly key: string;
  readonly policy?: RendererCommandPolicy;
  readonly operation: (scope: RendererCommandScope) => Promise<Value>;
}

interface ActiveCommand {
  readonly token: number;
  promise: Promise<RendererCommandResult<unknown>>;
}

const ownerCoordinators = new WeakMap<object, RendererCommandCoordinator>();

export function rendererCommandCoordinatorFor(owner: object): RendererCommandCoordinator {
  const existing = ownerCoordinators.get(owner);
  if (existing) return existing;
  const coordinator = new RendererCommandCoordinator();
  ownerCoordinators.set(owner, coordinator);
  return coordinator;
}

export class RendererCommandCoordinator {
  readonly #active = new Map<string, ActiveCommand>();
  readonly #latestTokens = new Map<string, number>();
  #nextToken = 0;

  isActive(key: string): boolean {
    return this.#active.has(key);
  }

  currentToken(key: string): number | null {
    return this.#active.get(key)?.token ?? null;
  }

  isLatest(key: string, token: number): boolean {
    return this.#latestTokens.get(key) === token;
  }

  run<Value>(input: RendererCommandInput<Value>): Promise<RendererCommandResult<Value>> {
    const existing = this.#active.get(input.key);
    const policy = input.policy ?? 'replace';
    if (existing && policy === 'join') {
      return existing.promise as Promise<RendererCommandResult<Value>>;
    }
    if (existing && policy === 'reject') {
      return Promise.resolve({
        state: 'rejected',
        key: input.key,
        token: existing.token,
      });
    }

    const token = this.#nextToken + 1;
    this.#nextToken = token;
    this.#latestTokens.set(input.key, token);
    const active: ActiveCommand = {
      token,
      promise: Promise.resolve({ state: 'stale', key: input.key, token }),
    };
    const scope: RendererCommandScope = {
      key: input.key,
      token,
      isCurrent: () => this.#active.get(input.key) === active,
    };
    this.#active.set(input.key, active);

    const promise = Promise.resolve()
      .then(() => input.operation(scope))
      .then(
        (value): RendererCommandResult<Value> =>
          scope.isCurrent()
            ? { state: 'completed', key: input.key, token, value }
            : { state: 'stale', key: input.key, token },
        (error: unknown): RendererCommandResult<Value> =>
          scope.isCurrent()
            ? { state: 'failed', key: input.key, token, error }
            : { state: 'stale', key: input.key, token },
      )
      .finally(() => {
        if (scope.isCurrent()) this.#active.delete(input.key);
      });
    active.promise = promise as Promise<RendererCommandResult<unknown>>;
    return promise;
  }
}
