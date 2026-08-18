import type {
  GenerationRun,
  ProjectStructure,
  ProviderSummary,
  ValidationCatalog,
  ValidationIssue,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorStatusLabel } from '../../presentation/author-status-labels.js';
import { authorTerm } from '../../presentation/author-terms.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { useCallback, useEffect, useMemo, useState } from './react-hooks.js';
import {
  generationPollingDelay,
  registerGenerationPollingFailure,
} from './generation-polling-policy.js';
import { RhythmPanel } from './rhythm-panel.js';
import { SearchPanel } from './search-panel.js';

interface ChecksWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}

const ISSUE_ACTIONS = [
  ['resolve', '标记已处理'],
  ['ignore', '忽略本项'],
  ['mute', '停用此规则'],
  ['downgrade', '降低重要程度'],
  ['false_positive', '标记为误报'],
  ['reopen', '重新打开'],
] as const;

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'cancelled']);

export function ChecksWorkbench({ bridge, projectId, readOnly, onNavigate }: ChecksWorkbenchProps) {
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [catalog, setCatalog] = useState<ValidationCatalog | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [includeClosed, setIncludeClosed] = useState(true);
  const [commentStatus, setCommentStatus] = useState<'all' | 'open' | 'resolved'>('all');
  const [commentSource, setCommentSource] = useState<'all' | 'validation' | 'manual'>('all');
  const [commentTag, setCommentTag] = useState('');
  const [commentIssueType, setCommentIssueType] = useState('');
  const [commentCharacterTag, setCommentCharacterTag] = useState('');
  const [selectedCommentIds, setSelectedCommentIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [notice, setNotice] = useState(
    `检查只读取当前${authorTerm('finalVersion')}，不会自动改写正文。`,
  );

  const chapters = useMemo(
    () => structure?.volumes.flatMap((volume) => volume.chapters) ?? [],
    [structure],
  );
  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
  const visibleIssues = useMemo(
    () =>
      (catalog?.issues ?? []).filter(
        (issue) =>
          (!chapterId || issue.anchor.chapterId === chapterId) &&
          (includeClosed || issue.status === 'open'),
      ),
    [catalog?.issues, chapterId, includeClosed],
  );
  const issueById = useMemo(
    () => new Map((catalog?.issues ?? []).map((issue) => [issue.issueId, issue] as const)),
    [catalog?.issues],
  );
  const visibleComments = useMemo(
    () =>
      (catalog?.comments ?? []).filter((comment) => {
        if (commentStatus !== 'all' && comment.status !== commentStatus) return false;
        if (commentSource === 'validation' && !comment.validationIssueId) return false;
        if (commentSource === 'manual' && comment.validationIssueId) return false;
        if (chapterId && comment.chapterId !== chapterId) return false;
        if (commentTag.trim() && !(comment.tags ?? []).includes(commentTag.trim())) return false;
        if (commentCharacterTag && !(comment.tags ?? []).includes(commentCharacterTag))
          return false;
        if (commentIssueType) {
          const issue = comment.validationIssueId ? issueById.get(comment.validationIssueId) : null;
          if (issue?.issueType !== commentIssueType) return false;
        }
        return true;
      }),
    [
      catalog?.comments,
      chapterId,
      commentCharacterTag,
      commentIssueType,
      commentSource,
      commentStatus,
      commentTag,
      issueById,
    ],
  );
  const availableCommentTags = useMemo(
    () => [...new Set((catalog?.comments ?? []).flatMap((comment) => comment.tags ?? []))].sort(),
    [catalog?.comments],
  );
  const availableCommentIssueTypes = useMemo(
    () => [...new Set((catalog?.issues ?? []).map((issue) => issue.issueType))].sort(),
    [catalog?.issues],
  );
  const availableCommentCharacters = useMemo(
    () => availableCommentTags.filter((tag) => tag.startsWith('人物-')),
    [availableCommentTags],
  );
  const batchById = useMemo(
    () => new Map((catalog?.batches ?? []).map((batch) => [batch.batchId, batch] as const)),
    [catalog?.batches],
  );

  const refreshCatalog = useCallback(async (): Promise<void> => {
    const outcome = await bridge.validation.list(
      { projectId, chapterId: chapterId || null, includeClosed },
      { mode: 'replace' },
    );
    if (outcome.state === 'success') setCatalog(outcome.data);
    else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  }, [bridge, chapterId, includeClosed, projectId]);

  useEffect(() => {
    let active = true;
    setStructure(null);
    setCatalog(null);
    setProviders([]);
    setProviderId('');
    setChapterId('');
    setActiveRun(null);
    setPending(false);
    void Promise.all([
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
      bridge.providers.list({ mode: 'replace' }),
      bridge.validation.list(
        { projectId, chapterId: null, includeClosed: true },
        { mode: 'replace' },
      ),
    ]).then(([structureOutcome, providerOutcome, validationOutcome]) => {
      if (!active) return;
      const failures: string[] = [];
      if (structureOutcome.state === 'success') {
        setStructure(structureOutcome.data);
        const firstFinal = structureOutcome.data.volumes
          .flatMap((volume) => volume.chapters)
          .find((item) => item.finalVersionId);
        setChapterId(firstFinal?.id ?? '');
      } else if (structureOutcome.state === 'failure') {
        failures.push(`章节读取失败：${authorErrorSummary(structureOutcome.error)}`);
      }
      if (providerOutcome.state === 'success') {
        setProviders(providerOutcome.data.providers);
        setProviderId(providerOutcome.data.providers[0]?.id ?? '');
      } else if (providerOutcome.state === 'failure') {
        failures.push(`智能连接读取失败：${authorErrorSummary(providerOutcome.error)}`);
      }
      if (validationOutcome.state === 'success') {
        setCatalog(validationOutcome.data);
      } else if (validationOutcome.state === 'failure') {
        failures.push(`检查结果读取失败：${authorErrorSummary(validationOutcome.error)}`);
      }
      if (failures.length > 0) setNotice(failures.join('；'));
    });
    return () => {
      active = false;
    };
  }, [bridge, projectId]);

  useEffect(() => void refreshCatalog(), [refreshCatalog]);

  const activeRunId = activeRun?.runId ?? null;
  useEffect(() => {
    if (!activeRunId) return;
    let active = true;
    let timer: number | null = null;
    let failureCount = 0;

    const schedule = (delay: number): void => {
      if (!active) return;
      timer = window.setTimeout(() => void poll(), delay);
    };

    const poll = async (): Promise<void> => {
      let terminal = false;
      try {
        const outcome = await bridge.generation.getRun(projectId, activeRunId, { mode: 'share' });
        if (!active) return;
        if (outcome.state === 'success') {
          failureCount = 0;
          setActiveRun(outcome.data);
          setNotice(
            `智能语义检查 · ${generationStageLabel(outcome.data.stage)} · ${authorStatusLabel(outcome.data.status)}`,
          );
          terminal = TERMINAL_RUN_STATUSES.has(outcome.data.status);
          if (terminal) {
            setPending(false);
            await refreshCatalog();
          }
        } else if (outcome.state === 'failure') {
          const decision = registerGenerationPollingFailure(failureCount);
          failureCount = decision.failureCount;
          terminal = decision.terminal;
          if (terminal) {
            setPending(false);
            setActiveRun(null);
            setNotice(
              `智能语义检查状态连续读取失败：${authorErrorSummary(outcome.error)}。自动重试已停止，请重新运行。`,
            );
          } else {
            setNotice(
              `智能语义检查状态读取失败：${authorErrorSummary(outcome.error)}，将自动重试。`,
            );
          }
        } else if (outcome.state === 'cancelled') {
          terminal = true;
          setPending(false);
          setNotice('智能语义检查状态读取已取消。');
        }
      } catch {
        if (!active) return;
        const decision = registerGenerationPollingFailure(failureCount);
        failureCount = decision.failureCount;
        terminal = decision.terminal;
        if (terminal) {
          setPending(false);
          setActiveRun(null);
          setNotice('智能语义检查状态连续无法读取。自动重试已停止，请重新运行。');
        } else {
          setNotice('智能语义检查状态暂时无法读取，将自动重试。');
        }
      }
      if (!terminal) schedule(generationPollingDelay(failureCount));
    };

    schedule(0);
    return () => {
      active = false;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [activeRunId, bridge, projectId, refreshCatalog]);

  const runRules = async (): Promise<void> => {
    if (!chapter?.finalVersionId || readOnly) return;
    setPending(true);
    const outcome = await bridge.validation.runRules({
      projectId,
      sourceVersionId: chapter.finalVersionId,
    });
    setPending(false);
    if (outcome.state === 'success') {
      setCatalog(outcome.data);
      setNotice(`规则检查完成 · ${outcome.data.issues.length} 个问题。`);
    } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const runAi = async (): Promise<void> => {
    if (!chapter?.finalVersionId || !providerId || readOnly) return;
    setPending(true);
    const outcome = await bridge.generation.start({
      projectId,
      chapterId: chapter.id,
      baseDraftId: null,
      baseDraftRevision: null,
      providerId,
      continuationOfRunId: null,
      intent: { runType: 'validate', sourceVersionId: chapter.finalVersionId },
    });
    if (outcome.state === 'success') {
      setActiveRun(outcome.data.run);
      setNotice(`智能语义检查已启动 · ${generationStageLabel(outcome.data.run.stage)}`);
    } else {
      setPending(false);
      setNotice(outcome.state === 'failure' ? authorErrorSummary(outcome.error) : '请求已取消。');
    }
  };

  const updateIssue = async (
    issue: ValidationIssue,
    action: (typeof ISSUE_ACTIONS)[number][0],
  ): Promise<void> => {
    if (readOnly) return;
    const outcome = await bridge.validation.updateIssue({
      projectId,
      issueId: issue.issueId,
      action,
    });
    if (outcome.state === 'success') setCatalog(outcome.data);
    else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const createTodo = async (issue: ValidationIssue): Promise<void> => {
    if (readOnly) return;
    const outcome = await bridge.validation.createTodoFromIssue({
      projectId,
      issueId: issue.issueId,
    });
    if (outcome.state === 'success') {
      setCatalog(outcome.data);
      setNotice('已创建与问题原文位置关联的修改任务。');
    } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const rememberException = async (issue: ValidationIssue): Promise<void> => {
    if (readOnly) return;
    const selected = window.prompt(
      '例外类型：倒叙、梦境、幻觉、谎言、不可靠叙述、隐藏身份、特殊规则、时间循环、替身、平行世界、作者有意或自定义。',
      '作者有意',
    );
    if (selected === null) return;
    const exceptionType = validationExceptionType(selected);
    if (!exceptionType) {
      setNotice('例外类型无法识别，未保存。');
      return;
    }
    const notes = window.prompt('补充说明（可选）：', '') ?? '';
    const outcome = await bridge.validation.rememberException({
      projectId,
      issueId: issue.issueId,
      exceptionType,
      scopeType: 'issue',
      notes,
    });
    if (outcome.state === 'success') {
      setCatalog(outcome.data);
      setNotice('已记住这个例外；后续检查会读取该例外，当前问题已忽略。');
    } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const addComment = async (issue: ValidationIssue): Promise<void> => {
    if (readOnly) return;
    const body = window.prompt('添加审阅批注：')?.trim();
    if (!body) return;
    const outcome = await bridge.validation.addComment({
      projectId,
      issueId: issue.issueId,
      chapterId: issue.anchor.chapterId,
      sourceVersionId: issue.anchor.versionId,
      logicalBlockId: issue.anchor.logicalBlockId,
      body,
    });
    if (outcome.state === 'success') setCatalog(outcome.data);
    else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const updateComment = async (commentId: string, action: 'resolve' | 'reopen'): Promise<void> => {
    if (readOnly) return;
    const outcome =
      action === 'resolve'
        ? await bridge.validation.resolveComment({ projectId, commentId })
        : await bridge.validation.reopenComment({ projectId, commentId });
    if (outcome.state === 'success') setCatalog(outcome.data);
    else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
  };

  const runCommentBatch = async (action: 'resolve' | 'reopen' | 'tag'): Promise<void> => {
    if (readOnly || selectedCommentIds.size === 0) return;
    const tags =
      action === 'tag'
        ? (window.prompt('给所选批注添加标签（多个标签用逗号分隔）：', '') ?? '')
            .split(/[,，]/u)
            .map((tag) => tag.trim())
            .filter(Boolean)
        : [];
    if (action === 'tag' && tags.length === 0) return;
    const outcome = await bridge.validation.batchComments({
      projectId,
      commentIds: [...selectedCommentIds],
      action,
      tags,
    });
    if (outcome.state === 'success') {
      setCatalog(outcome.data);
      setSelectedCommentIds(new Set());
      setNotice(`已批量处理 ${selectedCommentIds.size} 条批注。`);
    } else if (outcome.state === 'failure') {
      setNotice(authorErrorSummary(outcome.error));
    }
  };

  const toggleCommentSelection = (commentId: string, checked: boolean): void => {
    setSelectedCommentIds((current) => {
      const next = new Set(current);
      if (checked) next.add(commentId);
      else next.delete(commentId);
      return next;
    });
  };

  const navigateToIssue = (issue: ValidationIssue): void => {
    if (!issue.anchor.chapterId) {
      setNotice('该问题没有章节原文位置，无法进行精准跳转。');
      return;
    }
    onNavigate({
      type: 'validation-issue',
      projectId,
      issueId: issue.issueId,
      chapterId: issue.anchor.chapterId,
      versionId: issue.anchor.versionId,
      logicalBlockId: issue.anchor.logicalBlockId,
    });
  };

  const navigateToDraftLocation = (
    targetChapterId: string | null,
    logicalBlockId: string | null,
    label: string,
  ): void => {
    if (!targetChapterId) {
      setNotice(`${label}没有章节原文位置，无法进行精准跳转。`);
      return;
    }
    onNavigate({
      type: 'draft-block',
      projectId,
      chapterId: targetChapterId,
      logicalBlockId,
      query: null,
    });
  };

  return (
    <section className="checks-workbench" data-checks-workbench aria-label="内容检查工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">内容检查</p>
          <h1>规则与智能语义检查</h1>
          <p>检查结果保留内容依据；只有作者可以处理、忽略或转为修改任务。</p>
        </div>
      </header>
      <SearchPanel
        bridge={bridge}
        projectId={projectId}
        readOnly={readOnly}
        onNavigate={onNavigate}
      />
      <RhythmPanel bridge={bridge} projectId={projectId} readOnly={readOnly} />
      <section className="feature-card">
        <div className="filter-bar">
          <label>
            定稿章节
            <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">选择章节</option>
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
          <label>
            <input
              checked={includeClosed}
              type="checkbox"
              onChange={(event) => setIncludeClosed(event.target.checked)}
            />
            包含已处理问题
          </label>
          <button disabled={pending || readOnly || !chapter?.finalVersionId} onClick={runRules}>
            运行规则检查
          </button>
          <button
            disabled={pending || readOnly || !chapter?.finalVersionId || !providerId}
            onClick={runAi}
          >
            运行智能语义检查
          </button>
        </div>
        <p className="feature-status" role="status">
          {notice}
        </p>
      </section>

      <section className="feature-card">
        <h2>问题清单</h2>
        {visibleIssues.length === 0 ? (
          <p>当前筛选范围没有检查问题。</p>
        ) : (
          <div className="ledger-list">
            {visibleIssues.map((issue) => (
              <article
                className="ledger-record"
                data-validation-issue={issue.issueId}
                key={issue.issueId}
              >
                <h3>
                  {issueTypeLabel(issue.issueType)} · {authorStatusLabel(issue.severity)}
                </h3>
                <p>
                  {issue.source === 'rule' ? '确定性规则' : '智能语义检查'} ·{' '}
                  {authorStatusLabel(issue.status)} · 原文位置{' '}
                  {issue.anchor.state === 'current' ? '有效' : '已经变化'} · 语义上下文{' '}
                  {batchById.get(issue.batchId)?.semanticFreshness === 'current'
                    ? '有效'
                    : '已经变化'}
                </p>
                <p>{issue.rationale}</p>
                {issue.currentEvidenceIds.length > 0 || issue.conflictEvidenceIds.length > 0 ? (
                  <div className="validation-evidence-pair" data-validation-evidence-pair>
                    <p>当前依据：{issue.currentEvidenceIds.join(' · ') || '无'}</p>
                    <p>冲突依据：{issue.conflictEvidenceIds.join(' · ') || '无'}</p>
                  </div>
                ) : null}
                {issue.anchor.textQuote ? <blockquote>{issue.anchor.textQuote}</blockquote> : null}
                {issue.suggestion ? <p>修改建议：{issue.suggestion}</p> : null}
                <details>
                  <summary>技术详情</summary>
                  <p>定稿标识：{issue.anchor.versionId ?? '作品级问题'}</p>
                  <p>正文段落标识：{issue.anchor.logicalBlockId ?? '没有正文段落位置'}</p>
                  <p>内容依据标识：{issue.evidenceIds.join(' · ') || '无'}</p>
                </details>
                <div className="inline-actions">
                  <button
                    data-author-return-key={`validation-issue:${issue.issueId}`}
                    disabled={!issue.anchor.chapterId}
                    type="button"
                    onClick={() => navigateToIssue(issue)}
                  >
                    前往原文
                  </button>
                  {ISSUE_ACTIONS.map(([action, label]) => (
                    <button
                      disabled={readOnly}
                      key={action}
                      type="button"
                      onClick={() => void updateIssue(issue, action)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    data-remember-validation-exception={issue.issueId}
                    disabled={readOnly}
                    type="button"
                    onClick={() => void rememberException(issue)}
                  >
                    记住这个例外
                  </button>
                  <button disabled={readOnly} type="button" onClick={() => void createTodo(issue)}>
                    转为修改任务
                  </button>
                  <button disabled={readOnly} type="button" onClick={() => void addComment(issue)}>
                    添加批注
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="feature-card">
        <h2>修改任务与批注</h2>
        {(catalog?.todos ?? []).map((todo) => (
          <article className="ledger-record" data-writing-todo={todo.todoId} key={todo.todoId}>
            <p>
              {todo.title} · {todo.status === 'open' ? '待处理' : '已完成'}
            </p>
            <div className="inline-actions">
              <button
                data-author-return-key={`story-todo:${todo.todoId}`}
                disabled={!todo.chapterId}
                type="button"
                onClick={() =>
                  navigateToDraftLocation(todo.chapterId, todo.logicalBlockId, '该任务')
                }
              >
                前往原文
              </button>
              <button
                disabled={readOnly}
                type="button"
                onClick={() =>
                  void bridge.validation
                    .saveTodo({
                      projectId,
                      todoId: todo.todoId,
                      chapterId: todo.chapterId,
                      sceneBeatId: todo.sceneBeatId,
                      logicalBlockId: todo.logicalBlockId,
                      title: todo.title,
                      status: todo.status === 'open' ? 'done' : 'open',
                    })
                    .then((outcome) => {
                      if (outcome.state === 'success') setCatalog(outcome.data);
                      else if (outcome.state === 'failure') {
                        setNotice(authorErrorSummary(outcome.error));
                      }
                    })
                }
              >
                {todo.status === 'open' ? '标记完成' : '重新打开'}
              </button>
            </div>
          </article>
        ))}
        <div className="filter-bar" data-comment-workflow-filters>
          <label>
            批注状态
            <select
              value={commentStatus}
              onChange={(event) => setCommentStatus(event.target.value as typeof commentStatus)}
            >
              <option value="all">全部</option>
              <option value="open">待处理</option>
              <option value="resolved">已处理</option>
            </select>
          </label>
          <label>
            来源
            <select
              value={commentSource}
              onChange={(event) => setCommentSource(event.target.value as typeof commentSource)}
            >
              <option value="all">全部</option>
              <option value="validation">检查问题</option>
              <option value="manual">作者批注</option>
            </select>
          </label>
          <label>
            标签
            <select value={commentTag} onChange={(event) => setCommentTag(event.target.value)}>
              <option value="">全部标签</option>
              {availableCommentTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>
          <label>
            人物
            <select
              value={commentCharacterTag}
              onChange={(event) => setCommentCharacterTag(event.target.value)}
            >
              <option value="">全部人物</option>
              {availableCommentCharacters.map((tag) => (
                <option key={tag} value={tag}>
                  {tag.slice(3)}
                </option>
              ))}
            </select>
          </label>
          <label>
            问题类型
            <select
              value={commentIssueType}
              onChange={(event) => setCommentIssueType(event.target.value)}
            >
              <option value="">全部类型</option>
              {availableCommentIssueTypes.map((issueType) => (
                <option key={issueType} value={issueType}>
                  {issueType}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-actions">
            <button
              disabled={readOnly || selectedCommentIds.size === 0}
              type="button"
              onClick={() => void runCommentBatch('resolve')}
            >
              批量处理
            </button>
            <button
              disabled={readOnly || selectedCommentIds.size === 0}
              type="button"
              onClick={() => void runCommentBatch('reopen')}
            >
              批量重开
            </button>
            <button
              disabled={readOnly || selectedCommentIds.size === 0}
              type="button"
              onClick={() => void runCommentBatch('tag')}
            >
              批量加标签
            </button>
          </div>
        </div>
        {visibleComments.map((comment) => (
          <article
            className="ledger-record"
            data-story-comment={comment.commentId}
            key={comment.commentId}
          >
            <label className="ledger-record__select">
              <input
                aria-label="选择批注"
                checked={selectedCommentIds.has(comment.commentId)}
                type="checkbox"
                onChange={(event) =>
                  toggleCommentSelection(comment.commentId, event.target.checked)
                }
              />
              选择
            </label>
            <p>{comment.body}</p>
            <p>
              {comment.status === 'open' ? '待处理' : '已处理'} ·{' '}
              {comment.validationIssueId ? '检查问题' : '作者批注'}
            </p>
            {(comment.tags ?? []).length > 0 ? (
              <p>标签：{(comment.tags ?? []).join(' · ')}</p>
            ) : null}
            <div className="inline-actions">
              <button
                data-author-return-key={`comment:${comment.commentId}`}
                disabled={!comment.chapterId}
                type="button"
                onClick={() =>
                  navigateToDraftLocation(comment.chapterId, comment.logicalBlockId, '该批注')
                }
              >
                前往原文
              </button>
              <button
                disabled={readOnly}
                type="button"
                onClick={() =>
                  void updateComment(
                    comment.commentId,
                    comment.status === 'open' ? 'resolve' : 'reopen',
                  )
                }
              >
                {comment.status === 'open' ? '标记批注已处理' : '重新打开批注'}
              </button>
            </div>
          </article>
        ))}
        {(catalog?.exceptions ?? []).map((exception) => (
          <article className="ledger-record" key={exception.exceptionId}>
            <p>
              已记住的例外 · {exceptionTypeLabel(exception.exceptionType)} ·{' '}
              {exception.active ? '生效中' : '已停用'}
            </p>
            {exception.notes ? <p>{exception.notes}</p> : null}
            {exception.active ? (
              <button
                disabled={readOnly}
                type="button"
                onClick={() =>
                  void bridge.validation
                    .disableException({ projectId, exceptionId: exception.exceptionId })
                    .then((outcome) => {
                      if (outcome.state === 'success') setCatalog(outcome.data);
                      else if (outcome.state === 'failure') {
                        setNotice(authorErrorSummary(outcome.error));
                      }
                    })
                }
              >
                停用此例外
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}

function validationExceptionType(value: string) {
  const normalized = value.trim().toLowerCase();
  const values = {
    倒叙: 'flashback',
    flashback: 'flashback',
    梦境: 'dream',
    dream: 'dream',
    幻觉: 'illusion',
    illusion: 'illusion',
    谎言: 'lie',
    lie: 'lie',
    不可靠叙述: 'unreliable_narration',
    隐藏身份: 'hidden_identity',
    特殊规则: 'special_rule',
    时间循环: 'time_loop',
    替身: 'double',
    平行世界: 'parallel_world',
    作者有意: 'intentional_exception',
    自定义: 'custom',
    custom: 'custom',
  } as const;
  return values[normalized as keyof typeof values] ?? null;
}

function exceptionTypeLabel(value: string): string {
  const labels: Readonly<Record<string, string>> = {
    flashback: '倒叙',
    dream: '梦境',
    illusion: '幻觉',
    lie: '谎言',
    unreliable_narration: '不可靠叙述',
    hidden_identity: '隐藏身份',
    special_rule: '特殊规则',
    time_loop: '时间循环',
    double: '替身',
    parallel_world: '平行世界',
    intentional_exception: '作者有意',
    custom: '自定义',
  };
  return labels[value] ?? value;
}

function generationStageLabel(stage: string): string {
  if (stage === 'queued') return '等待开始';
  if (stage === 'calling_model') return '正在调用智能模型';
  if (stage === 'streaming') return '正在接收内容';
  if (stage === 'validating') return '正在检查结果';
  if (stage === 'persisting') return '正在保存';
  return '处理中';
}

function issueTypeLabel(issueType: string): string {
  const known: Readonly<Record<string, string>> = {
    continuity: '前后文连续性',
    character_arc: '人物成长线',
    terminology: '专名与术语',
    timeline: '时间线',
    foreshadowing: '伏笔',
    rhythm: '连载节奏',
  };
  return known[issueType] ?? issueType.replaceAll('_', ' ');
}
