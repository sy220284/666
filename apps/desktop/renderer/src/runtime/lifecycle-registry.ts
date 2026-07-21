export type LifecycleCleanup = () => void | Promise<void>;

interface LifecycleEntry {
  readonly owner: string;
  readonly cleanup: LifecycleCleanup;
}

export class RendererLifecycleRegistry {
  readonly #entries = new Map<string, LifecycleEntry>();

  get size(): number {
    return this.#entries.size;
  }

  register(owner: string, registrationId: string, cleanup: LifecycleCleanup): () => Promise<void> {
    if (this.#entries.has(registrationId)) {
      throw new Error(`Lifecycle registration already exists: ${registrationId}`);
    }
    this.#entries.set(registrationId, { owner, cleanup });
    return () => this.dispose(registrationId);
  }

  async dispose(registrationId: string): Promise<void> {
    const entry = this.#entries.get(registrationId);
    if (!entry) return;
    this.#entries.delete(registrationId);
    await entry.cleanup();
  }

  async disposeOwner(owner: string): Promise<void> {
    const registrations = [...this.#entries.entries()]
      .filter(([, entry]) => entry.owner === owner)
      .map(([registrationId]) => registrationId);
    const results = await Promise.allSettled(
      registrations.map((registrationId) => this.dispose(registrationId)),
    );
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, `Lifecycle cleanup failed for owner ${owner}.`);
    }
  }

  async disposeAll(): Promise<void> {
    const registrations = [...this.#entries.keys()];
    const results = await Promise.allSettled(
      registrations.map((registrationId) => this.dispose(registrationId)),
    );
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Renderer lifecycle cleanup failed.');
    }
  }
}
