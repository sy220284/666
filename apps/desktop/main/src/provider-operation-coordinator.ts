interface RetainedOperation {
  readonly promise: Promise<unknown>;
  settled: boolean;
}

/**
 * Serializes operations for one Provider while preserving concurrency across different Providers.
 * Mutation results, including failures, are retained by requestId and operation key so retries
 * cannot repeat partial credential or database side effects. Pending entries are never evicted.
 */
export class ProviderOperationCoordinator {
  readonly #maximumRetainedResults: number;
  readonly #providerTails = new Map<string, Promise<void>>();
  readonly #retainedMutations = new Map<string, RetainedOperation>();

  constructor(maximumRetainedResults = 1_000) {
    if (!Number.isSafeInteger(maximumRetainedResults) || maximumRetainedResults < 1) {
      throw new Error('PROVIDER_COORDINATOR_LIMIT_INVALID');
    }
    this.#maximumRetainedResults = maximumRetainedResults;
  }

  runMutation<T>(
    providerId: string,
    requestId: string,
    operationKey: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const idempotencyKey = `${providerId}:${operationKey}:${requestId}`;
    const retained = this.#retainedMutations.get(idempotencyKey);
    if (retained) return retained.promise as Promise<T>;

    const promise = this.#enqueue(providerId, operation);
    const entry: RetainedOperation = { promise, settled: false };
    this.#retainedMutations.set(idempotencyKey, entry);
    void promise.then(
      () => {
        entry.settled = true;
        this.#trimRetained();
      },
      () => {
        entry.settled = true;
        this.#trimRetained();
      },
    );
    this.#trimRetained();
    return promise;
  }

  runExclusive<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    return this.#enqueue(providerId, operation);
  }

  get retainedMutationCount(): number {
    return this.#retainedMutations.size;
  }

  #enqueue<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.#providerTails.get(providerId) ?? Promise.resolve();
    const result = previous.then(operation, operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#providerTails.set(providerId, tail);
    void tail.finally(() => {
      if (this.#providerTails.get(providerId) === tail) this.#providerTails.delete(providerId);
    });
    return result;
  }

  #trimRetained(): void {
    while (this.#retainedMutations.size > this.#maximumRetainedResults) {
      const settled = [...this.#retainedMutations.entries()].find(([, entry]) => entry.settled);
      if (!settled) return;
      this.#retainedMutations.delete(settled[0]);
    }
  }
}
