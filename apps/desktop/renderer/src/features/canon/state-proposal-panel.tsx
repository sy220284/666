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
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorStatusLabel } from '../../presentation/author-status-labels.js';
import { authorJsonValue } from '../../presentation/author-value-format.js';
import { startSingleFlightPolling } from '../../runtime/single-flight-polling.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

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
  const [includeResolved, setIncludeResolved] = useState(true);
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
      { projectId, chapterId: chapterId || null, includeResolved },
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
  }, [bridge, chapterId, includeResolved, projectId]);
  const resource = useBridgeQuery(
    `state-proposals:${projectId}:${chapterId}:${includeResolved}`,
    load,
  );
  const command = useBridgeCommand(resource.refresh);
  const catalog = resource.data?.catalog ?? null;

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
          `状态提取 · ${stateExtractionStageLabel(outcome.data.stage)} · ${authorStatusLabel(outcome.data.status)}`,
        );
        if (['succeeded', 'failed', 'cancelled'].includes(outcome.data.status)) {
          setPendingExtraction(false);
          void resource.refresh();
          return false;
        }
        return true;
      },
      onError: () => {
        setNotice('状态提取进度读取失败，正在重试。');
        return true;
      },
    });
  }, [activeRunId, bridge, projectId, resource.refresh]);

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
      setNotice(`AI连接状态提取已启动 · ${stateExtractionStageLabel(outcome.data.run.stage)}`);
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
      const edited = window.prompt(
        '请输入合法JSON作为最终值：',
        JSON.stringify(proposal.proposedValue),
      );
      if (edited === null) return;
      try {
        editedValue = JSON.parse(edited) as NonNullable<typeof editedValue>;
      } catch {
        setNotice('JSON格式无效，未执行裁决。');
        return;
      }
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
          ? '建议已拒绝，历史记录已保留。'
          : '作者裁决已提交，权威状态、语义失效与章节尾快照已刷新。',
      );
    }
  };

  return (
    <section className="feature-card" data-state-proposal-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>设定更新建议与章节尾快照</h2>
          <p>等待处理的提案不会改变已确认状态，必须由作者裁决。</p>
        </div>
        <button
          data-refresh-state-proposals
          type="button"
          onClick={() => void Promise.all([refreshStructure(), resource.refresh()])}
        >
          读取
        </button>
      </div>
      <div className="filter-bar">
        <label>
          定稿版本章节
          <select
            data-state-proposal-chapter
            value={chapterId}
            onChange={(event) => setChapterId(event.target.value)}
          >
            <option value="">全部章节</option>
            {chapters.map((item) => (
              <option disabled={!item.finalVersionId} key={item.id} value={item.id}>
                {item.title}
                {item.finalVersionId ? '' : '（尚无定稿版本）'}
              </option>
            ))}
          </select>
        </label>
        <label>
          AI连接
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">选择AI连接</option>
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
          从定稿版本提取
        </button>
        <label>
          <input
            data-state-proposal-include-resolved
            type="checkbox"
            checked={includeResolved}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          包含已裁决
        </label>
      </div>
      <p className="feature-status" data-state-proposal-status>
        {command.error
          ? `裁决失败：${authorErrorSummary(command.error)}`
          : resource.error
            ? `读取失败：${authorErrorSummary(resource.error)}`
            : notice
              ? notice
              : resource.state === 'success'
                ? `项目：${projectName} · 提案 ${catalog?.proposals.length ?? 0}`
                : '读取中…'}
      </p>
      <div className="ledger-list" data-state-proposal-batches>
        {catalog?.batches.map((batch) => (
          <article className="ledger-record" key={batch.batchId}>
            <h4>提案批次 · {stateProposalSourceLabel(batch.source)}</h4>
            <p>
              {authorStatusLabel(batch.status)} · {batch.proposalCount} 项 · 来源定稿版本已记录
            </p>
            <details>
              <summary>技术详情</summary>
              <p>来源版本标识：{batch.sourceVersionId}</p>
              {batch.generationRunId ? <p>生成记录标识：{batch.generationRunId}</p> : null}
            </details>
          </article>
        ))}
      </div>
      <div data-state-proposal-list>
        {catalog?.proposals.length === 0 ? (
          <p>当前没有设定更新建议。</p>
        ) : (
          catalog?.proposals.map((proposal) => (
            <article className="ledger-record" data-state-proposal={proposal.id} key={proposal.id}>
              <h4>{stateProposalTypeLabel(proposal.proposalType)}</h4>
              <p>
                {authorStatusLabel(proposal.status)} · {stateProposalSourceLabel(proposal.source)} ·
                可信度 {Math.round(proposal.confidence * 100)}%
              </p>
              {proposal.freshness === 'stale' ? (
                <p data-state-proposal-stale>来源定稿已变化 · 仅可拒绝</p>
              ) : (
                <p>来源定稿有效 · 可由作者采纳或拒绝</p>
              )}
              <p>原值：{authorJsonValue(proposal.previousValue)}</p>
              <p>建议值：{authorJsonValue(proposal.proposedValue)}</p>
              <details>
                <summary>查看原始值技术详情</summary>
                <p>原始已确认值</p>
                <pre>{JSON.stringify(proposal.previousValue, null, 2)}</pre>
                <p>原始建议值</p>
                <pre>{JSON.stringify(proposal.proposedValue, null, 2)}</pre>
              </details>
              {proposal.evidence.map((anchor, index) => (
                <p key={`${anchor.targetId}-${index}`}>
                  {evidenceAnchorKindLabel(anchor.kind)} · {anchor.note}
                </p>
              ))}
              {proposal.status === 'pending' ? (
                <div className="inline-actions">
                  <button
                    data-accept-state-proposal={proposal.id}
                    disabled={readOnly || command.pending || proposal.actionability !== 'accept'}
                    type="button"
                    onClick={() => void resolve(proposal, 'accept')}
                  >
                    接受
                  </button>
                  <button
                    disabled={readOnly || command.pending || proposal.actionability !== 'accept'}
                    type="button"
                    onClick={() => void resolve(proposal, 'edit_accept')}
                  >
                    编辑后接受
                  </button>
                  <button
                    disabled={readOnly || command.pending}
                    type="button"
                    onClick={() => void resolve(proposal, 'reject')}
                  >
                    拒绝
                  </button>
                </div>
              ) : null}
            </article>
          ))
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
        <p>选择已有定稿版本的章节后读取章节尾快照。</p>
      </div>
    );
  return (
    <div
      className="feature-card snapshot-card"
      data-ending-snapshot={snapshot.snapshotSource}
      data-state-proposal-snapshot
    >
      <h3>章节尾快照</h3>
      <p>
        来源：{snapshotSourceLabel(snapshot.snapshotSource)} ·{' '}
        {snapshot.snapshot ? authorStatusLabel(snapshot.snapshot.status) : '即时读取'}
      </p>
      <p>
        实体状态 {snapshot.content.entityStates.length} · 知情{' '}
        {snapshot.content.knowledgeStates.length} · 伏笔 {snapshot.content.foreshadowings.length} ·
        弧光节点 {snapshot.content.arcMilestones.length}
      </p>
    </div>
  );
}

function stateExtractionStageLabel(stage: string): string {
  const labels: Readonly<Record<string, string>> = {
    queued: '等待开始',
    calling_model: '正在调用AI模型',
    streaming: '正在接收内容',
    validating: '正在检查结果',
    persisting: '正在保存',
    completed: '已完成',
  };
  return labels[stage] ?? '处理中';
}

function stateProposalTypeLabel(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    entity_state: '人物与世界状态',
    arc_milestone: '人物弧光里程碑',
  };
  return labels[type] ?? '设定更新建议';
}

function stateProposalSourceLabel(source: string): string {
  const labels: Readonly<Record<string, string>> = {
    rule: '确定性规则',
    provider_stub: '确定性测试连接',
    provider: 'AI连接',
  };
  return labels[source] ?? '未知来源';
}

function evidenceAnchorKindLabel(kind: string): string {
  const labels: Readonly<Record<string, string>> = {
    chapter: '章节',
    sceneBeat: '场景节拍',
    version: '历史版本',
    entity: '人物与世界设定',
    logicalBlock: '正文位置',
  };
  return labels[kind] ?? '来源位置';
}

function snapshotSourceLabel(source: string): string {
  return source === 'snapshot' ? '已保存的章节尾快照' : '当前已确认状态';
}
