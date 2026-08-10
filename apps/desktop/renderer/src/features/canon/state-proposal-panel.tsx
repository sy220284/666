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
import {
  COMMON_STATE_FIELDS,
  parseAuthorValue,
  type AuthorValueType,
} from './canon-author-fields.js';

interface StateProposalView {
  readonly catalog: StateProposalCatalog;
  readonly snapshot: EndingSnapshotReadResult | null;
}

type ProposalEditResult =
  | { readonly state: 'cancelled' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'ready'; readonly value: unknown };

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
          `AI分析 · ${stateExtractionStageLabel(outcome.data.stage)} · ${authorStatusLabel(outcome.data.status)}`,
        );
        if (['succeeded', 'failed', 'cancelled'].includes(outcome.data.status)) {
          setPendingExtraction(false);
          void resource.refresh();
          return false;
        }
        return true;
      },
      onError: () => {
        setNotice('AI分析进度读取失败，正在重试。');
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
      setNotice(`AI分析已启动 · ${stateExtractionStageLabel(outcome.data.run.stage)}`);
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
      const edited = editProposalValue(proposal);
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
    <section className="feature-card" data-state-proposal-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>AI设定建议与章节状态</h2>
          <p>AI只负责分析和提出建议，只有作者确认后才会更新人物与世界。</p>
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
          分析定稿
        </button>
        <label>
          <input
            data-state-proposal-include-resolved
            type="checkbox"
            checked={includeResolved}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          包含已处理
        </label>
      </div>
      <p className="feature-status" data-state-proposal-status>
        {command.error
          ? `处理失败：${authorErrorSummary(command.error)}`
          : resource.error
            ? `读取失败：${authorErrorSummary(resource.error)}`
            : notice
              ? notice
              : resource.state === 'success'
                ? `作品：${projectName} · 建议 ${catalog?.proposals.length ?? 0}`
                : '读取中…'}
      </p>
      <div className="ledger-list" data-state-proposal-batches>
        {catalog?.batches.map((batch) => (
          <article className="ledger-record" key={batch.batchId}>
            <h4>分析批次 · {stateProposalSourceLabel(batch.source)}</h4>
            <p>
              {authorStatusLabel(batch.status)} · {batch.proposalCount} 项 · 来源定稿已记录
            </p>
            <details>
              <summary>技术详情</summary>
              <p>来源版本标识：{batch.sourceVersionId}</p>
              {batch.generationRunId ? <p>AI任务标识：{batch.generationRunId}</p> : null}
            </details>
          </article>
        ))}
      </div>
      <div data-state-proposal-list>
        {catalog?.proposals.length === 0 ? (
          <p>当前没有AI设定建议。</p>
        ) : (
          catalog?.proposals.map((proposal) => (
            <article className="ledger-record" data-state-proposal={proposal.id} key={proposal.id}>
              <h4>{stateProposalTypeLabel(proposal.proposalType)}</h4>
              <p>
                {authorStatusLabel(proposal.status)} · {stateProposalSourceLabel(proposal.source)} ·
                可信度 {proposalConfidenceLabel(proposal.confidence)}
              </p>
              {proposal.freshness === 'stale' ? (
                <p data-state-proposal-stale>来源定稿已经变化 · 这条旧建议只能忽略</p>
              ) : (
                <p>来源定稿仍然有效 · 可以接受、修改后接受或忽略</p>
              )}
              <p>当前记录：{authorJsonValue(proposal.previousValue)}</p>
              <p>AI建议：{authorJsonValue(proposal.proposedValue)}</p>
              <details>
                <summary>技术详情</summary>
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
                    data-edit-accept-state-proposal={proposal.id}
                    disabled={readOnly || command.pending || proposal.actionability !== 'accept'}
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

function editProposalValue(proposal: StateProposal): ProposalEditResult {
  if (proposal.proposalType === 'arc_milestone') return editArcMilestoneProposal(proposal);
  if (proposal.proposalType !== 'entity_state') {
    return { state: 'invalid', message: '当前建议暂不支持直接修改，可以接受或忽略。' };
  }

  const valueType = stateProposalValueType(proposal);
  if (!valueType) {
    return {
      state: 'invalid',
      message: '当前建议包含复杂结构，普通模式暂不直接编辑；可以接受、忽略或查看技术详情。',
    };
  }
  const fieldLabel =
    COMMON_STATE_FIELDS.find((field) => field.key === proposal.stateKey)?.label ?? '最终内容';
  const input = window.prompt(
    `${fieldLabel}：${authorValueInputHint(valueType)}`,
    authorValueInputDefault(valueType, proposal.proposedValue),
  );
  if (input === null) return { state: 'cancelled' };
  try {
    return { state: 'ready', value: parseAuthorValue(valueType, input) };
  } catch (error) {
    return {
      state: 'invalid',
      message: error instanceof Error ? error.message : '内容格式不正确，未保存修改。',
    };
  }
}

function editArcMilestoneProposal(proposal: StateProposal): ProposalEditResult {
  const currentStatus = arcMilestoneStatus(proposal.proposedValue);
  const input = window.prompt(
    '成长节点最终状态：请输入“已发生”或“已跳过”。',
    currentStatus === 'skipped' ? '已跳过' : '已发生',
  );
  if (input === null) return { state: 'cancelled' };
  const normalized = input.trim();
  if (normalized === '已发生' || normalized === '发生' || normalized === 'hit') {
    return {
      state: 'ready',
      value: { status: 'hit', actualChapterId: proposal.chapterId },
    };
  }
  if (normalized === '已跳过' || normalized === '跳过' || normalized === 'skipped') {
    return { state: 'ready', value: { status: 'skipped', actualChapterId: null } };
  }
  return { state: 'invalid', message: '成长节点状态只能填写“已发生”或“已跳过”。' };
}

function arcMilestoneStatus(value: unknown): 'hit' | 'skipped' | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>)['status'];
  return status === 'hit' || status === 'skipped' ? status : null;
}

function stateProposalValueType(proposal: StateProposal): AuthorValueType | null {
  const configured = COMMON_STATE_FIELDS.find((field) => field.key === proposal.stateKey)?.valueType;
  if (configured) return configured;
  const value = proposal.proposedValue;
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return 'list';
  return null;
}

function authorValueInputDefault(valueType: AuthorValueType, value: unknown): string {
  if (valueType === 'boolean') return value === true ? '是' : value === false ? '否' : '';
  if (valueType === 'list' && Array.isArray(value)) return value.map(String).join('\n');
  if (valueType === 'text' || valueType === 'number') return value === null ? '' : String(value);
  return '';
}

function authorValueInputHint(valueType: AuthorValueType): string {
  if (valueType === 'number') return '请输入数字';
  if (valueType === 'boolean') return '请输入“是”或“否”';
  if (valueType === 'list') return '每行填写一项';
  return '直接填写最终内容';
}

function proposalConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return '高';
  if (confidence >= 0.5) return '中';
  return '低';
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
    arc_milestone: '人物成长节点',
  };
  return labels[type] ?? 'AI设定建议';
}

function stateProposalSourceLabel(source: string): string {
  const labels: Readonly<Record<string, string>> = {
    rule: '系统规则',
    provider_stub: '测试分析',
    provider: 'AI分析',
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
