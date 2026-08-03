interface TaskGapRecoveryState {
  dirty: boolean;
}

export class TaskGapRecoveryCoordinator {
  readonly #active = new Map<string, TaskGapRecoveryState>();
  #closed = false;

  begin(taskId: string): boolean {
    if (this.#closed) return false;
    const active = this.#active.get(taskId);
    if (active) {
      active.dirty = true;
      return false;
    }
    this.#active.set(taskId, { dirty: false });
    return true;
  }

  async run(taskId: string, recover: () => Promise<boolean>): Promise<void> {
    const active = this.#active.get(taskId);
    if (!active || this.#closed) return;
    try {
      do {
        active.dirty = false;
        if (!(await recover()) || this.#closed) return;
      } while (active.dirty);
    } finally {
      if (this.#active.get(taskId) === active) this.#active.delete(taskId);
    }
  }

  clear(): void {
    this.#closed = true;
    this.#active.clear();
  }
}
