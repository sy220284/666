interface CachedPromiseEntry {
  readonly promise: Promise<unknown>;
  settled: boolean;
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

  get<T>(requestId: string): Promise<T> | undefined {
    return this.#entries.get(requestId)?.promise as Promise<T> | undefined;
  }

  remember<T>(requestId: string, promise: Promise<T>): Promise<T> {
    const existing = this.get<T>(requestId);
    if (existing) return existing;

    const entry: CachedPromiseEntry = { promise, settled: false };
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
