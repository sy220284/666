import type { TaskSnapshot } from '@worldforge/contracts';

export interface TaskBarItem {
  readonly taskId: string;
  readonly taskType: string;
  readonly taskLabel: string;
  readonly projectId: string | null;
  readonly status: 'queued' | 'running';
  readonly stage: string;
  readonly stageLabel: string;
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

const TASK_LABELS: Readonly<Record<string, string>> = {
  'draft.generate': '生成正文建议稿',
  'candidate.diff': '比较建议稿',
  'candidate.apply': '采用建议稿',
  'candidate.merge': '融合建议稿',
  'candidate.rewrite': '生成改写建议稿',
  'state.extract': '分析AI设定建议',
  'validation.run': '运行内容检查',
  'search.rebuild': '重建全文搜索',
  'backup.create': '创建备份',
  'import.commit': '确认导入',
  'export.create': '导出作品',
};

const STAGE_LABELS: Readonly<Record<string, string>> = {
  queued: '等待开始',
  preparing: '正在准备',
  calling_model: '正在调用AI模型',
  streaming: '正在接收内容',
  validating: '正在检查结果',
  persisting: '正在保存',
  applying: '正在应用修改',
  finalizing: '正在完成',
};

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
      taskLabel: authorTaskLabel(snapshot.taskType),
      projectId: snapshot.projectId ?? null,
      status: snapshot.status,
      stage: snapshot.stage,
      stageLabel: authorStageLabel(snapshot.stage),
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

export function authorTaskLabel(taskType: string): string {
  return TASK_LABELS[taskType] ?? '后台任务';
}

export function authorStageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? '处理中';
}
