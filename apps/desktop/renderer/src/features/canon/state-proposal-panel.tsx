import { useCallback, useEffect, useState } from 'react';

import type {
  EndingSnapshotReadResult,
  GenerationRun,
  ProjectStructure,
  ProviderSummary,
  StateProposal,
  StateProposalCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../../bridge/request-lifecycle.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorStatusLabel } from '../../presentation/author-status-labels.js';
import { authorJsonValue } from '../../presentation/author-value-format.js';
import { startSingleFlightPolling } from '../../runtime/single-flight-polling.js';
import {
  filterAIReviewProposals,
  reviewConfidenceLabel,
  reviewTypeLabel,
  stateProposalCatalogToAIReviewCatalog,
  type AIReviewStatusFilter,
  type AIReviewTypeFilter,
} from './ai-review-model.js';
import { editProposalValue } from './state-proposal-author-edit.js';

interface StateProposalView {
  readonly catalog: StateProposalCatalog;
  readonly snapshot: EndingSnapshotReadResult | null;
}

export function StateProposalPanel({
  bridge,
  projectId,
  projectName,
  readOnly,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
}) {
  const [chapterId, setChapterId] = useState('');
  const [statusFilter, setStatusFilter] = useState<AIReviewStatusFilter>('pending');
  const [typeFilter, setTypeFilter] = useState<AIReviewTypeFilter>('all');
  const [notice, setNotice] = useState<string | null>(null);
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState(false);
  const chapters = structure?.volumes.flatMap((volume) => volume.chapters) ?? [];
  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
  const activeRunId = activeRun?.runId ?? null;

  const refreshStructure = useCallback(async (): Promise<void> => {
    const outcome = await bridge.planning.listStructure(projectId, { mode: 'replace' });
    if (outcome.state !== 'success') return;
    setStructure(outcome.data);
    const finalChapters = outcome.data.volumes
      .flatMap((volume) => volume.chapters)
      .filter((item) => item.finalVersionId);
    setChapterId((current) =>
      finalChapters.some((item) => item.id === current) ? current : (finalChapters[0]?.id ?? ''),
    );
  }, [bridge, projectId]);

  const load = useCallback(async (): Promise<BridgeRequestOutcome<StateProposalView>> => {
    const response = await bridge.stateProposal.list(
      { projectId, chapterId: chapterId || null, includeResolved: true },
      { mode: 'replace' },
    );
    if (response.state !== 'success') return response;
    if (!chapterId) {
      return { ...response, data: { catalog: response.data, snapshot: null } };
    }
    const snapshotResult = await bridge.stateProposal.readSnapshot(
      { projectId, chapterId },
      { mode: 'replace' },
    );
    if (snapshotResult.state !== 'success') return snapshotResult;
    return {
      ...snapshotResult,
      data: { catalog: response.data, snapshot: snapshotResult.data },
    };
  }, [bridge, chapterId, projectId]);
  const resource = useBridgeQuery(`ai-review:${projectId}:${chapterId}`, load);
  const refreshResource = resource.refresh;
  const command = useBridgeCommand(refreshResource);
  const catalog = resource.data?.catalog ?? null;
  const reviewCatalog = catalog ? stateProposalCatalogToAIReviewCatalog(catalog) : null;
  const visibleProposals = reviewCatalog
    ? filterAIReviewProposals(reviewCatalog, { status: statusFilter, reviewType: typeFilter })
    : [];
  const proposalById = new Map<string, StateProposal>(
    catalog?.proposals.map((proposal) => [proposal.id, proposal] as const) ?? [],
  );

  useEffect(() => {
    let active = true;
    void Promise.all([
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
      bridge.providers.list({ mode: 'replace' }),
    ]).then(([structureOutcome, providerOutcome]) => {
      if (!active) return;
      if (structureOutcome.state === 'success') {
        setStructure(structureOutcome.data);
        const firstFinal = structureOutcome.data.volumes
          .flatMap((volume) => volume.chapters)
          .find((item) => item.finalVersionId);
        setChapterId((current) => current || firstFinal?.id || '');
      }
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId((current) => current || providerOutcome.data.providers[0]?.id || '');
      }
    });
    return () => {
      active = false;
    };
  }, [bridge, projectId]);

  useEffect(() => {
    if (!activeRunId) return;
    return startSingleFlightPolling({
      intervalMs: 1_000,
      poll: () => bridge.generation.getRun(projectId, activeRunId),
      onResult: (outcome) => {
        if (outcome.state !== 'success') return true;
        setActiveRun(outcome.data);
        setNotice(
          `智能分析 · ${stateExtractionStageLabel(outcome.data.stage)} · ${authorStatusLabel(outcome.data.status)}`,
        );
        if (['succeeded', 'failed', 'cancelled'].includes(outcome.data.status)) {
          setPendingExtraction(false);
          void refreshResource();
          return false;
        }
        return true;
      },
      onError: () => {
        setNotice('智能分析进度读取失败，正在重试。');
        return true;
      },
    });
  }, [activeRunId, bridge, projectId, refreshResource]);

  const extractWithProvider = async (): Promise<void> => {
    if (!chapter?.finalVersionId || !providerId || readOnly) return;
    setPendingExtraction(true);
    const outcome = await bridge.generation.start({
      projectId,
      chapterId: chapter.id,
      baseDraftId: null,
      baseDraftRevision: null,
      providerId,
      continuationOfRunId: null,
      intent: { runType: 'state_extract', sourceVersionId: chapter.finalVersionId },
    });
    if (outcome.state === 'success') {
      setActiveRun(outcome.data.run);
      setNotice(`智能分析已启动 · ${stateExtractionStageLabel(outcome.data.run.stage)}`);
    } else {
      setPendingExtraction(false);
      setNotice(outcome.state === 'failure' ? authorErrorSummary(outcome.error) : '请求已取消。');
    }
  };

  const resolve = async (
    proposal: StateProposal,
    decision: 'accept' | 'edit_accept' | 'reject',
  ): Promise<void> => {
    setNotice(null);
    let editedValue: Parameters<
      RendererBridgeAdapter['stateProposal']['resolve']
    >[0]['resolutions'][number]['editedValue'];
    if (decision === 'edit_accept') {
      const edited = await editProposalValue(proposal);
      if (edited.state === 'cancelled') return;
      if (edited.state === 'invalid') {
        setNotice(edited.message);
        return;
      }
      editedValue = edited.value as NonNullable<typeof editedValue>;
    }
    const result = await command.run(() =>
      bridge.stateProposal.resolve({
        projectId,
        authority: 'author',
        resolutions: [
          {
            proposalId: proposal.id,
            decision,
            ...(decision === 'edit_accept' ? { editedValue } : {}),
          },
        ],
      }),
    );
    if (result) {
      setNotice(
        decision === 'reject'
          ? '建议已忽略，历史记录仍会保留。'
          : '作者决定已保存，相关状态和章节快照已刷新。',
      );
    }
  };

  return (
    <section className="feature-card" data-ai-review-dialog data-state-proposal-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>智能审阅与章节状态</h2>
          <p>智能分析负责整理和提出建议，只有作者确认后才会更新人物与世界。</p>
        </div>
        <button
          data-refresh-state-proposals
          type="button"
          onClick={() => void Promise.all([refreshStructure(), resource.refresh()])}
        >
          刷新
        </button>
      </div>
      <div className="filter-bar">
        <label>
          定稿章节
          <select
            data-state-proposal-chapter
            value={chapterId}
            onChange={(event) => setChapterId(event.target.value)}
          >
            <option value="">全部章节</option>
            {chapters.map((item) => (
              <option disabled={!item.finalVersionId} key={item.id} value={item.id}>
                {item.title}
                {item.finalVersionId ? '' : '（尚未定稿）'}
              </option>
            ))}
          </select>
        </label>
        <label>
          智能连接
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">选择智能连接</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={readOnly || pendingExtraction || !providerId || !chapter?.finalVersionId}
          type="button"
          onClick={() => void extractWithProvider()}
        >
          分析定稿
        </button>
        <label>
          处理状态
          <select
            data-ai-review-status-filter
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as AIReviewStatusFilter)}
          >
            <option value="pending">待确认</option>
            <option value="resolved">已处理</option>
            <option value="all">全部</option>
          </select>
        </label>
        <label>
          建议类型
          <select
            data-ai-review-type-filter
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as AIReviewTypeFilter)}
          >
            <option value="all">全部类型</option>
            <option value="entity_state">人物与世界状态</option>
            <option value="arc_milestone">人物成长节点</option>
            <option value="knowledge_state">人物知情状态</option>
            <option value="timeline_event">时间线事件</option>
            <option value="character_relationship">人物关系</option>
            <option value="foreshadowing">伏笔进度</option>
            <option value="entity_create">新人物或设定</option>
            <option value="canon_fact">设定事实</option>
          </select>
        </label>
      </div>
      <p className="feature-status" data-ai-review-summary>
        {resource.state === 'success'
          ? `作品：${projectName} · 待确认 ${reviewCatalog?.summary.pending ?? 0} · 已处理 ${reviewCatalog?.summary.resolved ?? 0} · 来源变化 ${reviewCatalog?.summary.stale ?? 0}`
          : `作品：${projectName} · 审阅汇总读取中…`}
      </p>
      <p className="feature-status" data-state-proposal-status>
        {command.error
          ? `处理失败：${authorErrorSummary(command.error)}`
          : resource.error
            ? `读取失败：${authorErrorSummary(resource.error)}`
            : notice
              ? notice
              : resource.state === 'success'
                ? '智能审阅已同步。'
                : '读取中…'}
      </p>
      <div className="ledger-list" data-state-proposal-batches>
        {reviewCatalog?.batches.map((batch) => (
          <article className="ledger-record" key={batch.batchId}>
            <h4>分析批次 · {stateProposalSourceLabel(batch.source)}</h4>
            <p>
              {authorStatusLabel(batch.status)} · {batch.proposalCount} 项 · 来源定稿已记录
            </p>
            <details>
              <summary>技术详情</summary>
              <p>来源版本标识：{batch.sourceVersionId}</p>
              {batch.generationRunId ? <p>智能任务标识：{batch.generationRunId}</p> : null}
            </details>
          </article>
        ))}
      </div>
      <div data-ai-review-list data-state-proposal-list>
        {reviewCatalog?.summary.total === 0 ? (
          <p>当前没有智能审阅建议。</p>
        ) : visibleProposals.length === 0 ? (
          <p>当前筛选条件下没有智能审阅建议。</p>
        ) : (
          visibleProposals.map((review) => {
            const proposal = proposalById.get(review.id);
            if (!proposal) return null;
            return (
              <article
                className="ledger-record"
                data-ai-review-proposal={review.id}
                data-state-proposal={review.id}
                key={review.id}
              >
                <h4>{reviewTypeLabel(review.reviewType)}</h4>
                <p>
                  {authorStatusLabel(review.status)} · {stateProposalSourceLabel(review.source)} ·
                  可信度 {reviewConfidenceLabel(review.confidenceLevel)}
                </p>
                {review.freshness === 'stale' ? (
                  <p data-state-proposal-stale>来源定稿已经变化 · 这条旧建议只能忽略</p>
                ) : (
                  <p>来源定稿仍然有效 · 可以接受、修改后接受或忽略</p>
                )}
                <p>当前记录：{authorJsonValue(review.currentValue)}</p>
                <p>智能建议：{authorJsonValue(review.proposedValue)}</p>
                <details>
                  <summary>技术详情</summary>
                  <p>原始已确认值</p>
                  <pre>{JSON.stringify(review.currentValue, null, 2)}</pre>
                  <p>原始建议值</p>
                  <pre>{JSON.stringify(review.proposedValue, null, 2)}</pre>
                </details>
                {review.evidence.map((anchor, index) => (
                  <p key={`${anchor.targetId}-${index}`}>
                    {evidenceAnchorKindLabel(anchor.kind)} · {anchor.note}
                  </p>
                ))}
                {review.status === 'pending' ? (
                  <div className="inline-actions">
                    <button
                      data-accept-state-proposal={review.id}
                      disabled={readOnly || command.pending || review.actionability !== 'accept'}
                      type="button"
                      onClick={() => void resolve(proposal, 'accept')}
                    >
                      接受
                    </button>
                    <button
                      data-edit-accept-state-proposal={review.id}
                      disabled={readOnly || command.pending || review.actionability !== 'accept'}
                      type="button"
                      onClick={() => void resolve(proposal, 'edit_accept')}
                    >
                      修改后接受
                    </button>
                    <button
                      disabled={readOnly || command.pending}
                      type="button"
                      onClick={() => void resolve(proposal, 'reject')}
                    >
                      忽略
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
      <SnapshotSummary snapshot={resource.data?.snapshot ?? null} />
    </section>
  );
}

function SnapshotSummary({ snapshot }: { readonly snapshot: EndingSnapshotReadResult | null }) {
  if (!snapshot)
    return (
      <div data-state-proposal-snapshot>
        <p>选择已经定稿的章节后，可以查看该章结束时的人物与世界状态。</p>
      </div>
    );
  return (
    <div
      className="feature-card snapshot-card"
      data-ending-snapshot={snapshot.snapshotSource}
      data-state-proposal-snapshot
    >
      <h3>章节状态快照</h3>
      <p>
        来源：{snapshotSourceLabel(snapshot.snapshotSource)} ·{' '}
        {snapshot.snapshot ? authorStatusLabel(snapshot.snapshot.status) : '即时读取'}
      </p>
      <p>
        人物与世界状态 {snapshot.content.entityStates.length} · 知情{' '}
        {snapshot.content.knowledgeStates.length} · 伏笔 {snapshot.content.foreshadowings.length} ·
        成长节点 {snapshot.content.arcMilestones.length}
      </p>
    </div>
  );
}

function stateExtractionStageLabel(stage: string): string {
  const labels: Readonly<Record<string, string>> = {
    queued: '等待开始',
    calling_model: '正在调用智能模型',
    streaming: '正在接收内容',
    validating: '正在检查结果',
    persisting: '正在保存',
    completed: '已完成',
  };
  return labels[stage] ?? '处理中';
}

function stateProposalSourceLabel(source: string): string {
  const labels: Readonly<Record<string, string>> = {
    rule: '系统规则',
    provider_stub: '测试分析',
    provider: '智能分析',
  };
  return labels[source] ?? '未知来源';
}

function evidenceAnchorKindLabel(kind: string): string {
  const labels: Readonly<Record<string, string>> = {
    chapter: '章节',
    sceneBeat: '场景',
    version: '历史版本',
    entity: '人物与世界',
    logicalBlock: '正文段落',
  };
  return labels[kind] ?? '来源位置';
}

function snapshotSourceLabel(source: string): string {
  return source === 'snapshot' ? '已保存的章节状态' : '当前已确认状态';
}
