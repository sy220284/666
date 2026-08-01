import type { FormEvent } from 'react';

import type { ProjectBrief } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand } from '../../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../../presentation/author-error-message.js';
import { lineValues } from '../planning-form-values.js';

export function ProjectBriefEditor({
  brief,
  disabled,
  loading,
  bridge,
  onRefresh,
  onSkip,
  onStatus,
}: {
  readonly brief: ProjectBrief | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly bridge: RendererBridgeAdapter;
  readonly onRefresh: () => Promise<void>;
  readonly onSkip: () => void;
  readonly onStatus: (status: string) => void;
}) {
  const command = useBridgeCommand(onRefresh);
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!brief) return;
    const values = new FormData(event.currentTarget);
    const result = await command.run(() =>
      bridge.planning.updateBrief({
        projectId: brief.projectId,
        concept: String(values.get('concept') ?? ''),
        readingPromise: String(values.get('readingPromise') ?? ''),
        protagonistGoal: String(values.get('protagonistGoal') ?? ''),
        coreConflict: String(values.get('coreConflict') ?? ''),
        endingIntent: String(values.get('endingIntent') ?? ''),
        required: lineValues(values.get('required')),
        forbidden: lineValues(values.get('forbidden')),
      }),
    );
    if (result) onStatus('项目任务书已保存。');
  };

  return (
    <section className="feature-card">
      <div className="feature-card__heading">
        <div>
          <h2>ProjectBrief</h2>
          <p>读者承诺与创作边界。</p>
        </div>
        <button className="quiet-button" data-skip-brief type="button" onClick={onSkip}>
          稍后填写
        </button>
      </div>
      {loading ? <p>正在读取任务书…</p> : null}
      {brief ? (
        <form
          className="stacked-form"
          data-brief-form
          key={brief.updatedAt ?? 'empty'}
          onSubmit={(event) => void submit(event)}
        >
          <label>
            核心概念
            <textarea name="concept" defaultValue={brief.concept} />
          </label>
          <label>
            阅读承诺
            <textarea name="readingPromise" defaultValue={brief.readingPromise} />
          </label>
          <label>
            主角目标
            <textarea name="protagonistGoal" defaultValue={brief.protagonistGoal} />
          </label>
          <label>
            核心冲突
            <textarea name="coreConflict" defaultValue={brief.coreConflict} />
          </label>
          <label>
            结局意图
            <textarea name="endingIntent" defaultValue={brief.endingIntent} />
          </label>
          <div className="two-column-form">
            <label>
              必须出现
              <textarea name="required" defaultValue={brief.required.join('\n')} />
            </label>
            <label>
              禁止事项
              <textarea name="forbidden" defaultValue={brief.forbidden.join('\n')} />
            </label>
          </div>
          <button
            className="primary-button"
            data-save-brief
            disabled={disabled || command.pending}
            type="submit"
          >
            保存任务书
          </button>
          {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
