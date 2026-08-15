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

function journalBridge() {
  if (!window.worldforgeJournal) throw new Error('创作日志桥接未就绪。');
  return window.worldforgeJournal;
}

function navigationTarget(
  projectId: string,
  reference: JournalNavigationReference,
): AuthorNavigationTarget {
  if (reference.targetType === 'chapter') {
    return {
      type: 'research-link-target',
      projectId,
      targetType: 'chapter',
      targetId: reference.targetId,
    };
  }
  if (reference.targetType === 'version') {
    return {
      type: 'version',
      projectId,
      chapterId: reference.chapterId,
      versionId: reference.targetId,
      query: null,
    };
  }
  if (reference.targetType === 'entity') {
    return { type: 'entity', projectId, entityId: reference.targetId, query: null };
  }
  if (reference.targetType === 'idea') {
    return {
      type: 'research-link-target',
      projectId,
      targetType: 'idea',
      targetId: reference.targetId,
    };
  }
  return {
    type: 'validation-issue',
    projectId,
    issueId: reference.targetId,
    chapterId: reference.chapterId,
    versionId: reference.versionId,
    logicalBlockId: reference.logicalBlockId,
  };
}

function localDay(): { start: string; end: string } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function localWeek(): { start: string; end: string } {
  const start = new Date();
  const day = start.getDay();
  start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatPeriod(entry: JournalEntry): string {
  const kind =
    entry.periodType === 'daily' ? '每日' : entry.periodType === 'weekly' ? '每周' : '手动';
  return `${kind} · ${new Date(entry.periodStart).toLocaleString()} — ${new Date(entry.periodEnd).toLocaleString()}`;
}

function statusText(entry: JournalEntry): string {
  if (entry.status === 'ready') return '智能复盘已生成';
  if (entry.status === 'ai_failed') return '智能复盘暂不可用';
  if (entry.status === 'ai_pending') return '智能复盘生成中';
  return '确定性复盘';
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
  const [pending, setPending] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [notice, setNotice] = useState('创作日志只读取已有记录，不改动正文、设定或规划。');

  const applyCatalog = useCallback((next: JournalCatalog) => {
    setCatalog(next);
    setNoteDrafts(
      Object.fromEntries(next.entries.map((entry) => [entry.id, entry.authorNote ?? ''])),
    );
  }, []);

  const reload = useCallback(async () => {
    try {
      const result = await journalBridge().list({ projectId, limit: 30, before: null });
      if (result.ok) applyCatalog(result.data);
      else setNotice(`创作日志读取失败：${result.error.message}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创作日志读取失败。');
    }
  }, [applyCatalog, projectId]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      journalBridge().catchUp({ projectId }),
      bridge.providers.list({ mode: 'share' }),
    ]).then(([journalResult, providerResult]) => {
      if (!active) return;
      if (journalResult.ok) applyCatalog(journalResult.data);
      else void reload();
      if (providerResult.state === 'success') {
        setProviders(providerResult.data.providers);
        setProviderId(providerResult.data.providers[0]?.id ?? '');
      }
    });
    return () => {
      active = false;
    };
  }, [applyCatalog, bridge, projectId, reload]);

  useEffect(() => {
    if (!activeRun) return;
    let active = true;
    let timer: number | null = null;
    const poll = async () => {
      const result = await bridge.generation.getRun(projectId, activeRun.runId, { mode: 'share' });
      if (!active) return;
      if (result.state !== 'success') {
        setActiveRun(null);
        return;
      }
      if (result.data.status === 'succeeded') {
        setActiveRun(null);
        setNotice('智能复盘已生成。');
        await reload();
        return;
      }
      if (result.data.status === 'failed' || result.data.status === 'cancelled') {
        setActiveRun(null);
        setNotice('智能复盘未完成，确定性日志仍可正常使用。');
        await reload();
        return;
      }
      setActiveRun(result.data);
      timer = window.setTimeout(() => void poll(), 750);
    };
    timer = window.setTimeout(() => void poll(), 250);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeRun, bridge, projectId, reload]);

  const generate = async (
    periodType: JournalPeriodType,
    periodStart: string,
    periodEnd: string,
  ) => {
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
        applyCatalog(result.data);
        setNotice('复盘已按真实项目记录生成。');
      } else setNotice(`复盘生成失败：${result.error.message}`);
    } finally {
      setPending(null);
    }
  };

  const generateCustom = async () => {
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
    await generate('manual', start.toISOString(), end.toISOString());
  };

  const updateSchedule = async (schedule: JournalSchedule) => {
    if (readOnly) return;
    setPending('schedule');
    try {
      const result = await journalBridge().updatePreferences({ projectId, schedule });
      if (result.ok) {
        applyCatalog(result.data);
        setNotice(schedule === 'off' ? '定时复盘已关闭。' : '定时复盘设置已保存。');
      } else setNotice(result.error.message);
    } finally {
      setPending(null);
    }
  };

  const saveNote = async (entry: JournalEntry) => {
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
        applyCatalog(result.data);
        setNotice('作者备注已保存。');
      } else {
        setNotice(`备注保存失败：${result.error.message}`);
        await reload();
      }
    } finally {
      setPending(null);
    }
  };

  const startAi = async (entry: JournalEntry) => {
    if (!providerId || readOnly) return;
    setPending(`ai:${entry.id}`);
    const result = await bridge.generation.start(
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
      { mode: 'replace', laneKey: `journal:${projectId}:${entry.id}` },
    );
    setPending(null);
    if (result.state === 'success') {
      setActiveRun(result.data.run);
      await reload();
      setNotice('智能复盘已启动；确定性日志可继续使用。');
    } else if (result.state === 'failure') {
      const failed = await journalBridge().markAiFailed({
        projectId,
        entryId: entry.id,
        generationRunId: null,
      });
      if (failed.ok) applyCatalog(failed.data);
      setNotice(`智能复盘未启动：${authorErrorSummary(result.error)}`);
    }
  };

  const loadMore = async () => {
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
        setNoteDrafts((current) => ({
          ...current,
          ...Object.fromEntries(
            result.data.entries.map((entry) => [entry.id, entry.authorNote ?? '']),
          ),
        }));
      }
    } finally {
      setPending(null);
    }
  };

  const providerOptions = useMemo(
    () => providers.map((provider) => ({ id: provider.id, label: provider.name })),
    [providers],
  );

  return (
    <section className="feature-workbench journal-workbench" data-testid="journal-workbench">
      <header className="feature-header">
        <div>
          <p className="eyebrow">长期项目复盘</p>
          <h2>创作日志</h2>
          <p>把写作、定稿、智能采用、设定变化和检查处理汇成可追溯时间线。</p>
        </div>
        <div>
          <button
            type="button"
            disabled={readOnly || pending !== null}
            onClick={() => {
              const window = localDay();
              void generate('manual', window.start, window.end);
            }}
          >
            今日复盘
          </button>
          <button
            type="button"
            disabled={readOnly || pending !== null}
            onClick={() => {
              const window = localWeek();
              void generate('manual', window.start, window.end);
            }}
          >
            本周复盘
          </button>
        </div>
      </header>

      <p role="status">{notice}</p>

      <div className="journal-toolbar">
        <label>
          定时复盘
          <select
            value={catalog?.preferences.schedule ?? 'off'}
            disabled={readOnly || pending === 'schedule'}
            onChange={(event) => void updateSchedule(event.target.value as JournalSchedule)}
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
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          起始日期
          <input
            type="date"
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
          />
        </label>
        <label>
          结束日期
          <input
            type="date"
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={readOnly || pending !== null}
          onClick={() => void generateCustom()}
        >
          指定范围复盘
        </button>
      </div>

      {catalog === null ? <p className="empty-state">正在读取创作日志…</p> : null}
      {catalog?.entries.length === 0 ? (
        <p className="empty-state">还没有日志。生成一次复盘后，这里会开始积累创作时间线。</p>
      ) : null}

      <ol className="journal-timeline">
        {catalog?.entries.map((entry) => {
          const summary = entry.deterministicSummary;
          const expanded = expandedId === entry.id;
          return (
            <li key={entry.id} className="journal-entry">
              <button type="button" onClick={() => setExpandedId(expanded ? null : entry.id)}>
                <strong>{formatPeriod(entry)}</strong>
                <small>{statusText(entry)}</small>
              </button>
              <p>
                净字数 {summary.writing.netCharacters} · 写作会话 {summary.writing.sessions} · 定稿{' '}
                {summary.versions.finalized} · 采用建议稿 {summary.generation.acceptedCandidates} ·
                已处理检查 {summary.review.validationIssuesResolved}
              </p>
              {expanded ? (
                <div className="journal-entry-detail">
                  <p>
                    活跃 {Math.round(summary.writing.activeSeconds / 60)} 分钟 · 涉及章节{' '}
                    {summary.writing.touchedChapters} · 灵感转换 {summary.ideas.converted} · 备份{' '}
                    {summary.recovery.backupsCreated}
                  </p>
                  <p>
                    关系变化 {summary.knowledge.relationshipChanges} · 时间线{' '}
                    {summary.knowledge.timelineChanges} · 伏笔{' '}
                    {summary.knowledge.foreshadowingChanges} · 人物成长线{' '}
                    {summary.knowledge.arcChanges}
                  </p>
                  {summary.navigationReferences.length > 0 ? (
                    <div aria-label="本期相关内容">
                      {summary.navigationReferences.map((reference) => (
                        <button
                          type="button"
                          key={`${reference.targetType}:${reference.targetId}`}
                          onClick={() => onNavigate(navigationTarget(projectId, reference))}
                        >
                          {reference.label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <h3>智能复盘</h3>
                  <p>{entry.aiSummary ?? '尚未生成；确定性复盘已完整保存。'}</p>
                  <button
                    type="button"
                    disabled={readOnly || !providerId || pending !== null || activeRun !== null}
                    onClick={() => void startAi(entry)}
                  >
                    {entry.aiSummary ? '重新生成智能复盘' : '生成智能复盘'}
                  </button>
                  <label>
                    作者备注
                    <textarea
                      maxLength={20_000}
                      disabled={readOnly}
                      value={noteDrafts[entry.id] ?? ''}
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

      {catalog?.nextCursor ? (
        <button type="button" disabled={pending !== null} onClick={() => void loadMore()}>
          加载更早日志
        </button>
      ) : null}
    </section>
  );
}
