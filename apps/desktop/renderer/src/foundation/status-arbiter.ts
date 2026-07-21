export type StatusPriority = 'P0' | 'P1' | 'P2' | 'P3';

export type StatusSignal = Readonly<{
  id: string;
  priority: StatusPriority;
  message: string;
  createdAt: number;
  persistent: boolean;
}>;

const priorityWeight: Readonly<Record<StatusPriority, number>> = {
  P0: 4,
  P1: 3,
  P2: 2,
  P3: 1,
};

export function arbitrateStatus(signals: readonly StatusSignal[]): StatusSignal | null {
  return (
    [...signals].sort((left, right) => {
      const priority = priorityWeight[right.priority] - priorityWeight[left.priority];
      if (priority !== 0) return priority;
      if (left.persistent !== right.persistent) return left.persistent ? -1 : 1;
      const recency = right.createdAt - left.createdAt;
      if (recency !== 0) return recency;
      return left.id.localeCompare(right.id);
    })[0] ?? null
  );
}
