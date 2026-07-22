import type { TaskSnapshot } from '@worldforge/contracts';

import { createTaskBarModel } from '../shell/task-bar-model.js';

export interface TaskBarProps {
  readonly tasks: readonly TaskSnapshot[];
  readonly foregroundTaskId: string | null;
  readonly onCancel: (taskId: string, projectId: string | null) => void;
}

export function TaskBar({ tasks, foregroundTaskId, onCancel }: TaskBarProps) {
  const model = createTaskBarModel(tasks, foregroundTaskId);
  if (!model.visible) return null;

  return (
    <aside className="react-task-bar" data-react-task-bar aria-label="运行任务">
      <strong>
        运行任务 {model.runningCount} · 排队 {model.queuedCount}
      </strong>
      <div className="react-task-bar__items">
        {model.items.map((item) => (
          <div className="react-task-bar__item" data-foreground={item.foreground} key={item.taskId}>
            <span>
              {item.taskType} · {item.stage} · {formatElapsed(item.elapsedMs)}
            </span>
            <button
              className="quiet-button"
              type="button"
              onClick={() => onCancel(item.taskId, item.projectId)}
            >
              取消任务
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function formatElapsed(elapsedMs: number): string {
  const seconds = Math.max(0, Math.round(elapsedMs / 1_000));
  if (seconds < 60) return `${seconds}秒`;
  return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
}
