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

export type RendererPendingOwner = (pending: boolean) => void;

const MAX_RETAINED_LATEST_TOKENS = 512;
const ownerCoordinators = new WeakMap<object, RendererCommandCoordinator>();

export function rendererCommandCoordinatorFor(
  owner: RendererPendingOwner,
): RendererCommandCoordinator {
  const existing = ownerCoordinators.get(owner);
  if (existing) return existing;
  const coordinator = new RendererCommandCoordinator(owner);
  ownerCoordinators.set(owner, coordinator);
  return coordinator;
}

export class RendererCommandCoordinator {
  readonly #active = new Map<string, ActiveCommand>();
  readonly #latestTokens = new Map<string, number>();
  readonly #onActiveChange: RendererPendingOwner | null;
  #nextToken = 0;
  #reportedActive = false;

  constructor(onActiveChange: RendererPendingOwner | null = null) {
    this.#onActiveChange = onActiveChange;
  }

  get activeCount(): number {
    return this.#active.size;
  }

  get retainedTokenCount(): number {
    return this.#latestTokens.size;
  }

  isActive(key: string): boolean {
    return this.#active.has(key);
  }

  currentToken(key: string): number | null {
    return this.#active.get(key)?.token ?? null;
  }

  isLatest(key: string, token: number): boolean {
    return this.#latestTokens.get(key) === token;
  }

  invalidate(key: string): boolean {
    const existed = this.#active.delete(key);
    const token = this.#nextToken + 1;
    this.#nextToken = token;
    this.#rememberLatest(key, token);
    this.#notifyActiveChange();
    return existed;
  }

  invalidatePrefix(prefix: string): number {
    const keys = new Set(
      [...this.#latestTokens.keys(), ...this.#active.keys()].filter((key) =>
        key.startsWith(prefix),
      ),
    );
    for (const key of keys) this.invalidate(key);
    return keys.size;
  }

  invalidateAll(): void {
    const keys = new Set([...this.#latestTokens.keys(), ...this.#active.keys()]);
    for (const key of keys) this.invalidate(key);
  }

  #rememberLatest(key: string, token: number): void {
    this.#latestTokens.delete(key);
    this.#latestTokens.set(key, token);
    this.#trimRetainedTokens();
  }

  #trimRetainedTokens(): void {
    while (this.#latestTokens.size > MAX_RETAINED_LATEST_TOKENS) {
      const removable = [...this.#latestTokens.keys()].find(
        (candidate) => !this.#active.has(candidate),
      );
      if (!removable) return;
      this.#latestTokens.delete(removable);
    }
  }

  #notifyActiveChange(): void {
    const active = this.#active.size > 0;
    if (active === this.#reportedActive) return;
    this.#reportedActive = active;
    this.#onActiveChange?.(active);
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
    this.#rememberLatest(input.key, token);
    this.#notifyActiveChange();

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
        if (scope.isCurrent()) {
          this.#active.delete(input.key);
          this.#notifyActiveChange();
        }
        this.#trimRetainedTokens();
      });
    active.promise = promise as Promise<RendererCommandResult<unknown>>;
    return promise;
  }
}
