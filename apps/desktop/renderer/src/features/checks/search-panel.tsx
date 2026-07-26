import { useEffect, useState, type FormEvent } from 'react';

import type {
  ProjectDictionaryEntry,
  ReplacePlan,
  SearchIndexState,
  SearchProjectResult,
  SearchSourceType,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';

export function SearchPanel({
  bridge,
  projectId,
  readOnly,
  onOpenCanon,
  onOpenWriting,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onOpenCanon: () => void;
  readonly onOpenWriting: () => void;
}) {
  const [query, setQuery] = useState('');
  const [sourceTypes, setSourceTypes] = useState<Set<SearchSourceType>>(
    new Set(['draft', 'version', 'entity']),
  );
  const [result, setResult] = useState<SearchProjectResult | null>(null);
  const [indexState, setIndexState] = useState<SearchIndexState | null>(null);
  const [plan, setPlan] = useState<ReplacePlan | null>(null);
  const [dictionary, setDictionary] = useState<readonly ProjectDictionaryEntry[]>([]);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('搜索覆盖活动当前稿、历史 Version 与人物世界设定。');

  useEffect(() => {
    void Promise.all([
      bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' }),
      bridge.searchTools.listDictionary({ projectId }, { mode: 'replace' }),
    ]).then(([stateOutcome, dictionaryOutcome]) => {
      if (stateOutcome.state === 'success') setIndexState(stateOutcome.data);
      if (dictionaryOutcome.state === 'success') setDictionary(dictionaryOutcome.data.entries);
    });
  }, [bridge, projectId]);

  const search = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!query.trim() || sourceTypes.size === 0) return;
    setPending(true);
    const outcome = await bridge.searchTools.search({
      projectId,
      query,
      sourceTypes: [...sourceTypes],
      includeArchived: false,
      limit: 100,
    });
    setPending(false);
    if (outcome.state === 'success') {
      setResult(outcome.data);
      setNotice(
        `找到 ${outcome.data.items.length} 项 · ${outcome.data.strategy} · 索引 ${outcome.data.indexStatus}`,
      );
    } else if (outcome.state === 'failure') setNotice(`搜索失败 · ${outcome.error.code}`);
  };

  const previewReplace = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    const values = new FormData(event.currentTarget);
    setPending(true);
    const outcome = await bridge.searchTools.previewReplace({
      projectId,
      query: String(values.get('query') ?? ''),
      replacement: String(values.get('replacement') ?? ''),
      matchCase: values.get('matchCase') === 'on',
      maxMatches: 2_000,
    });
    setPending(false);
    if (outcome.state === 'success') {
      setPlan(outcome.data);
      setNotice(
        `替换计划已生成 · 可替换 ${outcome.data.eligibleCount} · 锁定跳过 ${outcome.data.lockedCount}`,
      );
    } else if (outcome.state === 'failure') setNotice(`预览失败 · ${outcome.error.code}`);
  };

  const applyReplace = async (): Promise<void> => {
    if (!plan || readOnly) return;
    setPending(true);
    const outcome = await bridge.searchTools.applyReplace({
      projectId,
      planId: plan.planId,
    });
    setPending(false);
    if (outcome.state === 'success') {
      setPlan(outcome.data.plan);
      setNotice(
        `替换完成 · ${outcome.data.changedDrafts.length} 个当前稿 · 恢复点 ${outcome.data.checkpoint.backupId}`,
      );
    } else if (outcome.state === 'failure') {
      setNotice(`计划已过期或提交失败 · ${outcome.error.code}`);
    }
  };

  const saveDictionary = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const action = String(values.get('action')) as 'canonical' | 'alias' | 'ignore' | 'replace';
    const replacementTerm = String(values.get('replacementTerm') ?? '').trim();
    const outcome = await bridge.searchTools.upsertDictionary({
      projectId,
      authority: 'author',
      term: String(values.get('term') ?? ''),
      category: 'terminology',
      action,
      replacementTerm: replacementTerm || null,
      notes: String(values.get('notes') ?? ''),
    });
    if (outcome.state === 'success') {
      setDictionary(outcome.data.entries);
      form.reset();
    } else if (outcome.state === 'failure') setNotice(`词典保存失败 · ${outcome.error.code}`);
  };

  return (
    <section className="feature-card" data-project-search>
      <div className="feature-card__heading">
        <div>
          <h2>全项目搜索与安全替换</h2>
          <p>Version 与设定只读；替换计划只能包含活动当前稿正文块。</p>
        </div>
        <button
          disabled={pending || readOnly}
          type="button"
          onClick={() =>
            void bridge.searchTools.rebuildIndex({ projectId }).then((outcome) => {
              if (outcome.state === 'success') {
                setNotice(`索引重建完成 · ${outcome.data.status}`);
                void bridge.searchTools.getIndexState({ projectId }).then((stateOutcome) => {
                  if (stateOutcome.state === 'success') setIndexState(stateOutcome.data);
                });
              }
            })
          }
        >
          重建索引
        </button>
      </div>
      <p className="feature-status" role="status">
        {notice} · 待索引 {indexState?.pendingCount ?? 0} · 失败 {indexState?.failedCount ?? 0}
      </p>
      <form className="filter-bar" onSubmit={(event) => void search(event)}>
        <input
          aria-label="全项目搜索词"
          placeholder="搜索正文、历史版本和设定"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {(['draft', 'version', 'entity'] as const).map((source) => (
          <label key={source}>
            <input
              checked={sourceTypes.has(source)}
              type="checkbox"
              onChange={(event) =>
                setSourceTypes((current) => {
                  const next = new Set(current);
                  if (event.target.checked) next.add(source);
                  else next.delete(source);
                  return next;
                })
              }
            />
            {source === 'draft' ? '当前稿' : source === 'version' ? 'Version' : '人物设定'}
          </label>
        ))}
        <button disabled={pending} type="submit">
          搜索
        </button>
      </form>
      <div className="ledger-list">
        {result?.items.map((item) => (
          <article
            className="ledger-record"
            data-search-source={item.sourceType}
            key={`${item.sourceType}:${item.targetId}:${item.anchorId ?? ''}`}
          >
            <h3>{item.title}</h3>
            <p>
              {item.sourceType === 'draft'
                ? '活动当前稿'
                : item.sourceType === 'version'
                  ? '历史 Version · 只读'
                  : '人物世界设定 · 专用编辑入口'}
            </p>
            <p>{item.excerpt}</p>
            <button
              type="button"
              onClick={item.sourceType === 'entity' ? onOpenCanon : onOpenWriting}
            >
              {item.sourceType === 'entity' ? '前往设定' : '前往写作'}
            </button>
          </article>
        ))}
      </div>

      <details>
        <summary>批量替换</summary>
        <form className="form-grid" onSubmit={(event) => void previewReplace(event)}>
          <label>
            查找
            <input name="query" required />
          </label>
          <label>
            替换为
            <input name="replacement" />
          </label>
          <label>
            <input defaultChecked name="matchCase" type="checkbox" />
            区分大小写
          </label>
          <button disabled={pending || readOnly} type="submit">
            生成 ReplacePlan
          </button>
        </form>
        {plan ? (
          <div data-replace-plan={plan.planId}>
            <p>
              {plan.status} · 命中 {plan.itemCount} · 可替换 {plan.eligibleCount} · 锁定跳过{' '}
              {plan.lockedCount}
            </p>
            {plan.items.map((item) => (
              <p key={item.planItemId}>
                {item.locked ? '🔒 跳过' : '可替换'} · {item.matchedText} → {item.replacement} ·
                Revision {item.baseRevision}
              </p>
            ))}
            <button
              disabled={pending || readOnly || plan.status !== 'preview'}
              type="button"
              onClick={() => void applyReplace()}
            >
              创建恢复点并提交
            </button>
          </div>
        ) : null}
      </details>

      <details>
        <summary>项目词典</summary>
        <form className="form-grid" onSubmit={(event) => void saveDictionary(event)}>
          <input name="term" placeholder="专名或别名" required />
          <select name="action" defaultValue="canonical">
            <option value="canonical">规范词</option>
            <option value="alias">别名</option>
            <option value="ignore">忽略</option>
            <option value="replace">替换建议</option>
          </select>
          <input name="replacementTerm" placeholder="别名/替换目标" />
          <input name="notes" placeholder="备注" />
          <button disabled={readOnly} type="submit">
            保存词条
          </button>
        </form>
        {dictionary.map((entry) => (
          <p key={entry.normalizedTerm}>
            {entry.term} · {entry.action}
            {entry.replacementTerm ? ` → ${entry.replacementTerm}` : ''}
            <button
              disabled={readOnly}
              type="button"
              onClick={() =>
                void bridge.searchTools
                  .deleteDictionary({ projectId, authority: 'author', term: entry.term })
                  .then((outcome) => {
                    if (outcome.state === 'success') setDictionary(outcome.data.entries);
                  })
              }
            >
              删除
            </button>
          </p>
        ))}
      </details>
    </section>
  );
}
