import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  ContinuityCatalog,
  EndingSnapshotReadResult,
  EntityType,
  NarrativePlanningCatalog,
  StateProposal,
  StateProposalCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../../bridge/request-lifecycle.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';

export type CanonSection = 'entities' | 'continuity' | 'narrative' | 'proposals';

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly onSectionChange: (section: CanonSection) => void;
}

export function CanonWorkbench({
  bridge,
  projectId,
  projectName,
  readOnly,
  section,
  onSectionChange,
}: CanonWorkbenchProps) {
  return (
    <section className="canon-workbench" data-canon-dialog aria-label="设定工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">Canon</p>
          <h1>设定与连续性工作台</h1>
          <p>作者Canon、动态历史、叙事规划和pending提案保持清晰分层。</p>
        </div>
      </header>
      <nav className="feature-tabs" aria-label="设定工作台分区">
        <Tab
          current={section === 'entities'}
          label="实体与Canon"
          onClick={() => onSectionChange('entities')}
        />
        <Tab
          current={section === 'continuity'}
          label="动态状态与时间线"
          marker="open-continuity"
          onClick={() => onSectionChange('continuity')}
        />
        <Tab
          current={section === 'narrative'}
          label="伏笔与弧光"
          marker="open-narrative-planning"
          onClick={() => onSectionChange('narrative')}
        />
        <Tab
          current={section === 'proposals'}
          label="状态提案"
          marker="open-state-proposals"
          onClick={() => onSectionChange('proposals')}
        />
      </nav>
      {section === 'entities' ? (
        <EntityCanonPanel bridge={bridge} projectId={projectId} readOnly={readOnly} />
      ) : null}
      {section === 'continuity' ? (
        <ContinuityPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
        />
      ) : null}
      {section === 'narrative' ? (
        <NarrativePanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
        />
      ) : null}
      {section === 'proposals' ? (
        <StateProposalPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
        />
      ) : null}
    </section>
  );
}

function Tab({
  current,
  label,
  marker,
  onClick,
}: {
  readonly current: boolean;
  readonly label: string;
  readonly marker?: 'open-continuity' | 'open-narrative-planning' | 'open-state-proposals';
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-current={current ? 'page' : undefined}
      className={current ? 'is-active' : ''}
      data-open-continuity={marker === 'open-continuity' ? '' : undefined}
      data-open-narrative-planning={marker === 'open-narrative-planning' ? '' : undefined}
      data-open-state-proposals={marker === 'open-state-proposals' ? '' : undefined}
      type="button"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function EntityCanonPanel({
  bridge,
  projectId,
  readOnly,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
}) {
  const load = useCallback(
    () => bridge.canon.list({ projectId, includeArchived: true }, { mode: 'replace' }),
    [bridge, projectId],
  );
  const resource = useBridgeQuery(`canon:${projectId}`, load);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newEntity, setNewEntity] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const command = useBridgeCommand(resource.refresh);
  const selected = resource.data?.entities.find((entity) => entity.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && resource.data?.entities[0]) setSelectedId(resource.data.entities[0].id);
  }, [resource.data, selectedId]);

  const saveEntity = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const fields = {
      entityType: String(values.get('entityType')) as EntityType,
      name: String(values.get('name') ?? ''),
      aliases: lineValues(values.get('aliases')),
      summary: String(values.get('summary') ?? ''),
    };
    const result =
      selected && !newEntity
        ? await command.run(() =>
            bridge.canon.update({
              projectId,
              authority: 'author',
              entityId: selected.id,
              patch: fields,
            }),
          )
        : await command.run(() =>
            bridge.canon.create({ projectId, authority: 'author', ...fields }),
          );
    if (result) {
      const match = result.entities.find((entity) => entity.name === fields.name);
      setSelectedId(match?.id ?? null);
      setNewEntity(false);
      setNotice('实体已由作者命令写入项目数据库。');
    }
  };

  const setFact = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    let value: Parameters<RendererBridgeAdapter['canon']['setFact']>[0]['value'];
    try {
      value = JSON.parse(String(values.get('value') ?? 'null')) as Parameters<
        RendererBridgeAdapter['canon']['setFact']
      >[0]['value'];
    } catch {
      setNotice('事实值必须是有效JSON。');
      return;
    }
    const result = await command.run(() =>
      bridge.canon.setFact({
        projectId,
        authority: 'author',
        entityId: selected.id,
        factKey: String(values.get('factKey') ?? ''),
        value,
        description: String(values.get('description') ?? ''),
        sourceType: 'author',
        sourceId: null,
      }),
    );
    if (result) {
      event.currentTarget.reset();
      setNotice('静态事实已确认；同一事实键的旧值保留为历史记录。');
    }
  };

  const archive = async (): Promise<void> => {
    if (!selected || !window.confirm(`归档“${selected.name}”？`)) return;
    const result = await command.run(() =>
      bridge.canon.archive({ projectId, authority: 'author', entityId: selected.id }),
    );
    if (result) setNotice('实体已归档；永久删除仍需通过引用预览与名称确认。');
  };
  const remove = async (): Promise<void> => {
    if (!selected || selected.status !== 'archived') return;
    const preview = await command.run(() =>
      bridge.canon.previewDelete({ projectId, entityId: selected.id }),
    );
    if (!preview) return;
    if (!preview.canDelete) {
      setNotice(`禁止删除：${preview.blockers.join('；')}`);
      return;
    }
    const confirmation = window.prompt(`输入实体名称“${selected.name}”确认永久删除：`);
    if (confirmation !== selected.name) {
      setNotice('名称确认不匹配，已取消永久删除。');
      return;
    }
    const result = await command.run(() =>
      bridge.canon.delete({
        projectId,
        authority: 'author',
        entityId: selected.id,
        confirmName: selected.name,
      }),
    );
    if (result) {
      setSelectedId(null);
      setNotice('实体已永久删除。');
    }
  };

  return (
    <div className="canon-grid">
      <aside className="feature-card">
        <div className="feature-card__heading">
          <h2>实体</h2>
          <button
            className="primary-button"
            data-new-entity
            disabled={readOnly}
            type="button"
            onClick={() => {
              setNewEntity(true);
              setSelectedId(null);
            }}
          >
            新建
          </button>
        </div>
        <label>
          选择实体
          <select
            data-canon-entity-select
            value={selectedId ?? ''}
            onChange={(event) => {
              setNewEntity(false);
              setSelectedId(event.target.value || null);
            }}
          >
            <option value="">未选择</option>
            {resource.data?.entities.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name} · {entity.entityType}
                {entity.status === 'archived' ? ' · 已归档' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="feature-status" data-canon-status>
          {command.error
            ? `${command.error.message} · ${command.error.code}`
            : notice
              ? notice
              : resource.state === 'loading'
                ? '正在读取实体与Canon…'
                : `实体 ${resource.data?.entities.length ?? 0}`}
        </p>
      </aside>
      <main className="feature-card">
        <h2 data-canon-entity-mode>
          {newEntity ? '新建实体' : selected ? `编辑：${selected.name}` : '选择一个实体'}
        </h2>
        {newEntity || selected ? (
          <form
            className="stacked-form"
            data-canon-entity-form
            key={newEntity ? 'new' : selected?.id}
            onSubmit={(event) => void saveEntity(event)}
          >
            <label>
              类型
              <select name="entityType" defaultValue={selected?.entityType ?? 'character'}>
                {[
                  'character',
                  'location',
                  'faction',
                  'item',
                  'ability',
                  'rule',
                  'event',
                  'custom',
                ].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input name="name" defaultValue={selected?.name ?? ''} required />
            </label>
            <label>
              别名（每行一个）
              <textarea name="aliases" defaultValue={selected?.aliases.join('\n') ?? ''} />
            </label>
            <label>
              摘要
              <textarea name="summary" defaultValue={selected?.summary ?? ''} />
            </label>
            <div className="inline-actions">
              <button
                className="primary-button"
                data-canon-write
                disabled={readOnly || command.pending}
                type="submit"
              >
                保存实体
              </button>
              {selected ? (
                <button
                  data-archive-entity
                  disabled={readOnly || command.pending || selected.status === 'archived'}
                  type="button"
                  onClick={() => void archive()}
                >
                  归档
                </button>
              ) : null}
              {selected ? (
                <button
                  data-delete-entity
                  disabled={readOnly || command.pending || selected.status !== 'archived'}
                  type="button"
                  onClick={() => void remove()}
                >
                  永久删除
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </main>
      <aside className="feature-card">
        <h2>Canon事实</h2>
        <div data-canon-fact-list>
          {selected?.facts.length ? (
            selected.facts.map((fact) => (
              <article className="feature-row" key={fact.id}>
                <div>
                  <strong>{fact.factKey}</strong>
                  <span>
                    {fact.status} · {JSON.stringify(fact.value)}
                  </span>
                </div>
                <p>{fact.description}</p>
              </article>
            ))
          ) : (
            <p>暂无事实。</p>
          )}
        </div>
        {selected ? (
          <form
            className="stacked-form"
            data-canon-fact-form
            onSubmit={(event) => void setFact(event)}
          >
            <label>
              事实键
              <input name="factKey" required />
            </label>
            <label>
              JSON值
              <textarea name="value" defaultValue="null" required />
            </label>
            <label>
              说明
              <textarea name="description" />
            </label>
            <button
              className="primary-button"
              data-canon-write
              disabled={readOnly || command.pending}
              type="submit"
            >
              确认事实
            </button>
          </form>
        ) : null}
      </aside>
    </div>
  );
}

function ContinuityPanel({
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
  const [query, setQuery] = useState('');
  const [effectiveChapter, setEffectiveChapter] = useState('');
  const [history, setHistory] = useState(true);
  const [archived, setArchived] = useState(false);
  const load = useCallback(
    () =>
      bridge.continuity.list(
        {
          projectId,
          query,
          includeHistory: history,
          includeArchivedEvents: archived,
          effectiveAtChapterId: effectiveChapter || null,
        },
        { mode: 'replace' },
      ),
    [archived, bridge, effectiveChapter, history, projectId, query],
  );
  const resource = useBridgeQuery(
    `continuity:${projectId}:${query}:${effectiveChapter}:${history}:${archived}`,
    load,
  );
  return (
    <section className="feature-card" data-continuity-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>动态状态、时间线与知情信息</h2>
          <p>当前和历史记录由有效区间分离。</p>
        </div>
        <button type="button" onClick={() => void resource.refresh()}>
          读取
        </button>
      </div>
      <div className="filter-bar">
        <input
          aria-label="搜索连续性记录"
          placeholder="搜索状态键、事件、信息键"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <input
          aria-label="生效章节ID"
          placeholder="可选：生效章节UUID"
          value={effectiveChapter}
          onChange={(event) => setEffectiveChapter(event.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={history}
            onChange={(event) => setHistory(event.target.checked)}
          />
          包含历史
        </label>
        <label>
          <input
            type="checkbox"
            checked={archived}
            onChange={(event) => setArchived(event.target.checked)}
          />
          包含归档事件
        </label>
      </div>
      <p className="feature-status" data-continuity-status>
        {resource.error
          ? `读取失败：${resource.error.code}`
          : resource.state === 'success'
            ? `项目：${projectName}`
            : '读取中…'}
      </p>
      <ContinuityResults catalog={resource.data} />
      <ContinuityEditors
        bridge={bridge}
        catalog={resource.data}
        projectId={projectId}
        readOnly={readOnly}
        onRefresh={resource.refresh}
      />
    </section>
  );
}

function ContinuityResults({ catalog }: { readonly catalog: ContinuityCatalog | null }) {
  return (
    <div className="ledger-grid" data-continuity-results>
      <LedgerSection title={`动态状态（${catalog?.entityStates.length ?? 0}）`}>
        {catalog?.entityStates.map((state) => (
          <LedgerRecord
            key={state.id}
            title={state.stateKey}
            lines={[
              state.recordStatus,
              JSON.stringify(state.value),
              `${state.validFromChapterId} → ${state.validUntilChapterId ?? '当前'}`,
            ]}
          />
        ))}
      </LedgerSection>
      <LedgerSection title={`时间线事件（${catalog?.timelineEvents.length ?? 0}）`}>
        {catalog?.timelineEvents.map((event) => (
          <LedgerRecord
            key={event.id}
            title={event.title}
            lines={[
              event.status,
              `${event.startValue} → ${event.endValue ?? event.startValue}`,
              event.description,
            ]}
          />
        ))}
      </LedgerSection>
      <LedgerSection title={`知情状态（${catalog?.knowledgeStates.length ?? 0}）`}>
        {catalog?.knowledgeStates.map((state) => (
          <LedgerRecord
            key={state.id}
            title={state.informationKey}
            lines={[state.knowledgeStatus, state.recordStatus, state.notes]}
          />
        ))}
      </LedgerSection>
    </div>
  );
}

function ContinuityEditors({
  bridge,
  catalog,
  projectId,
  readOnly,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: ContinuityCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  const command = useBridgeCommand(onRefresh);
  const setEntityState = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];
    try {
      value = JSON.parse(String(values.get('value') ?? 'null')) as typeof value;
    } catch {
      return;
    }
    await command.run(() =>
      bridge.continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: String(values.get('entityId')),
        stateKey: String(values.get('stateKey')),
        value,
        validFromChapterId: String(values.get('validFromChapterId')),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId: String(values.get('sourceVersionId')),
        evidence: [],
      }),
    );
  };
  const saveTimeline = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.continuity.saveTimelineEvent({
        projectId,
        authority: 'author',
        eventId: null,
        title: String(values.get('title')),
        startValue: String(values.get('startValue')),
        endValue: nullableString(values.get('endValue')),
        precision: String(values.get('precision')) as Parameters<
          RendererBridgeAdapter['continuity']['saveTimelineEvent']
        >[0]['precision'],
        chapterId: nullableString(values.get('chapterId')),
        locationId: nullableString(values.get('locationId')),
        description: String(values.get('description') ?? ''),
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      }),
    );
  };
  const setKnowledge = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.continuity.setKnowledgeState({
        projectId,
        authority: 'author',
        informationKey: String(values.get('informationKey')),
        characterId: String(values.get('characterId')),
        knowledgeStatus: String(values.get('knowledgeStatus')) as Parameters<
          RendererBridgeAdapter['continuity']['setKnowledgeState']
        >[0]['knowledgeStatus'],
        validFromChapterId: String(values.get('validFromChapterId')),
        validUntilChapterId: nullableString(values.get('validUntilChapterId')),
        sourceVersionId: nullableString(values.get('sourceVersionId')),
        sourceLogicalBlockId: nullableString(values.get('sourceLogicalBlockId')),
        notes: String(values.get('notes') ?? ''),
      }),
    );
  };
  return (
    <div className="ledger-editor-grid">
      <details className="feature-card">
        <summary>记录动态状态</summary>
        <form className="stacked-form" onSubmit={(event) => void setEntityState(event)}>
          <label>
            实体UUID
            <input name="entityId" required />
          </label>
          <label>
            状态键
            <input name="stateKey" required />
          </label>
          <label>
            JSON值
            <textarea name="value" defaultValue="null" required />
          </label>
          <label>
            起始章节UUID
            <input name="validFromChapterId" required />
          </label>
          <label>
            结束章节UUID
            <input name="validUntilChapterId" />
          </label>
          <label>
            来源Version UUID
            <input name="sourceVersionId" required />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            确认动态状态
          </button>
        </form>
        <div className="compact-list">
          {catalog?.entityStates
            .filter((item) => item.recordStatus === 'current')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.invalidateEntityState({
                      projectId,
                      authority: 'author',
                      entityId: item.entityId,
                      stateKey: item.stateKey,
                    }),
                  )
                }
              >
                失效：{item.stateKey}
              </button>
            ))}
        </div>
      </details>
      <details className="feature-card">
        <summary>新增时间线事件</summary>
        <form className="stacked-form" onSubmit={(event) => void saveTimeline(event)}>
          <label>
            标题
            <input name="title" required />
          </label>
          <label>
            起始值
            <input name="startValue" required />
          </label>
          <label>
            结束值
            <input name="endValue" />
          </label>
          <label>
            精度
            <select name="precision" defaultValue="unknown">
              {['exact', 'day', 'month', 'year', 'approximate', 'unknown'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            章节UUID
            <input name="chapterId" />
          </label>
          <label>
            地点UUID
            <input name="locationId" />
          </label>
          <label>
            说明
            <textarea name="description" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            保存事件
          </button>
        </form>
        <div className="compact-list">
          {catalog?.timelineEvents
            .filter((item) => item.status === 'active')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.archiveTimelineEvent({
                      projectId,
                      authority: 'author',
                      eventId: item.id,
                    }),
                  )
                }
              >
                归档：{item.title}
              </button>
            ))}
        </div>
      </details>
      <details className="feature-card">
        <summary>记录知情状态</summary>
        <form className="stacked-form" onSubmit={(event) => void setKnowledge(event)}>
          <label>
            信息键
            <input name="informationKey" required />
          </label>
          <label>
            人物UUID
            <input name="characterId" required />
          </label>
          <label>
            状态
            <select name="knowledgeStatus" defaultValue="knows">
              {['knows', 'believes', 'suspects', 'misunderstands', 'unknown'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            起始章节UUID
            <input name="validFromChapterId" required />
          </label>
          <label>
            结束章节UUID
            <input name="validUntilChapterId" />
          </label>
          <label>
            来源Version UUID
            <input name="sourceVersionId" />
          </label>
          <label>
            来源正文块UUID
            <input name="sourceLogicalBlockId" />
          </label>
          <label>
            备注
            <textarea name="notes" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            确认知情状态
          </button>
        </form>
        <div className="compact-list">
          {catalog?.knowledgeStates
            .filter((item) => item.recordStatus === 'current')
            .map((item) => (
              <button
                disabled={readOnly || command.pending}
                key={item.id}
                type="button"
                onClick={() =>
                  void command.run(() =>
                    bridge.continuity.invalidateKnowledgeState({
                      projectId,
                      authority: 'author',
                      characterId: item.characterId,
                      informationKey: item.informationKey,
                    }),
                  )
                }
              >
                失效：{item.informationKey}
              </button>
            ))}
        </div>
      </details>
      {command.error ? (
        <p className="form-error">
          {command.error.message} · {command.error.code}
        </p>
      ) : null}
    </div>
  );
}

function NarrativePanel({
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
  const [query, setQuery] = useState('');
  const [chapter, setChapter] = useState('');
  const [includeResolved, setIncludeResolved] = useState(true);
  const load = useCallback(
    () =>
      bridge.narrativePlanning.list(
        { projectId, query, includeResolved, referenceChapterId: chapter || null },
        { mode: 'replace' },
      ),
    [bridge, chapter, includeResolved, projectId, query],
  );
  const resource = useBridgeQuery(
    `narrative:${projectId}:${query}:${chapter}:${includeResolved}`,
    load,
  );
  return (
    <section className="feature-card" data-narrative-planning-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>伏笔生命周期与人物弧光</h2>
          <p>计划、实际命中和作者确认来源并列展示。</p>
        </div>
        <button
          data-refresh-narrative-planning
          type="button"
          onClick={() => void resource.refresh()}
        >
          读取
        </button>
      </div>
      <div className="filter-bar">
        <input
          data-narrative-planning-query
          placeholder="搜索伏笔、弧光或节点"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <input
          data-narrative-reference-chapter
          placeholder="参考章节UUID"
          value={chapter}
          onChange={(event) => setChapter(event.target.value)}
        />
        <label>
          <input
            data-narrative-include-resolved
            type="checkbox"
            checked={includeResolved}
            onChange={(event) => setIncludeResolved(event.target.checked)}
          />
          包含已结束记录
        </label>
      </div>
      <p className="feature-status" data-narrative-planning-status>
        {resource.error
          ? `读取失败：${resource.error.code}`
          : resource.state === 'success'
            ? `项目：${projectName}`
            : '读取中…'}
      </p>
      <NarrativeResults catalog={resource.data} />
      <NarrativeEditors
        bridge={bridge}
        catalog={resource.data}
        projectId={projectId}
        readOnly={readOnly}
        onRefresh={resource.refresh}
      />
    </section>
  );
}

function NarrativeResults({ catalog }: { readonly catalog: NarrativePlanningCatalog | null }) {
  return (
    <div className="ledger-grid" data-narrative-planning-results>
      <LedgerSection title={`伏笔（${catalog?.foreshadowings.length ?? 0}）`}>
        {catalog?.foreshadowings.map((item) => (
          <LedgerRecord
            key={item.id}
            title={item.title}
            lines={[item.status, item.description, ...item.warnings]}
          />
        ))}
      </LedgerSection>
      <LedgerSection title={`人物弧光（${catalog?.characterArcs.length ?? 0}）`}>
        {catalog?.characterArcs.map((arc) => (
          <article className="ledger-record" key={arc.id}>
            <h4>{arc.title}</h4>
            <p>
              {arc.status} · {arc.arcType}
            </p>
            <p>{arc.authorIntent}</p>
            {arc.milestones.map((milestone) => (
              <div className="ledger-subrecord" key={milestone.id}>
                <strong>{milestone.title}</strong>
                <span>
                  {milestone.status} · {milestone.confirmationSource ?? '未确认'}
                </span>
              </div>
            ))}
          </article>
        ))}
      </LedgerSection>
    </div>
  );
}

function NarrativeEditors({
  bridge,
  catalog,
  projectId,
  readOnly,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: NarrativePlanningCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly onRefresh: () => Promise<void>;
}) {
  const command = useBridgeCommand(onRefresh);
  const saveForeshadowing = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    await command.run(() =>
      bridge.narrativePlanning.saveForeshadowing({
        projectId,
        authority: 'author',
        foreshadowingId: null,
        title: String(values.get('title')),
        description: String(values.get('description') ?? ''),
        revealFromChapterId: nullableString(values.get('revealFromChapterId')),
        revealByChapterId: nullableString(values.get('revealByChapterId')),
        chapterLinks: [],
        relations: [],
      }),
    );
  };
  const saveArc = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const arcType = String(values.get('arcType')) as Parameters<
      RendererBridgeAdapter['narrativePlanning']['saveCharacterArc']
    >[0]['arcType'];
    await command.run(() =>
      bridge.narrativePlanning.saveCharacterArc({
        projectId,
        authority: 'author',
        arcId: null,
        characterId: String(values.get('characterId')),
        title: String(values.get('title')),
        arcType,
        customType: arcType === 'custom' ? String(values.get('customType')) : null,
        status: String(values.get('status')) as Parameters<
          RendererBridgeAdapter['narrativePlanning']['saveCharacterArc']
        >[0]['status'],
        authorIntent: String(values.get('authorIntent') ?? ''),
      }),
    );
  };
  const saveMilestone = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const arc = catalog?.characterArcs.find((item) => item.id === values.get('arcId'));
    await command.run(() =>
      bridge.narrativePlanning.saveArcMilestone({
        projectId,
        authority: 'author',
        milestoneId: null,
        arcId: String(values.get('arcId')),
        title: String(values.get('title')),
        description: String(values.get('description') ?? ''),
        sortIndex: arc?.milestones.length ?? 0,
        plannedChapterId: nullableString(values.get('plannedChapterId')),
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      }),
    );
  };
  const transitionMilestone = async (
    milestoneId: string,
    status: 'hit' | 'skipped',
  ): Promise<void> => {
    const actualChapterId =
      status === 'hit' ? window.prompt('实际命中章节UUID：')?.trim() || null : null;
    if (status === 'hit' && !actualChapterId) return;
    await command.run(() =>
      bridge.narrativePlanning.transitionArcMilestone({
        projectId,
        authority: 'author',
        milestoneId,
        status,
        actualChapterId,
      }),
    );
  };
  return (
    <div className="ledger-editor-grid">
      <details className="feature-card">
        <summary>新增伏笔</summary>
        <form className="stacked-form" onSubmit={(event) => void saveForeshadowing(event)}>
          <label>
            标题
            <input name="title" required />
          </label>
          <label>
            说明
            <textarea name="description" />
          </label>
          <label>
            最早回收章节UUID
            <input name="revealFromChapterId" />
          </label>
          <label>
            最晚回收章节UUID
            <input name="revealByChapterId" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            保存伏笔
          </button>
        </form>
        {catalog?.foreshadowings.map((item) => (
          <label className="feature-row" key={item.id}>
            {item.title}
            <select
              disabled={readOnly || command.pending}
              value={item.status}
              onChange={(event) =>
                void command.run(() =>
                  bridge.narrativePlanning.transitionForeshadowing({
                    projectId,
                    authority: 'author',
                    foreshadowingId: item.id,
                    status: event.target.value as Parameters<
                      RendererBridgeAdapter['narrativePlanning']['transitionForeshadowing']
                    >[0]['status'],
                  }),
                )
              }
            >
              {[
                'planned',
                'planted',
                'reinforced',
                'partially_revealed',
                'revealed',
                'cancelled',
              ].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
        ))}
      </details>
      <details className="feature-card">
        <summary>新增人物弧光</summary>
        <form className="stacked-form" onSubmit={(event) => void saveArc(event)}>
          <label>
            人物UUID
            <input name="characterId" required />
          </label>
          <label>
            标题
            <input name="title" required />
          </label>
          <label>
            类型
            <select name="arcType" defaultValue="growth">
              {['growth', 'darkening', 'awakening', 'fall', 'redemption', 'custom'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            自定义类型
            <input name="customType" />
          </label>
          <label>
            状态
            <select name="status" defaultValue="planned">
              {['planned', 'active', 'completed', 'abandoned'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            作者意图
            <textarea name="authorIntent" />
          </label>
          <button disabled={readOnly || command.pending} type="submit">
            保存弧光
          </button>
        </form>
      </details>
      <details className="feature-card">
        <summary>新增或确认弧光里程碑</summary>
        <form className="stacked-form" onSubmit={(event) => void saveMilestone(event)}>
          <label>
            人物弧光
            <select name="arcId" required>
              {catalog?.characterArcs.map((arc) => (
                <option key={arc.id} value={arc.id}>
                  {arc.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            标题
            <input name="title" required />
          </label>
          <label>
            说明
            <textarea name="description" />
          </label>
          <label>
            计划章节UUID
            <input name="plannedChapterId" />
          </label>
          <button
            disabled={readOnly || command.pending || !catalog?.characterArcs.length}
            type="submit"
          >
            保存里程碑
          </button>
        </form>
        {catalog?.characterArcs.flatMap((arc) =>
          arc.milestones.map((milestone) => (
            <div className="feature-row" key={milestone.id}>
              <span>
                {arc.title} / {milestone.title} · {milestone.status}
              </span>
              <div className="inline-actions">
                <button
                  disabled={readOnly || command.pending}
                  type="button"
                  onClick={() => void transitionMilestone(milestone.id, 'hit')}
                >
                  确认命中
                </button>
                <button
                  disabled={readOnly || command.pending}
                  type="button"
                  onClick={() => void transitionMilestone(milestone.id, 'skipped')}
                >
                  标记跳过
                </button>
              </div>
            </div>
          )),
        )}
      </details>
      {command.error ? (
        <p className="form-error">
          {command.error.message} · {command.error.code}
        </p>
      ) : null}
    </div>
  );
}

function StateProposalPanel({
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
    if (result) setNotice('作者裁决已提交，权威状态与尾快照已刷新。');
  };
  return (
    <section className="feature-card" data-state-proposal-dialog>
      <div className="feature-card__heading">
        <div>
          <h2>状态提案与章节尾快照</h2>
          <p>pending提案不改变权威状态，必须由作者裁决。</p>
        </div>
        <button data-refresh-state-proposals type="button" onClick={() => void resource.refresh()}>
          读取
        </button>
      </div>
      <div className="filter-bar">
        <input
          data-state-proposal-chapter
          placeholder="可选：章节UUID"
          value={chapterId}
          onChange={(event) => setChapterId(event.target.value)}
        />
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
          ? `裁决失败：${command.error.code}`
          : resource.error
            ? `读取失败：${resource.error.code}`
            : notice
              ? notice
              : resource.state === 'success'
                ? `项目：${projectName} · 提案 ${catalog?.proposals.length ?? 0}`
                : '读取中…'}
      </p>
      <div data-state-proposal-list>
        {catalog?.proposals.length === 0 ? (
          <p>当前没有状态提案。</p>
        ) : (
          catalog?.proposals.map((proposal) => (
            <article className="ledger-record" data-state-proposal={proposal.id} key={proposal.id}>
              <h4>{proposal.proposalType}</h4>
              <p>
                {proposal.status} · 置信度 {proposal.confidence}
              </p>
              <pre>{JSON.stringify(proposal.proposedValue, null, 2)}</pre>
              {proposal.evidence.map((anchor, index) => (
                <p key={`${anchor.targetId}-${index}`}>
                  {anchor.kind} · {anchor.note}
                </p>
              ))}
              {proposal.status === 'pending' ? (
                <div className="inline-actions">
                  <button
                    data-accept-state-proposal={proposal.id}
                    disabled={readOnly || command.pending}
                    type="button"
                    onClick={() => void resolve(proposal, 'accept')}
                  >
                    接受
                  </button>
                  <button
                    disabled={readOnly || command.pending}
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

interface StateProposalView {
  readonly catalog: StateProposalCatalog;
  readonly snapshot: EndingSnapshotReadResult | null;
}

function SnapshotSummary({ snapshot }: { readonly snapshot: EndingSnapshotReadResult | null }) {
  if (!snapshot)
    return (
      <div data-state-proposal-snapshot>
        <p>填写章节UUID后读取尾快照。</p>
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
        来源：{snapshot.snapshotSource} · {snapshot.snapshot?.status ?? '即时回退'}
      </p>
      <p>
        实体状态 {snapshot.content.entityStates.length} · 知情{' '}
        {snapshot.content.knowledgeStates.length} · 伏笔 {snapshot.content.foreshadowings.length} ·
        弧光节点 {snapshot.content.arcMilestones.length}
      </p>
    </div>
  );
}

function LedgerSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="ledger-list">{children}</div>
    </section>
  );
}
function LedgerRecord({
  title,
  lines,
}: {
  readonly title: string;
  readonly lines: readonly string[];
}) {
  return (
    <article className="ledger-record">
      <h4>{title}</h4>
      {lines.filter(Boolean).map((line, index) => (
        <p key={`${line}-${index}`}>{line}</p>
      ))}
    </article>
  );
}
function lineValues(value: FormDataEntryValue | null): string[] {
  return String(value ?? '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

function nullableString(value: FormDataEntryValue | null): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}
