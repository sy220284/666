export class RequestGeneration {
  #current = 0;

  begin(): number {
    this.#current += 1;
    return this.#current;
  }

  invalidate(): void {
    this.#current += 1;
  }

  isCurrent(generation: number): boolean {
    return generation === this.#current;
  }
}

/**
 * 为同一界面内相互独立的异步能力维护隔离的请求代次。
 * 同一通道的后发请求会使先发响应失效，不同通道不会相互干扰。
 */
export class RequestGenerationGroup<Key extends string> {
  readonly #requests = new Map<Key, RequestGeneration>();
  readonly #active = new Map<Key, number>();

  begin(key: Key): number {
    const generation = this.#request(key).begin();
    this.#active.set(key, generation);
    return generation;
  }

  complete(key: Key, generation: number): boolean {
    if (!this.isCurrent(key, generation) || this.#active.get(key) !== generation) return false;
    this.#active.delete(key);
    return true;
  }

  invalidate(key: Key): void {
    this.#request(key).invalidate();
    this.#active.delete(key);
  }

  invalidateAll(): void {
    for (const request of this.#requests.values()) request.invalidate();
    this.#active.clear();
  }

  isCurrent(key: Key, generation: number): boolean {
    return this.#request(key).isCurrent(generation);
  }

  isActive(key: Key): boolean {
    return this.#active.has(key);
  }

  #request(key: Key): RequestGeneration {
    const existing = this.#requests.get(key);
    if (existing) return existing;
    const created = new RequestGeneration();
    this.#requests.set(key, created);
    return created;
  }
}
