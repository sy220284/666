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
    <aside className="react-task-bar" data-react-task-bar aria-label="生成任务">
      <strong>
        进行中 {model.runningCount} · 等待开始 {model.queuedCount}
      </strong>
      <div className="react-task-bar__items">
        {model.items.map((item) => (
          <div className="react-task-bar__item" data-foreground={item.foreground} key={item.taskId}>
            <span>
              {item.taskLabel} · {item.stageLabel} · {formatElapsed(item.elapsedMs)}
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
