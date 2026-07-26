import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  GenerationRun,
  ProjectStructure,
  ProviderSummary,
  ValidationCatalog,
  ValidationIssue,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

interface ChecksWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
}

const ISSUE_ACTIONS = [
  ['resolve', '解决'],
  ['ignore', '忽略'],
  ['mute', '静音规则'],
  ['downgrade', '降级'],
  ['false_positive', '误报'],
  ['reopen', '重新打开'],
] as const;

export function ChecksWorkbench({ bridge, projectId, readOnly }: ChecksWorkbenchProps) {
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [catalog, setCatalog] = useState<ValidationCatalog | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [chapterId, setChapterId] = useState('');
  const [includeClosed, setIncludeClosed] = useState(true);
  const [pending, setPending] = useState(false);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [notice, setNotice] = useState('检查只读取当前 Final Version，不会自动改写正文。');

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

  const refreshCatalog = useCallback(async (): Promise<void> => {
    const outcome = await bridge.validation.list(
      { projectId, chapterId: chapterId || null, includeClosed },
      { mode: 'replace' },
    );
    if (outcome.state === 'success') setCatalog(outcome.data);
    else if (outcome.state === 'failure') setNotice(`检查读取失败 · ${outcome.error.code}`);
  }, [bridge, chapterId, includeClosed, projectId]);

  useEffect(() => {
    void Promise.all([
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
      bridge.providers.list({ mode: 'replace' }),
      bridge.validation.list(
        { projectId, chapterId: null, includeClosed: true },
        { mode: 'replace' },
      ),
    ]).then(([structureOutcome, providerOutcome, validationOutcome]) => {
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
      if (validationOutcome.state === 'success') setCatalog(validationOutcome.data);
    });
  }, [bridge, projectId]);

  useEffect(() => void refreshCatalog(), [refreshCatalog]);

  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setInterval(() => {
      void bridge.generation.getRun(projectId, activeRun.runId).then((outcome) => {
        if (outcome.state !== 'success') return;
        setActiveRun(outcome.data);
        setNotice(`AI语义检查 · ${outcome.data.stage} · ${outcome.data.status}`);
        if (['succeeded', 'failed', 'cancelled'].includes(outcome.data.status)) {
          window.clearInterval(timer);
          setPending(false);
          void refreshCatalog();
        }
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeRun?.runId, bridge, projectId, refreshCatalog]);

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
    } else if (outcome.state === 'failure') setNotice(`规则检查失败 · ${outcome.error.code}`);
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
      setNotice(`AI语义检查已启动 · ${outcome.data.run.stage}`);
    } else {
      setPending(false);
      setNotice(
        outcome.state === 'failure' ? `AI语义检查未启动 · ${outcome.error.code}` : '请求已取消。',
      );
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
    else if (outcome.state === 'failure') setNotice(`问题操作失败 · ${outcome.error.code}`);
  };

  const createTodo = async (issue: ValidationIssue): Promise<void> => {
    if (readOnly) return;
    const outcome = await bridge.validation.createTodoFromIssue({
      projectId,
      issueId: issue.issueId,
    });
    if (outcome.state === 'success') {
      setCatalog(outcome.data);
      setNotice('已创建与问题锚点关联的待办。');
    } else if (outcome.state === 'failure') setNotice(`待办创建失败 · ${outcome.error.code}`);
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
    else if (outcome.state === 'failure') setNotice(`批注保存失败 · ${outcome.error.code}`);
  };

  return (
    <section className="checks-workbench" data-checks-workbench aria-label="检查工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">Validation</p>
          <h1>规则与 AI 语义检查</h1>
          <p>检查结果保留证据锚点；只有作者可以解决、忽略或转为待办。</p>
        </div>
      </header>
      <section className="feature-card">
        <div className="filter-bar">
          <label>
            Final Version 章节
            <select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>
              <option value="">选择章节</option>
              {chapters.map((item) => (
                <option disabled={!item.finalVersionId} key={item.id} value={item.id}>
                  {item.title}
                  {item.finalVersionId ? '' : '（尚无 Final Version）'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Provider
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              <option value="">选择 Provider</option>
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
            包含已关闭
          </label>
          <button disabled={pending || readOnly || !chapter?.finalVersionId} onClick={runRules}>
            运行规则检查
          </button>
          <button
            disabled={pending || readOnly || !chapter?.finalVersionId || !providerId}
            onClick={runAi}
          >
            运行 AI 语义检查
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
                  {issue.issueType} · {issue.severity}
                </h3>
                <p>
                  {issue.source === 'rule' ? '确定性规则' : 'AI语义检查'} · {issue.status} · 锚点{' '}
                  {issue.anchor.state === 'current' ? '有效' : '已过期'}
                </p>
                <p>{issue.rationale}</p>
                {issue.anchor.textQuote ? <blockquote>{issue.anchor.textQuote}</blockquote> : null}
                {issue.suggestion ? <p>建议：{issue.suggestion}</p> : null}
                <details>
                  <summary>证据与版本</summary>
                  <p>Version：{issue.anchor.versionId ?? '项目级'}</p>
                  <p>Block：{issue.anchor.logicalBlockId ?? '无块锚点'}</p>
                  <p>{issue.evidenceIds.join(' · ')}</p>
                </details>
                <div className="inline-actions">
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
                  <button disabled={readOnly} type="button" onClick={() => void createTodo(issue)}>
                    转为待办
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
        <h2>待办与批注</h2>
        {(catalog?.todos ?? []).map((todo) => (
          <article className="ledger-record" key={todo.todoId}>
            <p>
              {todo.title} · {todo.status}
            </p>
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
                  })
              }
            >
              {todo.status === 'open' ? '完成' : '重新打开'}
            </button>
          </article>
        ))}
        {(catalog?.comments ?? []).map((comment) => (
          <article className="ledger-record" key={comment.commentId}>
            <p>{comment.body}</p>
            <p>{comment.status}</p>
            {comment.status === 'open' ? (
              <button
                disabled={readOnly}
                type="button"
                onClick={() =>
                  void bridge.validation
                    .resolveComment({ projectId, commentId: comment.commentId })
                    .then((outcome) => {
                      if (outcome.state === 'success') setCatalog(outcome.data);
                    })
                }
              >
                解决批注
              </button>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}
