import type { TaskSnapshot } from '@worldforge/contracts';

export interface TaskBarItem {
  readonly taskId: string;
  readonly taskType: string;
  readonly projectId: string | null;
  readonly status: 'queued' | 'running';
  readonly stage: string;
  readonly elapsedMs: number;
  readonly cancellable: true;
  readonly foreground: boolean;
}

export interface TaskBarModel {
  readonly visible: boolean;
  readonly activeCount: number;
  readonly runningCount: number;
  readonly queuedCount: number;
  readonly items: readonly TaskBarItem[];
}

export function createTaskBarModel(
  snapshots: readonly TaskSnapshot[],
  foregroundTaskId: string | null,
): TaskBarModel {
  const items = snapshots
    .filter(
      (snapshot): snapshot is TaskSnapshot & { status: 'queued' | 'running' } =>
        snapshot.status === 'queued' || snapshot.status === 'running',
    )
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === 'running' ? -1 : 1;
      return Date.parse(left.startedAt) - Date.parse(right.startedAt);
    })
    .map((snapshot) => ({
      taskId: snapshot.taskId,
      taskType: snapshot.taskType,
      projectId: snapshot.projectId ?? null,
      status: snapshot.status,
      stage: snapshot.stage,
      elapsedMs: snapshot.elapsedMs,
      cancellable: true,
      foreground: snapshot.taskId === foregroundTaskId,
    })) satisfies TaskBarItem[];

  const runningCount = items.filter((item) => item.status === 'running').length;
  const queuedCount = items.length - runningCount;

  return {
    visible: items.length > 0,
    activeCount: items.length,
    runningCount,
    queuedCount,
    items,
  };
}
