import { useCallback, useEffect, useState, type FormEvent } from 'react';

import type {
  ContinuityCatalog,
  EndingSnapshotReadResult,
  EntityType,
  GenerationRun,
  NarrativePlanningCatalog,
  ProjectStructure,
  ProviderSummary,
  StateProposal,
  StateProposalCatalog,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../../bridge/request-lifecycle.js';
import { useBridgeCommand, useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import {
  authorCharacterArcStatusLabel,
  authorForeshadowingStatusLabel,
  authorJsonValue,
} from '../../presentation/author-value-format.js';
import {
  arcTypeLabel,
  authorFactLabel,
  authorStateLabel,
  ChapterNameSelect,
  chapterName,
  COMMON_FACT_FIELDS,
  COMMON_STATE_FIELDS,
  EntityNameSelect,
  entityName,
  FinalVersionSelect,
  knowledgeStatusLabel,
  parseAuthorValue,
  promptChapterId,
  recordStatusLabel,
  timelinePrecisionLabel,
  useCanonAuthorReferences,
  type AuthorValueType,
  type CanonAuthorReferences,
} from './canon-author-fields.js';

export type CanonSection = 'entities' | 'continuity' | 'narrative' | 'proposals';

const ENTITY_TYPE_OPTIONS: readonly { readonly value: EntityType; readonly label: string }[] = [
  { value: 'character', label: '人物' },
  { value: 'location', label: '地点' },
  { value: 'faction', label: '组织与阵营' },
  { value: 'item', label: '物品' },
  { value: 'ability', label: '能力' },
  { value: 'rule', label: '世界规则' },
  { value: 'event', label: '重要事件' },
  { value: 'custom', label: '其他' },
];

function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

interface CanonWorkbenchProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly section: CanonSection;
  readonly selectedEntityId?: string | null;
  readonly onSectionChange: (section: CanonSection) => void;
}

export function CanonWorkbench({
  bridge,
  projectId,
  projectName,
  readOnly,
  section,
  selectedEntityId,
  onSectionChange,
}: CanonWorkbenchProps) {
  const references = useCanonAuthorReferences(bridge, projectId);
  return (
    <section className="canon-workbench" data-canon-dialog aria-label="设定工作台">
      <header className="feature-heading">
        <div>
          <p className="eyebrow">人物与世界</p>
          <h1>设定与连续性工作台</h1>
          <p>已确认设定、动态历史、叙事规划和待裁决提案分区保存。</p>
        </div>
      </header>
      <nav className="feature-tabs" aria-label="设定工作台分区">
        <Tab
          current={section === 'entities'}
          label="人物与世界设定"
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
        <EntityCanonPanel
          bridge={bridge}
          projectId={projectId}
          readOnly={readOnly}
          selectedEntityId={selectedEntityId ?? null}
        />
      ) : null}
      {section === 'continuity' ? (
        <ContinuityPanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
          references={references}
        />
      ) : null}
      {section === 'narrative' ? (
        <NarrativePanel
          bridge={bridge}
          projectId={projectId}
          projectName={projectName}
          readOnly={readOnly}
          references={references}
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
  selectedEntityId,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedEntityId?: string | null;
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
    if (
      selectedEntityId &&
      resource.data?.entities.some((entity) => entity.id === selectedEntityId)
    ) {
      setSelectedId(selectedEntityId);
      setNewEntity(false);
      return;
    }
    if (!selectedId && resource.data?.entities[0]) setSelectedId(resource.data.entities[0].id);
  }, [resource.data, selectedEntityId, selectedId]);

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
      setNotice('设定条目已写入作品数据库。');
    }
  };

  const setFact = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    const selectedFactKey = String(values.get('factKey') ?? '');
    const factKey =
      selectedFactKey === 'custom'
        ? String(values.get('customFactKey') ?? '').trim()
        : selectedFactKey;
    if (!factKey) {
      setNotice('请填写自定义事实名称。');
      return;
    }
    let value: Parameters<RendererBridgeAdapter['canon']['setFact']>[0]['value'];
    try {
      value = parseAuthorValue(
        String(values.get('valueType') ?? 'text') as AuthorValueType,
        String(values.get('value') ?? ''),
      ) as typeof value;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '事实值格式不正确。');
      return;
    }
    const result = await command.run(() =>
      bridge.canon.setFact({
        projectId,
        authority: 'author',
        entityId: selected.id,
        factKey,
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
    if (result) setNotice('设定条目已归档；永久删除仍需通过引用预览与名称确认。');
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
      setNotice('设定条目已永久删除。');
    }
  };

  return (
    <div className="canon-grid">
      <aside className="feature-card">
        <div className="feature-card__heading">
          <h2>设定条目</h2>
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
          选择设定条目
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
                {entity.name} · {entityTypeLabel(entity.entityType)}
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
                ? '正在读取人物与设定…'
                : `实体 ${resource.data?.entities.length ?? 0}`}
        </p>
      </aside>
      <main className="feature-card">
        <h2 data-canon-entity-mode>
          {newEntity ? '新建设定条目' : selected ? `编辑：${selected.name}` : '选择一个设定条目'}
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
                {ENTITY_TYPE_OPTIONS.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
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
                保存设定条目
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
        <h2>已确认事实</h2>
        <div data-canon-fact-list>
          {selected?.facts.length ? (
            selected.facts.map((fact) => (
              <article className="feature-row" key={fact.id}>
                <div>
                  <strong>{authorFactLabel(fact.factKey)}</strong>
                  <span>
                    {recordStatusLabel(fact.status)} · {authorJsonValue(fact.value)}
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
              事实类型
              <select name="factKey" defaultValue="appearance">
                {COMMON_FACT_FIELDS.map((field) => (
                  <option key={field.key} value={field.key}>
                    {field.label}
                  </option>
                ))}
                <option value="custom">其他自定义事实</option>
              </select>
            </label>
            <label>
              内容形式
              <select name="valueType" defaultValue="text">
                <option value="text">文字</option>
                <option value="number">数字</option>
                <option value="boolean">是 / 否</option>
                <option value="list">多项内容</option>
                <option value="json">原始JSON（高级）</option>
              </select>
            </label>
            <label>
              内容
              <textarea name="value" placeholder="多项内容可用换行或顿号分隔" required />
            </label>
            <details>
              <summary>高级自定义字段</summary>
              <label>
                自定义事实名称
                <input name="customFactKey" />
              </label>
              <p>复杂结构请选择上方“原始JSON（高级）”，普通作者无需使用。</p>
            </details>
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
  references,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
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
        <ChapterNameSelect
          aria-label="生效章节"
          emptyLabel="全部章节"
          references={references}
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
      <ContinuityResults catalog={resource.data} references={references} />
      <ContinuityEditors
        bridge={bridge}
        catalog={resource.data}
        projectId={projectId}
        readOnly={readOnly}
        references={references}
        onRefresh={resource.refresh}
      />
    </section>
  );
}

function ContinuityResults({
  catalog,
  references,
}: {
  readonly catalog: ContinuityCatalog | null;
  readonly references: CanonAuthorReferences;
}) {
  return (
    <div className="ledger-grid" data-continuity-results>
      <LedgerSection title={`动态状态（${catalog?.entityStates.length ?? 0}）`}>
        {catalog?.entityStates.map((state) => (
          <LedgerRecord
            key={state.id}
            title={`${entityName(references, state.entityId)} · ${authorStateLabel(state.stateKey)}`}
            lines={[
              recordStatusLabel(state.recordStatus),
              authorJsonValue(state.value),
              `${chapterName(references, state.validFromChapterId)} → ${chapterName(references, state.validUntilChapterId)}`,
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
              recordStatusLabel(event.status),
              `${event.startValue} → ${event.endValue ?? event.startValue} · ${timelinePrecisionLabel(event.precision)}`,
              event.chapterId ? chapterName(references, event.chapterId) : '',
              event.locationId ? entityName(references, event.locationId) : '',
              event.description,
            ]}
          />
        ))}
      </LedgerSection>
      <LedgerSection title={`知情状态（${catalog?.knowledgeStates.length ?? 0}）`}>
        {catalog?.knowledgeStates.map((state) => (
          <LedgerRecord
            key={state.id}
            title={`${entityName(references, state.characterId)} · ${state.informationKey}`}
            lines={[
              knowledgeStatusLabel(state.knowledgeStatus),
              recordStatusLabel(state.recordStatus),
              state.notes,
            ]}
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
  references,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: ContinuityCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
  readonly onRefresh: () => Promise<void>;
}) {
  const command = useBridgeCommand(onRefresh);
  const setEntityState = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const selectedStateKey = String(values.get('stateKey') ?? '');
    const stateKey =
      selectedStateKey === 'custom'
        ? String(values.get('customStateKey') ?? '').trim()
        : selectedStateKey;
    if (!stateKey) return;
    let value: Parameters<RendererBridgeAdapter['continuity']['setEntityState']>[0]['value'];
    try {
      value = parseAuthorValue(
        String(values.get('valueType') ?? 'text') as AuthorValueType,
        String(values.get('value') ?? ''),
      ) as typeof value;
    } catch {
      return;
    }
    await command.run(() =>
      bridge.continuity.setEntityState({
        projectId,
        authority: 'author',
        entityId: String(values.get('entityId')),
        stateKey,
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
        participantIds: values.getAll('participantIds').map(String).filter(Boolean),
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
            人物或设定
            <EntityNameSelect name="entityId" references={references} required />
          </label>
          <label>
            状态类型
            <select name="stateKey" defaultValue="location">
              {COMMON_STATE_FIELDS.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
              <option value="custom">其他自定义状态</option>
            </select>
          </label>
          <label>
            内容形式
            <select name="valueType" defaultValue="text">
              <option value="text">文字</option>
              <option value="number">数字</option>
              <option value="boolean">是 / 否</option>
              <option value="list">多项内容</option>
              <option value="json">原始JSON（高级）</option>
            </select>
          </label>
          <label>
            当前内容
            <textarea name="value" required />
          </label>
          <label>
            从哪一章开始生效
            <ChapterNameSelect name="validFromChapterId" references={references} required />
          </label>
          <label>
            到哪一章结束
            <ChapterNameSelect name="validUntilChapterId" references={references} />
          </label>
          <label>
            依据的定稿版本
            <FinalVersionSelect name="sourceVersionId" references={references} required />
          </label>
          <details>
            <summary>高级自定义状态</summary>
            <label>
              自定义状态名称
              <input name="customStateKey" />
            </label>
          </details>
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
                  {timelinePrecisionLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            对应章节
            <ChapterNameSelect name="chapterId" references={references} />
          </label>
          <label>
            发生地点
            <EntityNameSelect name="locationId" entityType="location" references={references} />
          </label>
          <label>
            参与人物
            <EntityNameSelect
              name="participantIds"
              entityType="character"
              references={references}
              multiple
            />
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
            知情内容
            <input name="informationKey" placeholder="人物知道或误解了什么" required />
          </label>
          <label>
            人物
            <EntityNameSelect
              name="characterId"
              entityType="character"
              references={references}
              required
            />
          </label>
          <label>
            状态
            <select name="knowledgeStatus" defaultValue="knows">
              {['knows', 'believes', 'suspects', 'misunderstands', 'unknown'].map((value) => (
                <option key={value} value={value}>
                  {knowledgeStatusLabel(value)}
                </option>
              ))}
            </select>
          </label>
          <label>
            从哪一章开始生效
            <ChapterNameSelect name="validFromChapterId" references={references} required />
          </label>
          <label>
            到哪一章结束
            <ChapterNameSelect name="validUntilChapterId" references={references} />
          </label>
          <label>
            依据的定稿版本
            <FinalVersionSelect name="sourceVersionId" references={references} />
          </label>
          <details>
            <summary>高级来源定位</summary>
            <label>
              来源正文块内部标识
              <input name="sourceLogicalBlockId" />
            </label>
          </details>
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
      {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
    </div>
  );
}

function NarrativePanel({
  bridge,
  projectId,
  projectName,
  readOnly,
  references,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly projectName: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
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
        <ChapterNameSelect
          data-narrative-reference-chapter
          emptyLabel="全部章节"
          references={references}
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
      <NarrativeResults catalog={resource.data} references={references} />
      <NarrativeEditors
        bridge={bridge}
        catalog={resource.data}
        projectId={projectId}
        readOnly={readOnly}
        references={references}
        onRefresh={resource.refresh}
      />
    </section>
  );
}

function NarrativeResults({
  catalog,
  references,
}: {
  readonly catalog: NarrativePlanningCatalog | null;
  readonly references: CanonAuthorReferences;
}) {
  return (
    <div className="ledger-grid" data-narrative-planning-results>
      <LedgerSection title={`伏笔（${catalog?.foreshadowings.length ?? 0}）`}>
        {catalog?.foreshadowings.map((item) => (
          <LedgerRecord
            key={item.id}
            title={item.title}
            lines={[
              authorForeshadowingStatusLabel(item.status),
              item.revealFromChapterId
                ? `最早：${chapterName(references, item.revealFromChapterId)}`
                : '',
              item.revealByChapterId
                ? `最晚：${chapterName(references, item.revealByChapterId)}`
                : '',
              item.description,
              ...item.warnings,
            ]}
          />
        ))}
      </LedgerSection>
      <LedgerSection title={`人物弧光（${catalog?.characterArcs.length ?? 0}）`}>
        {catalog?.characterArcs.map((arc) => (
          <article className="ledger-record" key={arc.id}>
            <h4>{arc.title}</h4>
            <p>
              {authorCharacterArcStatusLabel(arc.status)} · {arcTypeLabel(arc.arcType)} ·{' '}
              {entityName(references, arc.characterId)}
            </p>
            <p>{arc.authorIntent}</p>
            {arc.milestones.map((milestone) => (
              <div className="ledger-subrecord" key={milestone.id}>
                <strong>{milestone.title}</strong>
                <span>
                  {milestone.status === 'hit'
                    ? '已命中'
                    : milestone.status === 'skipped'
                      ? '已跳过'
                      : '待命中'}{' '}
                  ·{' '}
                  {milestone.actualChapterId
                    ? chapterName(references, milestone.actualChapterId)
                    : '尚未确认章节'}
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
  references,
  onRefresh,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly catalog: NarrativePlanningCatalog | null;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly references: CanonAuthorReferences;
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
      status === 'hit' ? promptChapterId(references.chapters, '选择实际命中章节序号：') : null;
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
            最早回收章节
            <ChapterNameSelect name="revealFromChapterId" references={references} />
          </label>
          <label>
            最晚回收章节
            <ChapterNameSelect name="revealByChapterId" references={references} />
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
                  {authorForeshadowingStatusLabel(status)}
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
            人物
            <EntityNameSelect
              name="characterId"
              entityType="character"
              references={references}
              required
            />
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
                  {arcTypeLabel(value)}
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
                  {authorCharacterArcStatusLabel(value)}
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
            计划章节
            <ChapterNameSelect name="plannedChapterId" references={references} />
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
                {arc.title} / {milestone.title} ·{' '}
                {milestone.status === 'hit'
                  ? '已命中'
                  : milestone.status === 'skipped'
                    ? '已跳过'
                    : '待命中'}
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
      {command.error ? <p className="form-error">{authorErrorSummary(command.error)}</p> : null}
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
  const [structure, setStructure] = useState<ProjectStructure | null>(null);
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [providerId, setProviderId] = useState('');
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [pendingExtraction, setPendingExtraction] = useState(false);
  const chapters = structure?.volumes.flatMap((volume) => volume.chapters) ?? [];
  const chapter = chapters.find((item) => item.id === chapterId) ?? null;
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
    void Promise.all([
      bridge.planning.listStructure(projectId, { mode: 'replace' }),
      bridge.providers.list({ mode: 'replace' }),
    ]).then(([structureOutcome, providerOutcome]) => {
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
  }, [bridge, projectId]);

  useEffect(() => {
    if (!activeRun) return;
    const timer = window.setInterval(() => {
      void bridge.generation.getRun(projectId, activeRun.runId).then((outcome) => {
        if (outcome.state !== 'success') return;
        setActiveRun(outcome.data);
        setNotice(`状态提取 · ${outcome.data.stage} · ${outcome.data.status}`);
        if (['succeeded', 'failed', 'cancelled'].includes(outcome.data.status)) {
          window.clearInterval(timer);
          setPendingExtraction(false);
          void resource.refresh();
        }
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [activeRun?.runId, bridge, projectId, resource.refresh]);

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
      setNotice(`AI连接状态提取已启动 · ${outcome.data.run.stage}`);
    } else {
      setPendingExtraction(false);
      setNotice(
        outcome.state === 'failure' ? `状态提取未启动 · ${outcome.error.code}` : '请求已取消。',
      );
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
          ? `裁决失败：${command.error.code}`
          : resource.error
            ? `读取失败：${resource.error.code}`
            : notice
              ? notice
              : resource.state === 'success'
                ? `项目：${projectName} · 提案 ${catalog?.proposals.length ?? 0}`
                : '读取中…'}
      </p>
      <div className="ledger-list" data-state-proposal-batches>
        {catalog?.batches.map((batch) => (
          <article className="ledger-record" key={batch.batchId}>
            <h4>提案批次 · {batch.source}</h4>
            <p>
              {batch.status} · {batch.proposalCount} 项 · 历史版本 {batch.sourceVersionId}
            </p>
            {batch.generationRunId ? <p>GenerationRun：{batch.generationRunId}</p> : null}
          </article>
        ))}
      </div>
      <div data-state-proposal-list>
        {catalog?.proposals.length === 0 ? (
          <p>当前没有状态提案。</p>
        ) : (
          catalog?.proposals.map((proposal) => (
            <article className="ledger-record" data-state-proposal={proposal.id} key={proposal.id}>
              <h4>{proposal.proposalType}</h4>
              <p>
                {proposal.status} · {proposal.source} · 置信度 {proposal.confidence}
              </p>
              <p>原值（来自 Core 权威状态）</p>
              <pre>{JSON.stringify(proposal.previousValue, null, 2)}</pre>
              <p>建议值</p>
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
        <p>填写章节内部标识后读取尾快照。</p>
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
