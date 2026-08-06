interface CachedPromiseEntry {
  readonly fingerprint: string;
  readonly promise: Promise<unknown>;
  settled: boolean;
}

export class IdempotentRequestConflictError extends Error {
  readonly code = 'IDEMPOTENT_REQUEST_CONFLICT';
  readonly requestId: string;

  constructor(requestId: string) {
    super('The requestId was already used with a different command identity.');
    this.name = 'IdempotentRequestConflictError';
    this.requestId = requestId;
  }
}

export class BoundedIdempotentPromiseCache {
  readonly #maximumRetainedResults: number;
  readonly #entries = new Map<string, CachedPromiseEntry>();

  constructor(maximumRetainedResults = 1_000) {
    if (!Number.isInteger(maximumRetainedResults) || maximumRetainedResults < 1) {
      throw new Error('IDEMPOTENT_PROMISE_CACHE_LIMIT_INVALID');
    }
    this.#maximumRetainedResults = maximumRetainedResults;
  }

  get size(): number {
    return this.#entries.size;
  }

  get<T>(requestId: string, fingerprint: string): Promise<T> | undefined {
    const entry = this.#entries.get(requestId);
    if (!entry) return undefined;
    if (entry.fingerprint !== fingerprint) throw new IdempotentRequestConflictError(requestId);
    return entry.promise as Promise<T>;
  }

  remember<T>(requestId: string, fingerprint: string, promise: Promise<T>): Promise<T> {
    const existing = this.get<T>(requestId, fingerprint);
    if (existing) return existing;

    const entry: CachedPromiseEntry = { fingerprint, promise, settled: false };
    this.#entries.set(requestId, entry);
    void promise.then(
      () => {
        if (this.#entries.get(requestId) !== entry) return;
        entry.settled = true;
        this.#trimSettledResults();
      },
      () => {
        if (this.#entries.get(requestId) === entry) this.#entries.delete(requestId);
      },
    );
    this.#trimSettledResults();
    return promise;
  }

  clear(): void {
    this.#entries.clear();
  }

  #trimSettledResults(): void {
    while (this.#entries.size > this.#maximumRetainedResults) {
      const settled = [...this.#entries.entries()].find(([, entry]) => entry.settled);
      if (!settled) return;
      this.#entries.delete(settled[0]);
    }
  }
}
