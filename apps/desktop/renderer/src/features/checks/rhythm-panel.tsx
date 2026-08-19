import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { RhythmDashboard } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { useUnsavedChangesGuard } from '../../runtime/unsaved-changes.js';

export function RhythmPanel({
  bridge,
  projectId,
  readOnly,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
}) {
  const [dashboard, setDashboard] = useState<RhythmDashboard | null>(null);
  const [notice, setNotice] = useState('所有节奏结果均为 P3 建议，不阻断写作、定稿或导出。');
  const [pending, setPending] = useState(false);
  const operation = useRef({ busy: false, epoch: 0 });
  const unsaved = useUnsavedChangesGuard('节奏配置');

  useEffect(() => {
    let active = true;
    operation.current.epoch += 1;
    operation.current.busy = false;
    setPending(false);
    const epoch = operation.current.epoch;
    void bridge.rhythm.get({ projectId }, { mode: 'replace' }).then((outcome) => {
      if (!active || operation.current.epoch !== epoch) return;
      if (outcome.state === 'success') setDashboard(outcome.data);
      else if (outcome.state === 'failure')
        setNotice(`节奏读取失败 · ${authorErrorSummary(outcome.error)}`);
    });
    return () => {
      active = false;
      operation.current.epoch += 1;
      operation.current.busy = false;
    };
  }, [bridge, projectId]);

  const beginOperation = (): number | null => {
    if (operation.current.busy) return null;
    operation.current.busy = true;
    setPending(true);
    return operation.current.epoch;
  };

  const finishOperation = (epoch: number): void => {
    if (operation.current.epoch !== epoch) return;
    operation.current.busy = false;
    setPending(false);
  };

  const recalculate = async (): Promise<void> => {
    const epoch = beginOperation();
    if (epoch === null) return;
    try {
      const outcome = await bridge.rhythm.run({ projectId });
      if (operation.current.epoch !== epoch) return;
      if (outcome.state === 'success') {
        setDashboard(outcome.data);
        setNotice('节奏指标已重新计算。');
      } else if (outcome.state === 'failure') {
        setNotice(`节奏重新计算失败 · ${authorErrorSummary(outcome.error)}`);
      }
    } finally {
      finishOperation(epoch);
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!dashboard || readOnly) return;
    const epoch = beginOperation();
    if (epoch === null) return;
    const values = new FormData(event.currentTarget);
    try {
      const outcome = await bridge.rhythm.updateProfile({
        projectId,
        authority: 'author',
        enabled: values.get('enabled') === 'on',
        excitementMinPer1000: Number(values.get('minimum')),
        excitementMaxPer1000: Number(values.get('maximum')),
        hookEnabled: values.get('hookEnabled') === 'on',
        goldenThreeEnabled: values.get('goldenThreeEnabled') === 'on',
        targetDailyCharacters: Number(values.get('targetDailyCharacters')),
        idleThresholdSeconds: Number(values.get('idleThresholdSeconds')),
        timeZone: String(values.get('timeZone')),
      });
      if (operation.current.epoch !== epoch) return;
      if (outcome.state === 'success') {
        unsaved.clearDirty();
        setDashboard(outcome.data);
        setNotice('节奏参考区间与统计口径已保存。');
      } else if (outcome.state === 'failure') {
        setNotice(`节奏配置保存失败 · ${authorErrorSummary(outcome.error)}`);
      }
    } finally {
      finishOperation(epoch);
    }
  };

  if (!dashboard) {
    return (
      <section className="feature-card">
        <h2>网文节奏与连载指标</h2>
        <p>{notice}</p>
      </section>
    );
  }
  return (
    <section className="feature-card" data-rhythm-dashboard>
      <div className="feature-card__heading">
        <div>
          <h2>网文节奏与连载指标</h2>
          <p>{notice}</p>
        </div>
        <button disabled={pending} type="button" onClick={() => void recalculate()}>
          重新计算
        </button>
      </div>
      <p>
        今日人工净增 {dashboard.today.manualNetCharacters} 字 · 有效输入{' '}
        {Math.round(dashboard.today.effectiveSeconds / 60)} 分钟 · 累计人工净增{' '}
        {dashboard.cumulativeManualNetCharacters} 字
      </p>
      <p>
        统计从 {new Date(dashboard.profile.statisticsStartedAt).toLocaleString()} 开始；只计入
        manual_edit，AI采用、导入、安全替换、结构、恢复和系统变更均排除。
      </p>
      <form
        className="form-grid"
        data-unsaved={unsaved.dirty ? 'true' : 'false'}
        key={`${projectId}:${dashboard.profile.statisticsStartedAt}`}
        onChange={unsaved.markDirty}
        onSubmit={(event) => void save(event)}
      >
        <label>
          <input defaultChecked={dashboard.profile.enabled} name="enabled" type="checkbox" />
          启用节奏建议
        </label>
        <label>
          爽点密度下限/千字
          <input
            defaultValue={dashboard.profile.excitementMinPer1000}
            min="0"
            name="minimum"
            step="0.1"
            type="number"
          />
        </label>
        <label>
          爽点密度上限/千字
          <input
            defaultValue={dashboard.profile.excitementMaxPer1000}
            min="0"
            name="maximum"
            step="0.1"
            type="number"
          />
        </label>
        <label>
          <input
            defaultChecked={dashboard.profile.hookEnabled}
            name="hookEnabled"
            type="checkbox"
          />
          章末钩子建议
        </label>
        <label>
          <input
            defaultChecked={dashboard.profile.goldenThreeEnabled}
            name="goldenThreeEnabled"
            type="checkbox"
          />
          黄金三章建议
        </label>
        <label>
          每日人工目标
          <input
            defaultValue={dashboard.profile.targetDailyCharacters}
            min="0"
            name="targetDailyCharacters"
            type="number"
          />
        </label>
        <label>
          空闲阈值（秒）
          <input
            defaultValue={dashboard.profile.idleThresholdSeconds}
            min="30"
            max="7200"
            name="idleThresholdSeconds"
            type="number"
          />
        </label>
        <label>
          时区
          <input defaultValue={dashboard.profile.timeZone} name="timeZone" />
        </label>
        <button disabled={readOnly || pending} type="submit">
          保存配置
        </button>
      </form>
      <div className="ledger-list">
        {dashboard.chapters.map((chapter) => (
          <article className="ledger-record" key={chapter.chapterId}>
            <h3>
              第 {chapter.ordinal} 章 · {chapter.title}
            </h3>
            <p>
              {chapter.characterCount} 字 · 爽点/转折 {chapter.excitementPer1000.toFixed(2)}/千字 ·
              章末钩子 {chapter.endingHookDetected ? '已识别' : '未识别'}
              {chapter.inGoldenThree ? ' · 黄金三章' : ''}
            </p>
          </article>
        ))}
        {dashboard.suggestions.map((suggestion) => (
          <article
            className="ledger-record"
            data-rhythm-priority={suggestion.priority}
            key={suggestion.suggestionId}
          >
            <h3>{suggestion.kind} · P3建议</h3>
            <p>{suggestion.message}</p>
            <p>{suggestion.evidence.join(' · ')}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
