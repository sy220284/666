import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type { ProjectBrief } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import type { AppDisclosureMode } from '../../shell/app-shell-model.js';
import {
  PlanningWorkbench as ProfessionalPlanningWorkbench,
  StructureNavigator,
} from './professional-planning-workbench.js';

export { StructureNavigator };

interface PlanningModeWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly disclosureMode?: AppDisclosureMode;
  readonly onClose: () => void;
}

/**
 * M3-01 uses one authoritative ProjectBrief model with two disclosure levels.
 * Beginner mode asks four focused questions. Professional mode opens the full
 * three-column planning surface without creating a second data model.
 */
export function PlanningModeWorkbench({
  bridge,
  projectId,
  readOnly,
  disclosureMode,
  onClose,
}: PlanningModeWorkbenchProps) {
  const initialMode = disclosureMode ?? currentDisclosureMode();
  const [professional, setProfessional] = useState(initialMode === 'professional');

  useEffect(() => {
    if (disclosureMode) setProfessional(disclosureMode === 'professional');
  }, [disclosureMode]);

  if (professional) {
    return (
      <section data-planning-disclosure="professional">
        <div className="planning-disclosure-bar">
          <div>
            <strong>专业规划模式</strong>
            <span>完整大纲树、卷章、SceneBeat和全部任务书字段。</span>
          </div>
          <button
            className="quiet-button"
            data-planning-mode="beginner"
            type="button"
            onClick={() => setProfessional(false)}
          >
            切换到引导模式
          </button>
        </div>
        <ProfessionalPlanningWorkbench
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          onClose={onClose}
        />
      </section>
    );
  }

  return (
    <BeginnerPlanningQuestions
      bridge={bridge}
      projectId={projectId}
      readOnly={readOnly}
      onClose={onClose}
      onOpenProfessional={() => setProfessional(true)}
    />
  );
}

function BeginnerPlanningQuestions({
  bridge,
  projectId,
  readOnly,
  onClose,
  onOpenProfessional,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onClose: () => void;
  readonly onOpenProfessional: () => void;
}) {
  const load = useCallback(
    () => bridge.planning.getBrief(projectId, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`beginner-brief:${projectId}`, load);
  const command = useBridgeCommand(resource.refresh);
  const [skipped, setSkipped] = useState(false);
  const [status, setStatus] = useState('先回答四个问题即可开始写作，其他字段可以以后补充。');

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const brief = resource.data;
    if (!brief) return;
    const values = new FormData(event.currentTarget);
    const result = await command.run(() =>
      bridge.planning.updateBrief({
        projectId,
        concept: String(values.get('concept') ?? ''),
        readingPromise: String(values.get('readingPromise') ?? ''),
        protagonistGoal: String(values.get('protagonistGoal') ?? ''),
        coreConflict: String(values.get('coreConflict') ?? ''),
        endingIntent: brief.endingIntent,
        required: brief.required,
        forbidden: brief.forbidden,
      }),
    );
    if (result) setStatus('四项核心任务书已保存；专业字段原值保持不变。');
  };

  return (
    <section
      className="beginner-planning-workbench"
      data-planning-dialog
      data-planning-disclosure="beginner"
      aria-label="引导式规划"
    >
      <header className="feature-heading">
        <div>
          <p className="eyebrow">Planning · Beginner</p>
          <h1>用四个问题建立作品方向</h1>
          <p>引导模式只减少当前显示字段，ProjectBrief仍是同一份Core权威数据。</p>
        </div>
        <div className="feature-heading__actions">
          <button
            className="quiet-button"
            data-planning-mode="professional"
            type="button"
            onClick={onOpenProfessional}
          >
            打开完整规划
          </button>
          <button className="quiet-button" type="button" onClick={onClose}>
            返回写作
          </button>
        </div>
      </header>

      <p className="feature-status" data-planning-status role="status">
        {resource.error
          ? `任务书读取失败 · ${resource.error.code}`
          : resource.state === 'cancelled'
            ? '任务书读取已取消。'
            : command.error
              ? `任务书保存失败 · ${command.error.code}`
              : status}
      </p>

      {skipped ? (
        <section className="feature-card beginner-planning-skip" data-brief-skipped>
          <h2>已暂时跳过任务书</h2>
          <p>可以直接进入写作；已有内容没有被清空。</p>
          <button type="button" data-restore-brief onClick={() => setSkipped(false)}>
            继续回答
          </button>
        </section>
      ) : (
        <BeginnerBriefForm
          brief={resource.data}
          disabled={readOnly || command.pending}
          loading={resource.state === 'loading'}
          onSave={save}
          onSkip={() => setSkipped(true)}
        />
      )}
    </section>
  );
}

function BeginnerBriefForm({
  brief,
  disabled,
  loading,
  onSave,
  onSkip,
}: {
  readonly brief: ProjectBrief | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onSave: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  readonly onSkip: () => void;
}) {
  if (loading) return <p>正在读取任务书…</p>;
  if (!brief) return <p>任务书暂不可用。</p>;

  return (
    <form
      className="beginner-question-form"
      data-brief-form
      key={brief.updatedAt ?? 'empty'}
      onSubmit={(event) => void onSave(event)}
    >
      <label>
        <strong>1. 这本书最核心的想法是什么？</strong>
        <span>用一两句话写清故事独特之处。</span>
        <textarea name="concept" defaultValue={brief.concept} />
      </label>
      <label>
        <strong>2. 读者持续追读时，会得到什么体验？</strong>
        <span>例如谜团升级、情感推进、成长或持续爽点。</span>
        <textarea name="readingPromise" defaultValue={brief.readingPromise} />
      </label>
      <label>
        <strong>3. 主角最想完成什么？</strong>
        <span>写清可行动、可失败、能推动长篇的目标。</span>
        <textarea name="protagonistGoal" defaultValue={brief.protagonistGoal} />
      </label>
      <label>
        <strong>4. 谁或什么长期阻止主角？</strong>
        <span>描述最核心的对抗关系和代价。</span>
        <textarea name="coreConflict" defaultValue={brief.coreConflict} />
      </label>
      <div className="inline-actions">
        <button
          className="primary-button"
          data-save-brief
          disabled={disabled}
          type="submit"
        >
          保存四项核心方向
        </button>
        <button data-skip-brief type="button" onClick={onSkip}>
          稍后填写
        </button>
      </div>
    </form>
  );
}

function currentDisclosureMode(): AppDisclosureMode {
  return document.body.dataset.authorMode === 'professional' ? 'professional' : 'beginner';
}
