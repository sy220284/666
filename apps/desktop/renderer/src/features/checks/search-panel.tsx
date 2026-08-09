import { useEffect, useRef, useState, type FormEvent } from 'react';

import type {
  ProjectDictionaryEntry,
  ReplacePlan,
  SearchIndexState,
  SearchProjectResult,
  SearchSourceType,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import { authorTerm } from '../../presentation/author-terms.js';
import { RequestGenerationGroup } from '../../runtime/request-generation.js';
import {
  searchResultNavigationTarget,
  type AuthorNavigationTarget,
} from '../../shell/navigation-target.js';

type SearchPanelRequestLane =
  'search' | 'replace' | 'dictionary-read' | 'dictionary-mutation' | 'index';

export function SearchPanel({
  bridge,
  projectId,
  readOnly,
  onNavigate,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  const [query, setQuery] = useState('');
  const [sourceTypes, setSourceTypes] = useState<Set<SearchSourceType>>(
    new Set(['draft', 'version', 'entity']),
  );
  const [result, setResult] = useState<SearchProjectResult | null>(null);
  const [indexState, setIndexState] = useState<SearchIndexState | null>(null);
  const [plan, setPlan] = useState<ReplacePlan | null>(null);
  const [dictionary, setDictionary] = useState<readonly ProjectDictionaryEntry[]>([]);
  const [, setRequestStateVersion] = useState(0);
  const [notice, setNotice] = useState('搜索覆盖当前稿、历史版本与人物世界设定。');
  const [reloadToken, setReloadToken] = useState(0);
  const requests = useRef(new RequestGenerationGroup<SearchPanelRequestLane>());
  const searchPending = requests.current.isActive('search');
  const replacePending = requests.current.isActive('replace');
  const dictionaryReadPending = requests.current.isActive('dictionary-read');
  const dictionaryMutationPending = requests.current.isActive('dictionary-mutation');
  const dictionaryPending = dictionaryReadPending || dictionaryMutationPending;
  const indexPending = requests.current.isActive('index');
  const searchToolsPending = searchPending || replacePending || dictionaryPending || indexPending;

  const requestStateChanged = (): void => setRequestStateVersion((value) => value + 1);
  const beginRequest = (lane: SearchPanelRequestLane): number => {
    const generation = requests.current.begin(lane);
    requestStateChanged();
    return generation;
  };
  const completeRequest = (lane: SearchPanelRequestLane, generation: number): void => {
    if (requests.current.complete(lane, generation)) requestStateChanged();
  };
  const isCurrentRequest = (lane: SearchPanelRequestLane, generation: number): boolean =>
    requests.current.isCurrent(lane, generation);

  useEffect(() => {
    requests.current.invalidateAll();
    requestStateChanged();
    setResult(null);
    setPlan(null);
    setIndexState(null);
    setDictionary([]);
    return () => requests.current.invalidateAll();
  }, [bridge, projectId]);

  useEffect(() => {
    const indexGeneration = beginRequest('index');
    const dictionaryGeneration = beginRequest('dictionary-read');
    let active = true;
    setNotice('正在读取当前作品的全文搜索状态…');
    void Promise.all([
      bridge.searchTools.getIndexState({ projectId }, { mode: 'replace' }),
      bridge.searchTools.listDictionary({ projectId }, { mode: 'replace' }),
    ])
      .then(([stateOutcome, dictionaryOutcome]) => {
        if (!active) return;
        const indexCurrent = requests.current.isCurrent('index', indexGeneration);
        const dictionaryCurrent = requests.current.isCurrent(
          'dictionary-read',
          dictionaryGeneration,
        );
        const failures: string[] = [];
        if (indexCurrent && stateOutcome.state === 'success') setIndexState(stateOutcome.data);
        else if (indexCurrent && stateOutcome.state === 'failure')
          failures.push(`全文搜索状态读取失败：${authorErrorSummary(stateOutcome.error)}`);
        if (dictionaryCurrent && dictionaryOutcome.state === 'success') {
          setDictionary(dictionaryOutcome.data.entries);
        } else if (dictionaryCurrent && dictionaryOutcome.state === 'failure') {
          failures.push(`作品词典读取失败：${authorErrorSummary(dictionaryOutcome.error)}`);
        }
        if (indexCurrent && dictionaryCurrent) {
          setNotice(
            failures.length > 0
              ? `${failures.join(' ')} 可以重新读取。`
              : '搜索覆盖当前稿、历史版本与人物世界设定。',
          );
        }
      })
      .catch(() => {
        if (active) setNotice('搜索工具读取异常；现有作品数据没有变化，可以重新读取。');
      })
      .finally(() => {
        completeRequest('index', indexGeneration);
        completeRequest('dictionary-read', dictionaryGeneration);
      });
    return () => {
      active = false;
      requests.current.invalidate('index');
      requests.current.invalidate('dictionary-read');
    };
  }, [bridge, projectId, reloadToken]);

  const search = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!query.trim() || sourceTypes.size === 0) return;
    const generation = beginRequest('search');
    try {
      const outcome = await bridge.searchTools.search({
        projectId,
        query,
        sourceTypes: [...sourceTypes],
        includeArchived: false,
        limit: 100,
      });
      if (!isCurrentRequest('search', generation)) return;
      if (outcome.state === 'success') {
        setResult(outcome.data);
        setNotice(
          `找到 ${outcome.data.items.length} 项 · ${searchStrategyLabel(outcome.data.strategy)} · ${searchIndexStatusLabel(outcome.data.indexStatus)}`,
        );
      } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
    } finally {
      completeRequest('search', generation);
    }
  };

  const previewReplace = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    const generation = beginRequest('replace');
    const values = new FormData(event.currentTarget);
    try {
      const outcome = await bridge.searchTools.previewReplace({
        projectId,
        query: String(values.get('query') ?? ''),
        replacement: String(values.get('replacement') ?? ''),
        matchCase: values.get('matchCase') === 'on',
        maxMatches: 2_000,
      });
      if (!isCurrentRequest('replace', generation)) return;
      if (outcome.state === 'success') {
        setPlan(outcome.data);
        setNotice(
          `替换范围已预览 · 可以替换 ${outcome.data.eligibleCount} · 已锁定跳过 ${outcome.data.lockedCount}`,
        );
      } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
    } finally {
      completeRequest('replace', generation);
    }
  };

  const applyReplace = async (): Promise<void> => {
    if (!plan || readOnly) return;
    const generation = beginRequest('replace');
    try {
      const outcome = await bridge.searchTools.applyReplace({
        projectId,
        planId: plan.planId,
      });
      if (!isCurrentRequest('replace', generation)) return;
      if (outcome.state === 'success') {
        setPlan(outcome.data.plan);
        setNotice(`替换完成 · ${outcome.data.changedDrafts.length} 个当前稿 · 已创建恢复点。`);
      } else if (outcome.state === 'failure') {
        setNotice(authorErrorSummary(outcome.error));
      }
    } finally {
      completeRequest('replace', generation);
    }
  };

  const saveDictionary = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (readOnly) return;
    const generation = beginRequest('dictionary-mutation');
    const form = event.currentTarget;
    const values = new FormData(form);
    const action = String(values.get('action')) as 'canonical' | 'alias' | 'ignore' | 'replace';
    const replacementTerm = String(values.get('replacementTerm') ?? '').trim();
    try {
      const outcome = await bridge.searchTools.upsertDictionary({
        projectId,
        authority: 'author',
        term: String(values.get('term') ?? ''),
        category: 'terminology',
        action,
        replacementTerm: replacementTerm || null,
        notes: String(values.get('notes') ?? ''),
      });
      if (!isCurrentRequest('dictionary-mutation', generation)) return;
      if (outcome.state === 'success') {
        setDictionary(outcome.data.entries);
        form.reset();
        setNotice('作品词典已保存。');
      } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
    } finally {
      completeRequest('dictionary-mutation', generation);
    }
  };

  const rebuildIndex = async (): Promise<void> => {
    const generation = beginRequest('index');
    try {
      const outcome = await bridge.searchTools.rebuildIndex({ projectId });
      if (!isCurrentRequest('index', generation)) return;
      if (outcome.state === 'failure') {
        setNotice(authorErrorSummary(outcome.error));
        return;
      }
      if (outcome.state !== 'success') return;
      setNotice(`全文搜索重建完成 · ${searchIndexStatusLabel(outcome.data.status)}`);
      const stateOutcome = await bridge.searchTools.getIndexState({ projectId });
      if (!isCurrentRequest('index', generation)) return;
      if (stateOutcome.state === 'success') setIndexState(stateOutcome.data);
    } finally {
      completeRequest('index', generation);
    }
  };

  const deleteDictionary = async (entry: ProjectDictionaryEntry): Promise<void> => {
    const generation = beginRequest('dictionary-mutation');
    try {
      const outcome = await bridge.searchTools.deleteDictionary({
        projectId,
        authority: 'author',
        term: entry.term,
      });
      if (!isCurrentRequest('dictionary-mutation', generation)) return;
      if (outcome.state === 'success') {
        setDictionary(outcome.data.entries);
        setNotice('作品词典词条已删除。');
      } else if (outcome.state === 'failure') setNotice(authorErrorSummary(outcome.error));
    } finally {
      completeRequest('dictionary-mutation', generation);
    }
  };

  const navigateToResult = (item: SearchProjectResult['items'][number]): void => {
    const target = searchResultNavigationTarget(projectId, item, result?.query ?? query);
    if (!target) {
      setNotice('目标章节已经变化，系统没有跳转到可能错误的位置。请重新搜索。');
      return;
    }
    onNavigate(target);
  };

  return (
    <section className="feature-card" data-project-search>
      <div className="feature-card__heading">
        <div>
          <h2>全文搜索与安全替换</h2>
          <p>历史版本与设定只读；替换范围只能包含正在使用的当前稿正文块。</p>
        </div>
        <div>
          <button
            disabled={searchToolsPending}
            type="button"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            重新读取搜索状态
          </button>
          <button
            disabled={searchToolsPending || readOnly}
            type="button"
            onClick={() => void rebuildIndex()}
          >
            {indexPending ? '正在重建…' : '重建全文搜索'}
          </button>
        </div>
      </div>
      <p className="feature-status" role="status">
        {notice} · 等待更新 {indexState?.pendingCount ?? 0} · 失败 {indexState?.failedCount ?? 0}
      </p>
      <form className="filter-bar" onSubmit={(event) => void search(event)}>
        <input
          aria-label="全文搜索词"
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
            {source === 'draft'
              ? authorTerm('draft')
              : source === 'version'
                ? authorTerm('version')
                : '人物设定'}
          </label>
        ))}
        <button disabled={searchToolsPending} type="submit">
          {searchPending ? '正在搜索…' : '搜索'}
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
            <p>{searchSourceLabel(item.sourceType)}</p>
            <p>{item.excerpt}</p>
            <button
              data-author-return-key={`search:${item.sourceType}:${item.targetId}:${item.anchorId ?? 'root'}`}
              type="button"
              onClick={() => navigateToResult(item)}
            >
              {item.sourceType === 'entity' ? '打开人物设定' : '打开命中位置'}
            </button>
          </article>
        ))}
      </div>

      <details>
        <summary>批量替换</summary>
        <form className="form-grid" onSubmit={(event) => void previewReplace(event)}>
          <label>
            查找
            <input name="query" required onChange={() => setPlan(null)} />
          </label>
          <label>
            替换为
            <input name="replacement" onChange={() => setPlan(null)} />
          </label>
          <label>
            <input defaultChecked name="matchCase" type="checkbox" onChange={() => setPlan(null)} />
            区分大小写
          </label>
          <button disabled={searchToolsPending || readOnly} type="submit">
            {replacePending ? '正在处理…' : '预览替换范围'}
          </button>
        </form>
        {plan ? (
          <div data-replace-plan={plan.planId}>
            <p>
              {replacePlanStatusLabel(plan.status)} · 命中 {plan.itemCount} · 可以替换{' '}
              {plan.eligibleCount} · 已锁定跳过 {plan.lockedCount}
            </p>
            {plan.items.map((item) => (
              <p key={item.planItemId}>
                {item.locked ? '已锁定，跳过' : '可以替换'} · {item.matchedText} →{' '}
                {item.replacement} · 基于当前保存状态
              </p>
            ))}
            <button
              disabled={searchToolsPending || readOnly || plan.status !== 'preview'}
              type="button"
              onClick={() => void applyReplace()}
            >
              {replacePending ? '正在替换…' : '创建恢复点并替换'}
            </button>
          </div>
        ) : null}
      </details>

      <details>
        <summary>作品词典</summary>
        <form className="form-grid" onSubmit={(event) => void saveDictionary(event)}>
          <input name="term" placeholder="专名或别名" required />
          <select name="action" defaultValue="canonical">
            <option value="canonical">规范词</option>
            <option value="alias">别名</option>
            <option value="ignore">忽略</option>
            <option value="replace">替换建议</option>
          </select>
          <input name="replacementTerm" placeholder="别名或替换目标" />
          <input name="notes" placeholder="备注" />
          <button disabled={dictionaryPending || readOnly} type="submit">
            {dictionaryMutationPending ? '正在保存…' : '保存词条'}
          </button>
        </form>
        {dictionary.map((entry) => (
          <p key={entry.normalizedTerm}>
            {entry.term} · {dictionaryActionLabel(entry.action)}
            {entry.replacementTerm ? ` → ${entry.replacementTerm}` : ''}
            <button
              disabled={dictionaryPending || readOnly}
              type="button"
              onClick={() => void deleteDictionary(entry)}
            >
              删除
            </button>
          </p>
        ))}
      </details>
    </section>
  );
}

function searchSourceLabel(source: SearchSourceType): string {
  if (source === 'draft') return '当前稿';
  if (source === 'version') return '历史版本 · 只读';
  return '人物世界设定 · 专用编辑入口';
}

function searchStrategyLabel(strategy: SearchProjectResult['strategy']): string {
  if (strategy === 'fts') return '全文搜索';
  if (strategy === 'dictionary') return '作品词典';
  return '权威数据补充搜索';
}

function searchIndexStatusLabel(status: SearchProjectResult['indexStatus']): string {
  if (status === 'ready') return '全文搜索已就绪';
  if (status === 'rebuilding') return '正在重建全文搜索';
  return '全文搜索需要更新';
}

function replacePlanStatusLabel(status: ReplacePlan['status']): string {
  if (status === 'preview') return '等待确认';
  if (status === 'applied') return '已经替换';
  if (status === 'stale') return '预览已经过期';
  return '已取消';
}

function dictionaryActionLabel(action: ProjectDictionaryEntry['action']): string {
  if (action === 'canonical') return '规范词';
  if (action === 'alias') return '别名';
  if (action === 'ignore') return '忽略';
  return '替换建议';
}
