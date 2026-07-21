export type StatusPriority = 'P0' | 'P1' | 'P2' | 'P3';
export type StatusPersistence = 'sticky' | 'transient';

export interface RendererStatus {
  readonly id: string;
  readonly priority: StatusPriority;
  readonly message: string;
  readonly persistence: StatusPersistence;
  readonly createdAt: number;
  readonly replaces?: readonly string[];
}

const priorityRank: Record<StatusPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

function compareStatuses(left: RendererStatus, right: RendererStatus): number {
  const priority = priorityRank[left.priority] - priorityRank[right.priority];
  if (priority !== 0) return priority;

  if (left.persistence !== right.persistence) {
    return left.persistence === 'sticky' ? -1 : 1;
  }

  if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
  return left.id.localeCompare(right.id, 'en');
}

export class RendererStatusArbitrator {
  readonly #statuses = new Map<string, RendererStatus>();

  publish(status: RendererStatus): RendererStatus {
    for (const replacedId of status.replaces ?? []) this.#statuses.delete(replacedId);
    this.#statuses.set(status.id, status);
    return this.current() ?? status;
  }

  clear(statusId: string): boolean {
    return this.#statuses.delete(statusId);
  }

  clearAll(): void {
    this.#statuses.clear();
  }

  current(): RendererStatus | null {
    return this.list()[0] ?? null;
  }

  list(): readonly RendererStatus[] {
    return [...this.#statuses.values()].sort(compareStatuses);
  }
}
