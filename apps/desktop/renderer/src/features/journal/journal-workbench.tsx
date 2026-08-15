import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type GenerationRun,
  type JournalCatalog,
  type JournalEntry,
  type JournalNavigationReference,
  type JournalPeriodType,
  type JournalSchedule,
  type ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';

interface JournalWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

function localDayWindow(offsetDays = 0): { start: string; end: string } {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + offsetDays + 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function localWeekWindow(): { start: string; end: string } {
  const end = new Date();
  const day = end.getDay();
  const sinceMonday = day === 0 ? 6 : day - 1;
  const start = new Date(end);
  start.setDate(end.getDate() - sinceMonday);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function journalBridge() {
  if (!window.worldforgeJournal) throw new Error('创作日志桥接未就绪。');
  return window.worldforgeJournal;
}

function targetFromReference(reference: JournalNavigationReference): AuthorNavigationTarget {
  if (reference.targetType === 'chapter') {
    return { targetType: 'chapter', chapterId: reference.targetId };
  }
  if (reference.targetType === 'version') {
    return {
      targetType: 'version',
      chapterId: reference.chapterId,
      versionId: reference.targetId,
    };
  }
  if (reference.targetType === 'entity') {
    return {
      targetType: 'research-link-target',
      linkTargetType: 'entity',
      targetId: reference.targetId,
      chapterId: null,
    };
  }
  if (reference.targetType === 'idea') {
    return {
      targetType: 'research-link-target',
      linkTargetType: 'idea',
      targetId: reference.targetId,
      chapterId: null,
    };
  }
  return {
    targetType: 'validation',
    issueId: reference.targetId,
    chapterId: reference.chapterId,
    versionId: reference.versionId,
    logicalBlockId: reference.logicalBlockId,
  };
}

function summaryStatus(entry: JournalEntry): string {
  if (entry.status === 'ready') return '智能复盘已生成';
  if (entry.status === 'ai_failed') return '智能复盘暂不可用';
  if (entry.status === 'ai_pending') return '智能复盘生成中';
  return '确定性复盘';
}

function periodLabel(entry: JournalEntry): string {
  const start = new Date(entry.periodStart).toLocaleString();
  const end = new Date(entry.periodEnd).toLocaleString();
  const kind = entry.periodType === 'daily' ? '每日' : entry.periodType === 'weekly' ? '每周' : '手动';
  return `${kind} · ${start} — ${end}`;
}

function renderCount(label: string, value: number) {
  return (
    <span className="journal-stat" key={label}>
      <strong>{value}</strong>
      <small>{label}</small>
    </span>
  );
}

export function JournalWorkbench({
  bridge,
  projectId,
  readOnly,
  onNavigate,
}: JournalWorkbenchProps) {
  const [catalog, setCatalog] = useState<JournalCatalog | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [notice, setNotice] = useState('创作日志只读取已有记录，不会改动正文、设定或规划。');
  const [pending, setPending] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const activeRunId = activeRun?.runId ?? null;
  const entries = catalog?.entries ?? [];
  const schedule = catalog?.preferences.schedule ?? 'off';

  const load = useCallback(async (): Promise<void> => {
    try {
      const result = await journalBridge().list({ projectId, limit: 30, before: null });
      if (!result.ok) {
        setNotice(`创作日志读取失败：${result.error.message}`);
        return;
      }
      setCatalog(result.data);
      setNoteDrafts(
        Object.fromEntries(result.data.entries.map((entry) => [entry.id, entry.authorNote ?? ''])),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创作日志读取失败。');
    }
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setCatalog(null);
    setExpandedEntryId(null);
    setActiveRun(null);
    void Promise.all([
      journalBridge().catchUp({ projectId }),
      bridge.providers.list({ mode: 'share' }),
    ]).then(([journalResult, providerOutcome]) => {
      if (!active) return;
      if (journalResult.ok) {
        setCatalog(journalResult.data);
        setNoteDrafts(
          Object.fromEntries(
            journalResult.data.entries.map((entry) => [entry.id, entry.authorNote ?? '']),
          ),
        );
      } else {
        setNotice(`自动复盘补生成未完成：${journalResult.error.message}`);
        void load();
      }
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId(providerOutcome.data.providers[0]?.id ?? '');
      } else if (providerOutcome.state === 'failure') {
        setNotice(`智能连接暂不可用：${authorErrorSummary(providerOutcome.error)}`);
      }
    });
    return () => {
      active = false;
    };
  }, [bridge, load, projectId]);

  useEffect(() => {
    if (!activeRunId) return;
    let active = true;
    let timer: number | null = null;
    const poll = async (): Promise<void> => {
      const outcome = await bridge.generation.getRun(projectId, activeRunId, { mode: 'share' });
      if (!active) return;
      if (outcome.state !== 'success') {
        if (outcome.state === 'failure') {
          setNotice(`智能复盘状态读取失败：${authorErrorSummary(outcome.error)}`);
        }
        setActiveRun(null);
        return;
      }
      setActiveRun(outcome.data);
      if (TERMINAL_RUN_STATUSES.has(outcome.data.status)) {
        if (outcome.data.status === 'succeeded') setNotice('智能复盘已生成。');
        else if (outcome.data.status === 'cancelled') setNotice('智能复盘已取消，确定性日志仍保留。');
        else setNotice('智能复盘失败，确定性日志仍可正常使用。');
        setActiveRun(null);
        await load();
        return;
      }
      timer = window.setTimeout(() => void poll(), 750);
    };
    timer = window.setTimeout(() => void poll(), 250);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeRunId, bridge, load, projectId]);

  const generateWindow = async (
    periodType: JournalPeriodType,
    periodStart: string,
    periodEnd: string,
  ): Promise<void> => {
    if (readOnly) return;
    setPending('generate');
    try {
      const result = await journalBridge().generate({
        projectId,
        periodType,
        periodStart,
        periodEnd,
      });
      if (result.ok) {
        setCatalog(result.data);
        setNotice('复盘已按真实项目记录生成。');
      } else {
        setNotice(`复盘生成失败：${result.error.message}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '复盘生成失败。');
    } finally {
      setPending(null);
    }
  };

  const generateToday = (): Promise<void> => {
    const window = localDayWindow();
    return generateWindow('manual', window.start, window.end);
  };

  const generateWeek = (): Promise<void> => {
    const window = localWeekWindow();
    return generateWindow('manual', window.start, window.end);
  };

  const generateCustom = async (): Promise<void> => {
    if (!customStart || !customEnd) {
      setNotice('请先选择复盘起止日期。');
      return;
    }
    const start = new Date(`${customStart}T00:00:00`);
    const end = new Date(`${customEnd}T00:00:00`);
    end.setDate(end.getDate() + 1);
    if (start >= end) {
      setNotice('复盘结束日期必须晚于开始日期。');
      return;
    }
    await generateWindow('manual', start.toISOString(), end.toISOString());
  };

  const changeSchedule = async (next: JournalSchedule): Promise<void> => {
    if (readOnly) return;
    setPending('schedule');
    try {
      const result = await journalBridge().updatePreferences({ projectId, schedule: next });
      if (result.ok) {
        setCatalog(result.data);
        setNotice(next === 'off' ? '定时复盘已关闭。' : `已开启${next === 'daily' ? '每日' : '每周'}复盘。`);
      } else {
        setNotice(result.error.message);
      }
    } finally {
      setPending(null);
    }
  };

  const saveNote = async (entry: JournalEntry): Promise<void> => {
    if (readOnly) return;
    setPending(`note:${entry.id}`);
    try {
      const result = await journalBridge().updateNote({
        projectId,
        entryId: entry.id,
        expectedUpdatedAt: entry.updatedAt,
        authorNote: noteDrafts[entry.id]?.trim() || null,
      });
      if (result.ok) {
        setCatalog(result.data);
        setNotice('作者备注已保存。');
      } else {
        setNotice(`备注保存失败：${result.error.message}`);
        await load();
      }
    } finally {
      setPending(null);
    }
  };

  const startAiSummary = async (entry: JournalEntry): Promise<void> => {
    if (readOnly || !providerId) {
      setNotice(providerId ? '只读项目不能生成智能复盘。' : '请先配置可用的智能连接。');
      return;
    }
    setPending(`ai:${entry.id}`);
    const outcome = await bridge.generation.start(
      {
        projectId,
        scopeType: 'project',
        scopeId: projectId,
        chapterId: null,
        baseDraftId: null,
        baseDraftRevision: null,
        providerId,
        continuationOfRunId: null,
        intent: { runType: 'journal_summarize', journalEntryId: entry.id },
      },
      { mode: 'replace', laneKey: `journal-ai:${projectId}:${entry.id}` },
    );
    setPending(null);
    if (outcome.state === 'success') {
      setActiveRun(outcome.data.run);
      setNotice('智能复盘已启动，确定性日志可继续浏览。');
      return;
    }
    if (outcome.state === 'failure') {
      try {
        const result = await journalBridge().markAiFailed({
          projectId,
          entryId: entry.id,
          generationRunId: null,
        });
        if (result.ok) setCatalog(result.data);
      } finally {
        setNotice(`智能复盘未启动：${authorErrorSummary(outcome.error)}`);
      }
    }
  };

  const loadMore = async (): Promise<void> => {
    if (!catalog?.nextCursor) return;
    setPending('more');
    try {
      const result = await journalBridge().list({
        projectId,
        limit: 30,
        before: catalog.nextCursor,
      });
      if (result.ok) {
        setCatalog({
          ...result.data,
          entries: [...catalog.entries, ...result.data.entries],
        });
      } else {
        setNotice(result.error.message);
      }
    } finally {
      setPending(null);
    }
  };

  const providerOptions = useMemo(
    () => providers.map((provider) => ({ value: provider.id, label: `${provider.name} · ${provider.model}` })),
    [providers],
  );

  return (
    <section className="feature-workbench journal-workbench" data-testid="journal-workbench">
      <header className="feature-header">
        <div>
          <p className="eyebrow">长期项目复盘</p>
          <h2>创作日志</h2>
          <p>把写了什么、改了什么、处理了什么汇成可追溯时间线。</p>
        </div>
        <div className="journal-actions">
          <button type="button" onClick={() => void generateToday()} disabled={readOnly || pending !== null}>
            今日复盘
          </button>
          <button type="button" onClick={() => void generateWeek()} disabled={readOnly || pending !== null}>
            本周复盘
          </button>
        </div>
      </header>

      <p className="feature-notice" role="status">
        {notice}
      </p>

      <div className="journal-toolbar">
        <label>
          定时复盘
          <select
            value={schedule}
            disabled={readOnly || pending === 'schedule'}
            onChange={(event) => void changeSchedule(event.target.value as JournalSchedule)}
          >
            <option value="off">关闭</option>
            <option value="daily">每日</option>
            <option value="weekly">每周</option>
          </select>
        </label>
        <label>
          智能连接
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">仅确定性复盘</option>
            {providerOptions.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          起始日期
          <input type="date" value={customStart} onChange={(event) => setCustomStart(event.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} />
        </label>
        <button type="button" disabled={readOnly || pending !== null} onClick={() => void generateCustom()}>
          指定范围复盘
        </button>
      </div>

      {catalog === null ? (
        <p className="empty-state">正在读取创作日志…</p>
      ) : entries.length === 0 ? (
        <p className="empty-state">还没有日志。完成一次“今日复盘”后，这里会开始积累创作时间线。</p>
      ) : (
        <ol className="journal-timeline">
          {entries.map((entry) => {
            const summary = entry.deterministicSummary;
            const expanded = expandedEntryId === entry.id;
            return (
              <li key={entry.id} className="journal-entry">
                <button
                  type="button"
                  className="journal-entry-heading"
                  onClick={() => setExpandedEntryId(expanded ? null : entry.id)}
                  aria-expanded={expanded}
                >
                  <span>{periodLabel(entry)}</span>
                  <small>{summaryStatus(entry)}</small>
                </button>
                <div className="journal-stats" aria-label="本期创作统计">
                  {renderCount('净字数', summary.writing.netCharacters)}
                  {renderCount('写作会话', summary.writing.sessions)}
                  {renderCount('定稿版本', summary.versions.finalized)}
                  {renderCount('采用建议稿', summary.generation.acceptedCandidates)}
                  {renderCount('处理检查', summary.review.validationIssuesResolved)}
                  {renderCount('灵感转换', summary.ideas.converted)}
                </div>
                {expanded ? (
                  <div className="journal-entry-detail">
                    <p>
                      活跃写作 {Math.round(summary.writing.activeSeconds / 60)} 分钟 · 涉及章节{' '}
                      {summary.writing.touchedChapters} · 新增版本 {summary.versions.created} · 备份{' '}
                      {summary.recovery.backupsCreated}
                    </p>
                    <p>
                      智能生成 {summary.generation.started} 次，成功 {summary.generation.succeeded}，失败{' '}
                      {summary.generation.failed}，取消 {summary.generation.cancelled}。
                    </p>
                    <p>
                      设定变化：人物关系 {summary.knowledge.relationshipChanges} · 时间线{' '}
                      {summary.knowledge.timelineChanges} · 伏笔 {summary.knowledge.foreshadowingChanges} · 人物弧光{' '}
                      {summary.knowledge.arcChanges}。
                    </p>
                    {summary.navigationReferences.length > 0 ? (
                      <div className="journal-links" aria-label="本期相关内容">
                        {summary.navigationReferences.map((reference) => (
                          <button
                            key={`${reference.targetType}:${reference.targetId}`}
                            type="button"
                            onClick={() => onNavigate(targetFromReference(reference))}
                          >
                            {reference.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    <div className="journal-ai-summary">
                      <h3>智能复盘</h3>
                      {entry.aiSummary ? <p>{entry.aiSummary}</p> : <p>尚未生成；确定性统计已完整保存。</p>}
                      <button
                        type="button"
                        disabled={readOnly || !providerId || pending !== null || activeRun !== null}
                        onClick={() => void startAiSummary(entry)}
                      >
                        {entry.aiSummary ? '重新生成智能复盘' : '生成智能复盘'}
                      </button>
                    </div>
                    <label className="journal-note">
                      作者备注
                      <textarea
                        value={noteDrafts[entry.id] ?? ''}
                        disabled={readOnly}
                        maxLength={20_000}
                        onChange={(event) =>
                          setNoteDrafts((current) => ({ ...current, [entry.id]: event.target.value }))
                        }
                      />
                    </label>
                    <button
                      type="button"
                      disabled={readOnly || pending === `note:${entry.id}`}
                      onClick={() => void saveNote(entry)}
                    >
                      保存备注
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {catalog?.nextCursor ? (
        <button type="button" disabled={pending !== null} onClick={() => void loadMore()}>
          加载更早日志
        </button>
      ) : null}
    </section>
  );
}
