import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  IdeaConversionApplyResultSchema,
  IdeaConversionPreviewSchema,
  IdeaDetailSchema,
  IdeaListSchema,
  type GenerationRun,
  type IdeaCard,
  type IdeaConversionPreview,
  type IdeaConversionTarget,
  type IdeaDepthLevel,
  type IdeaDivergenceLevel,
  type IdeaKind,
  type IdeaList,
  type IdeaStatus,
  type ProjectStructure,
  type ProviderSummary,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import {
  cancelIdeaCapsuleRequests,
  runIdeaCapsuleOperation,
} from '../../bridge/idea-capsule-client.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';

interface IdeaCapsulePanelProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}

type IdeaFilter = 'all' | IdeaStatus;
type ScopeChoice = 'project' | 'chapter';
type IdeaListCursor = NonNullable<IdeaList['nextCursor']>;
type ListState = 'loading' | 'success' | 'failure';

const KIND_OPTIONS: readonly [IdeaKind, string][] = [
  ['new_book', '新书'],
  ['character', '人物'],
  ['plot', '情节'],
  ['worldbuilding', '世界设定'],
  ['foreshadowing', '伏笔'],
  ['twist', '反转'],
  ['relationship', '感情线'],
  ['ending', '结局'],
  ['custom', '自定义'],
];
const DIVERGENCE_OPTIONS: readonly [IdeaDivergenceLevel, string][] = [
  ['safe', '稳妥'],
  ['different', '差异'],
  ['wild', '脑洞'],
];
const DEPTH_OPTIONS: readonly [IdeaDepthLevel, string][] = [
  ['spark', '火花'],
  ['expand', '展开'],
  ['deep', '深挖'],
];
const FILTER_OPTIONS: readonly [IdeaFilter, string][] = [
  ['all', '全部'],
  ['active', '活跃'],
  ['favorite', '收藏'],
  ['converted', '已转换'],
  ['discarded', '已丢弃'],
];
const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function IdeaCapsulePanel({
  bridge,
  projectId,
  readOnly,
  onNavigate,
}: IdeaCapsulePanelProps) {
  const [ideas, setIdeas] = useState<readonly IdeaCard[]>([]);
  const [nextCursor, setNextCursor] = useState<IdeaListCursor | null>(null);
  const [listState, setListState] = useState<ListState>('loading');
  const [filter, setFilter] = useState<IdeaFilter>('all');
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [scopeChoice, setScopeChoice] = useState<ScopeChoice>('project');
  const [chapterId, setChapterId] = useState('');
  const [ideaKind, setIdeaKind] = useState<IdeaKind>('plot');
  const [divergenceLevel, setDivergenceLevel] = useState<IdeaDivergenceLevel>('different');
  const [depthLevel, setDepthLevel] = useState<IdeaDepthLevel>('expand');
  const [instruction, setInstruction] = useState('');
  const [count, setCount] = useState(4);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState('灵感仅在确认转换后写入规划或设定。');
  const [preview, setPreview] = useState<IdeaConversionPreview | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailText, setDetailText] = useState<string | null>(null);

  const chapters = useMemo(
    () => structure?.volumes.flatMap((volume) => volume.chapters) ?? [],
    [structure],
  );

  const loadIdeas = useCallback(
    async (cursor: IdeaListCursor | null = null, append = false): Promise<void> => {
      if (!append) setListState('loading');
      const outcome = await runIdeaCapsuleOperation(
        {
          operation: 'idea.list',
          input: {
            projectId,
            status: filter === 'all' ? null : filter,
            limit: 50,
            cursor,
          },
        },
        { mode: 'share' },
      );
      if (outcome.state !== 'success') {
        if (outcome.state === 'failure') {
          setNotice(`灵感读取失败：${authorErrorSummary(outcome.error)}`);
          setListState('failure');
        }
        return;
      }
      const parsed = IdeaListSchema.safeParse(outcome.data);
      if (!parsed.success) {
        setNotice('灵感数据格式异常，已停止展示旧结果。');
        setListState('failure');
        return;
      }
      setIdeas((current) => (append ? [...current, ...parsed.data.ideas] : parsed.data.ideas));
      setNextCursor(parsed.data.nextCursor);
      setListState('success');
    },
    [filter, projectId],
  );

  useEffect(() => {
    let active = true;
    setPreview(null);
    setDetailId(null);
    setDetailText(null);
    setActiveRun(null);
    void Promise.all([
      bridge.providers.list({ mode: 'share' }),
      bridge.planning.listStructure(projectId, { mode: 'share' }),
    ]).then(([providerOutcome, structureOutcome]) => {
      if (!active) return;
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId((current) =>
          providerOutcome.data.providers.some((provider) => provider.id === current)
            ? current
            : (providerOutcome.data.providers[0]?.id ?? ''),
        );
      } else if (providerOutcome.state === 'failure') {
        setNotice(`AI连接读取失败：${authorErrorSummary(providerOutcome.error)}`);
      }
      if (structureOutcome.state === 'success') {
        setStructure(structureOutcome.data);
        const firstChapter = structureOutcome.data.volumes.flatMap((volume) => volume.chapters)[0];
        setChapterId((current) => current || firstChapter?.id || '');
      } else if (structureOutcome.state === 'failure') {
        setNotice(`章节范围读取失败：${authorErrorSummary(structureOutcome.error)}`);
      }
    });
    return () => {
      active = false;
      cancelIdeaCapsuleRequests();
    };
  }, [bridge, projectId]);

  useEffect(() => {
    setIdeas([]);
    setNextCursor(null);
    setPreview(null);
    void loadIdeas();
  }, [loadIdeas]);

  useEffect(() => {
    if (!activeRun) return;
    let active = true;
    let timer: number | null = null;
    const poll = async (): Promise<void> => {
      const outcome = await bridge.generation.getRun(projectId, activeRun.runId, { mode: 'share' });
      if (!active) return;
      if (outcome.state === 'failure') {
        setNotice(`探索状态读取失败：${authorErrorSummary(outcome.error)}`);
        setActiveRun(null);
        return;
      }
      if (outcome.state !== 'success') {
        setActiveRun(null);
        return;
      }
      setActiveRun(outcome.data);
      if (TERMINAL_RUN_STATUSES.has(outcome.data.status)) {
        if (outcome.data.status === 'succeeded') {
          setNotice('灵感探索完成，已收入灵感胶囊。');
          await loadIdeas();
        } else if (outcome.data.status === 'cancelled') {
          setNotice('本次灵感探索已取消。');
        } else {
          setNotice('本次灵感探索失败，可调整方向后重试。');
        }
        if (active) setActiveRun(null);
        return;
      }
      timer = window.setTimeout(() => void poll(), 750);
    };
    timer = window.setTimeout(() => void poll(), 250);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeRun?.runId, bridge, loadIdeas, projectId]);

  const startExplore = async (sourceIdea?: IdeaCard): Promise<void> => {
    if (readOnly || !providerId) return;
    const sourceContext = sourceIdea?.sourceContext;
    const scopeType = sourceContext?.scopeType ?? scopeChoice;
    const scopeId =
      sourceContext?.scopeId ?? (scopeChoice === 'project' ? projectId : chapterId || null);
    const compatibilityChapterId =
      sourceContext?.chapterId ?? (scopeType === 'chapter' ? scopeId : null);
    if (!scopeId) {
      setNotice('请先选择一个章节范围。');
      return;
    }
    const authorInstruction = sourceIdea
      ? clip(
          `围绕“${sourceIdea.title}”继续探索，保留核心吸引力，同时给出新的发展方向。\n${sourceIdea.content}`,
          32_768,
        )
      : instruction.trim();
    if (!authorInstruction) {
      setNotice('请先写下想探索的方向。');
      return;
    }
    setPendingAction(sourceIdea ? `explore:${sourceIdea.id}` : 'explore');
    const outcome = await bridge.generation.start(
      {
        projectId,
        scopeType,
        scopeId,
        chapterId: compatibilityChapterId,
        baseDraftId: null,
        baseDraftRevision: null,
        providerId,
        continuationOfRunId: null,
        intent: {
          runType: 'idea_explore',
          ideaKind: sourceIdea?.ideaKind ?? ideaKind,
          divergenceLevel: sourceIdea?.divergenceLevel ?? divergenceLevel,
          depthLevel: sourceIdea?.depthLevel ?? depthLevel,
          authorInstruction,
          count,
        },
      },
      {
        mode: 'replace',
        laneKey: `idea-explore:${projectId}:${scopeType}:${scopeId}`,
      },
    );
    setPendingAction(null);
    if (outcome.state === 'success') {
      setActiveRun(outcome.data.run);
      setNotice(sourceIdea ? '继续探索已启动。' : '灵感探索已启动。');
    } else if (outcome.state === 'failure') {
      setNotice(`灵感探索未启动：${authorErrorSummary(outcome.error)}`);
    }
  };

  const setIdeaStatus = async (
    idea: IdeaCard,
    status: 'active' | 'favorite' | 'discarded',
  ): Promise<void> => {
    if (readOnly) return;
    setPendingAction(`status:${idea.id}`);
    const outcome = await runIdeaCapsuleOperation(
      { operation: 'idea.setStatus', input: { projectId, ideaId: idea.id, status } },
      { mode: 'replace', laneKey: `idea-status:${projectId}:${idea.id}` },
    );
    setPendingAction(null);
    if (outcome.state === 'success') {
      setNotice(
        status === 'discarded'
          ? '灵感已丢弃。'
          : status === 'favorite'
            ? '已收藏。'
            : '已取消收藏。',
      );
      setPreview((current) => (current?.ideaId === idea.id ? null : current));
      await loadIdeas();
    } else if (outcome.state === 'failure') {
      setNotice(authorErrorSummary(outcome.error));
    }
  };

  const showDetail = async (idea: IdeaCard): Promise<void> => {
    setDetailId(idea.id);
    setDetailText('正在读取转换状态…');
    const outcome = await runIdeaCapsuleOperation(
      { operation: 'idea.get', input: { projectId, ideaId: idea.id } },
      { mode: 'share' },
    );
    if (outcome.state !== 'success') {
      setDetailText(
        outcome.state === 'failure'
          ? authorErrorSummary(outcome.error)
          : '详情请求已被新请求替代。',
      );
      return;
    }
    const parsed = IdeaDetailSchema.safeParse(outcome.data);
    if (!parsed.success) {
      setDetailText('灵感详情格式异常。');
      return;
    }
    const conversion = parsed.data.conversion;
    setDetailText(
      conversion
        ? `${conversionTargetLabel(conversion.targetType)} · ${conversionStatusLabel(conversion.status)}`
        : '尚未转换，可先预览将写入的目标对象。',
    );
  };

  const previewConversion = async (idea: IdeaCard): Promise<void> => {
    if (readOnly) return;
    const target = conversionTargetForIdea(idea);
    setPendingAction(`preview:${idea.id}`);
    const outcome = await runIdeaCapsuleOperation(
      { operation: 'idea.previewConversion', input: { projectId, ideaId: idea.id, target } },
      { mode: 'replace', laneKey: `idea-conversion:${projectId}:${idea.id}` },
    );
    setPendingAction(null);
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
      return;
    }
    const parsed = IdeaConversionPreviewSchema.safeParse(outcome.data);
    if (!parsed.success) {
      setNotice('转换预览格式异常，已阻止写入。');
      return;
    }
    setPreview(parsed.data);
    setNotice('转换预览已生成；确认后才会写入权威数据。');
  };

  const applyConversion = async (): Promise<void> => {
    if (readOnly || !preview) return;
    setPendingAction(`apply:${preview.ideaId}`);
    const outcome = await runIdeaCapsuleOperation(
      {
        operation: 'idea.applyConversion',
        input: {
          projectId,
          ideaId: preview.ideaId,
          target: preview.target,
          previewHash: preview.previewHash,
        },
      },
      { mode: 'reject' },
    );
    setPendingAction(null);
    if (outcome.state !== 'success') {
      if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
      return;
    }
    const parsed = IdeaConversionApplyResultSchema.safeParse(outcome.data);
    if (!parsed.success) {
      setNotice('转换结果格式异常，请重新读取灵感详情。');
      return;
    }
    const navigation = navigationForConversion(parsed.data.conversion, preview.target.targetType);
    setPreview(null);
    setNotice('灵感已转换为权威对象。');
    await loadIdeas();
    if (navigation) onNavigate(navigation);
    else setNotice('灵感已转换，但当前目标类型没有可用的安全跳转入口。');
  };

  return (
    <section className="feature-card" data-idea-capsule aria-label="灵感胶囊">
      <div className="feature-card__heading">
        <div>
          <p className="eyebrow">灵感胶囊</p>
          <h2>探索、收藏，再决定是否写入正式规划</h2>
          <p>探索结果先独立保存；转换前会明确展示将创建或更新的目标对象。</p>
        </div>
        <select
          aria-label="灵感筛选"
          value={filter}
          onChange={(event) => setFilter(event.target.value as IdeaFilter)}
        >
          {FILTER_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="feature-row">
        <label>
          类型
          <select
            value={ideaKind}
            onChange={(event) => setIdeaKind(event.target.value as IdeaKind)}
          >
            {KIND_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          发散程度
          <select
            value={divergenceLevel}
            onChange={(event) => setDivergenceLevel(event.target.value as IdeaDivergenceLevel)}
          >
            {DIVERGENCE_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          展开深度
          <select
            value={depthLevel}
            onChange={(event) => setDepthLevel(event.target.value as IdeaDepthLevel)}
          >
            {DEPTH_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          范围
          <select
            value={scopeChoice}
            onChange={(event) => setScopeChoice(event.target.value as ScopeChoice)}
          >
            <option value="project">整部作品</option>
            <option value="chapter">指定章节</option>
          </select>
        </label>
        {scopeChoice === 'chapter' ? (
          <label>
            章节
            <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">请选择章节</option>
              {chapters.map((chapter) => (
                <option key={chapter.id} value={chapter.id}>
                  {chapter.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          AI连接
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">请选择连接</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} · {provider.model}
              </option>
            ))}
          </select>
        </label>
        <label>
          数量
          <input
            min={1}
            max={8}
            type="number"
            value={count}
            onChange={(event) =>
              setCount(Math.min(8, Math.max(1, Number(event.target.value) || 1)))
            }
          />
        </label>
      </div>

      <label>
        想探索什么
        <textarea
          data-idea-instruction
          maxLength={32768}
          placeholder="例如：主角第一次真正意识到敌人比自己更了解这座城市，想要三个不同强度的发展方向。"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
      </label>
      <div className="inline-actions">
        <button
          className="primary-button"
          data-explore-ideas
          disabled={
            readOnly ||
            !providerId ||
            !instruction.trim() ||
            (scopeChoice === 'chapter' && !chapterId) ||
            pendingAction !== null ||
            activeRun !== null
          }
          type="button"
          onClick={() => void startExplore()}
        >
          开始探索
        </button>
        <button type="button" disabled={listState === 'loading'} onClick={() => void loadIdeas()}>
          刷新灵感
        </button>
      </div>
      <p className="feature-status" data-idea-status role="status">
        {activeRun ? `探索进行中 · ${activeRun.stage}` : notice}
      </p>

      {listState === 'loading' ? <p>正在读取灵感…</p> : null}
      {listState === 'failure' ? (
        <button type="button" onClick={() => void loadIdeas()}>
          重新读取
        </button>
      ) : null}
      {listState === 'success' && ideas.length === 0 ? (
        <p data-idea-empty>这里还没有灵感。</p>
      ) : null}

      <div data-idea-list>
        {ideas.map((idea) => (
          <article className="feature-row" data-idea-card={idea.id} key={idea.id}>
            <div>
              <strong>{idea.title}</strong>
              <span>
                {ideaKindLabel(idea.ideaKind)} · {divergenceLabel(idea.divergenceLevel)} ·{' '}
                {depthLabel(idea.depthLevel)} · {ideaStatusLabel(idea.status)}
              </span>
              <p>{idea.summary}</p>
              <small>
                {clip(idea.content, 1_200)}
                {idea.content.length > 1_200 ? '…' : ''}
              </small>
              {detailId === idea.id && detailText ? <p role="status">{detailText}</p> : null}
            </div>
            <div className="inline-actions">
              <button type="button" onClick={() => void showDetail(idea)}>
                详情
              </button>
              <button
                disabled={
                  readOnly ||
                  pendingAction !== null ||
                  idea.status === 'converted' ||
                  idea.status === 'discarded'
                }
                type="button"
                onClick={() =>
                  void setIdeaStatus(idea, idea.status === 'favorite' ? 'active' : 'favorite')
                }
              >
                {idea.status === 'favorite' ? '取消收藏' : '收藏'}
              </button>
              <button
                disabled={
                  readOnly ||
                  !providerId ||
                  pendingAction !== null ||
                  activeRun !== null ||
                  idea.status === 'converted' ||
                  idea.status === 'discarded'
                }
                type="button"
                onClick={() => void startExplore(idea)}
              >
                继续探索
              </button>
              <button
                disabled={
                  readOnly ||
                  pendingAction !== null ||
                  idea.status === 'converted' ||
                  idea.status === 'discarded'
                }
                type="button"
                onClick={() => void previewConversion(idea)}
              >
                转换
              </button>
              <button
                className="danger-button"
                disabled={
                  readOnly ||
                  pendingAction !== null ||
                  idea.status === 'converted' ||
                  idea.status === 'discarded'
                }
                type="button"
                onClick={() => void setIdeaStatus(idea, 'discarded')}
              >
                丢弃
              </button>
            </div>
          </article>
        ))}
      </div>

      {nextCursor ? (
        <button
          disabled={pendingAction !== null}
          type="button"
          onClick={() => void loadIdeas(nextCursor, true)}
        >
          加载更多
        </button>
      ) : null}

      {preview ? (
        <section className="feature-card" data-idea-conversion-preview>
          <h3>转换确认</h3>
          <p>{preview.summary}</p>
          <p>{conversionDraftSummary(preview.target)}</p>
          <p>确认后会写入正式规划或设定；当前灵感会标记为已转换。</p>
          <div className="inline-actions">
            <button
              className="primary-button"
              disabled={readOnly || pendingAction !== null}
              type="button"
              onClick={() => void applyConversion()}
            >
              确认转换
            </button>
            <button type="button" onClick={() => setPreview(null)}>
              取消
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

function conversionTargetForIdea(idea: IdeaCard): IdeaConversionTarget {
  if (idea.ideaKind === 'new_book') {
    return {
      targetType: 'project_brief',
      draft: {
        concept: clip(idea.summary || idea.title, 4_000),
        readingPromise: clip(idea.content, 4_000),
        protagonistGoal: '',
        coreConflict: '',
        endingIntent: '',
        required: [],
        forbidden: [],
      },
    };
  }
  if (idea.ideaKind === 'character' || idea.ideaKind === 'worldbuilding') {
    return {
      targetType: 'entity',
      draft: {
        entityType: idea.ideaKind === 'character' ? 'character' : 'rule',
        name: clip(idea.title, 240),
        aliases: [],
        summary: clip(idea.content, 20_000),
      },
    };
  }
  if (idea.ideaKind === 'foreshadowing') {
    return {
      targetType: 'foreshadowing',
      draft: {
        title: clip(idea.title, 240),
        description: clip(idea.content, 20_000),
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [],
        relations: [],
      },
    };
  }
  return {
    targetType: 'plot_node',
    draft: {
      parentId: null,
      nodeType: 'arc',
      title: clip(idea.title, 240),
      goal: clip(idea.summary, 4_000),
      coreConflict: idea.ideaKind === 'twist' ? clip(idea.content, 4_000) : '',
      expectedResult: idea.ideaKind === 'ending' ? clip(idea.content, 4_000) : '',
      status: 'outlined',
    },
  };
}

function navigationForConversion(
  conversion: {
    readonly projectId: string;
    readonly targetType: string;
    readonly targetId: string;
  },
  expectedTargetType: IdeaConversionTarget['targetType'],
): AuthorNavigationTarget | null {
  if (conversion.targetType !== expectedTargetType) return null;
  switch (conversion.targetType) {
    case 'project_brief':
      return {
        type: 'project-brief',
        projectId: conversion.projectId,
        briefId: conversion.targetId,
      };
    case 'plot_node':
      return {
        type: 'plot-node',
        projectId: conversion.projectId,
        plotNodeId: conversion.targetId,
      };
    case 'entity':
      return {
        type: 'entity',
        projectId: conversion.projectId,
        entityId: conversion.targetId,
        query: null,
      };
    case 'foreshadowing':
      return {
        type: 'foreshadowing',
        projectId: conversion.projectId,
        foreshadowingId: conversion.targetId,
        chapterId: null,
        query: null,
      };
    case 'canon_fact':
    case 'timeline_event':
      return null;
  }
}

function conversionDraftSummary(target: IdeaConversionTarget): string {
  switch (target.targetType) {
    case 'project_brief':
      return `将更新作品核心：${target.draft.concept || '未填写核心概念'}`;
    case 'plot_node':
      return `将创建大纲节点“${target.draft.title}”。`;
    case 'entity':
      return `将创建${target.draft.entityType === 'character' ? '人物' : '设定'}“${target.draft.name}”。`;
    case 'canon_fact':
      return `将写入设定事实“${target.draft.factKey}”。`;
    case 'timeline_event':
      return `将创建时间线事件“${target.draft.title}”。`;
    case 'foreshadowing':
      return `将创建伏笔“${target.draft.title}”。`;
  }
}

function clip(value: string, max: number): string {
  return value.trim().slice(0, max);
}

function ideaKindLabel(value: IdeaKind): string {
  return KIND_OPTIONS.find(([kind]) => kind === value)?.[1] ?? value;
}

function divergenceLabel(value: IdeaDivergenceLevel): string {
  return DIVERGENCE_OPTIONS.find(([level]) => level === value)?.[1] ?? value;
}

function depthLabel(value: IdeaDepthLevel): string {
  return DEPTH_OPTIONS.find(([level]) => level === value)?.[1] ?? value;
}

function ideaStatusLabel(value: IdeaStatus): string {
  return FILTER_OPTIONS.find(([status]) => status === value)?.[1] ?? value;
}

function conversionTargetLabel(value: string): string {
  switch (value) {
    case 'project_brief':
      return '作品核心';
    case 'plot_node':
      return '大纲节点';
    case 'entity':
      return '人物或设定';
    case 'canon_fact':
      return '设定事实';
    case 'timeline_event':
      return '时间线事件';
    case 'foreshadowing':
      return '伏笔';
    default:
      return '目标对象';
  }
}

function conversionStatusLabel(value: string): string {
  if (value === 'target_missing') return '目标已删除';
  if (value === 'target_stale') return '目标已归档或失效';
  return '目标有效';
}
