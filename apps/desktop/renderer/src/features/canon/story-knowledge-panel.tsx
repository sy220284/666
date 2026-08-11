import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  StoryKnowledgeProjection,
  StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';

export type StoryKnowledgeView =
  | 'character-card'
  | 'relationships'
  | 'story-timeline'
  | 'character-timeline'
  | 'foreshadowing'
  | 'arc'
  | 'history';

interface StoryKnowledgePanelProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly readOnly: boolean;
  readonly selectedEntityId: string | null;
  readonly selectedChapterId: string | null;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}

interface HistoryCursor {
  readonly createdAt: string;
  readonly versionId: string;
}

const VIEW_LABELS: Readonly<Record<StoryKnowledgeView, string>> = {
  'character-card': '人物卡',
  relationships: '人物关系图',
  'story-timeline': '故事时间线',
  'character-timeline': '人物时间线',
  foreshadowing: '伏笔泳道',
  arc: '成长路线',
  history: '历史时间轴',
};

export function StoryKnowledgePanel(props: StoryKnowledgePanelProps) {
  const [view, setView] = useState<StoryKnowledgeView>('character-card');
  const [historyCursor, setHistoryCursor] = useState<HistoryCursor | null>(null);

  useEffect(() => {
    setHistoryCursor(null);
  }, [props.projectId, props.selectedChapterId]);

  const input = useMemo(
    () =>
      projectionInput(
        view,
        props.projectId,
        props.selectedEntityId,
        props.selectedChapterId,
        historyCursor,
      ),
    [historyCursor, props.projectId, props.selectedChapterId, props.selectedEntityId, view],
  );

  return (
    <section className="story-knowledge-panel" data-story-knowledge-panel>
      <header className="section-heading">
        <div>
          <p className="eyebrow">故事知识</p>
          <h2>故事知识工作台</h2>
          <p>从人物、关系、时间、伏笔、成长和历史多个角度读取同一份权威故事数据。</p>
        </div>
        {props.readOnly ? <span className="status-badge">只读模式</span> : null}
      </header>

      <nav className="feature-tabs compact" aria-label="故事知识视图">
        {(Object.keys(VIEW_LABELS) as StoryKnowledgeView[]).map((item) => (
          <button
            key={item}
            type="button"
            aria-current={view === item ? 'page' : undefined}
            className={view === item ? 'is-active' : ''}
            data-story-knowledge-view={item}
            onClick={() => {
              setView(item);
              if (item !== 'history') setHistoryCursor(null);
            }}
          >
            {VIEW_LABELS[item]}
          </button>
        ))}
      </nav>

      {input ? (
        <StoryKnowledgeProjectionPane
          key={`${view}:${props.projectId}:${props.selectedEntityId ?? ''}:${props.selectedChapterId ?? ''}:${historyCursor?.createdAt ?? ''}:${historyCursor?.versionId ?? ''}`}
          bridge={props.bridge}
          input={input}
          view={view}
          onNavigate={props.onNavigate}
          onHistoryCursor={setHistoryCursor}
          historyCursor={historyCursor}
        />
      ) : (
        <StoryKnowledgeSelectionPrompt
          view={view}
          hasEntity={Boolean(props.selectedEntityId)}
          hasChapter={Boolean(props.selectedChapterId)}
        />
      )}
    </section>
  );
}

function StoryKnowledgeProjectionPane({
  bridge,
  input,
  view,
  onNavigate,
  onHistoryCursor,
  historyCursor,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly input: StoryKnowledgeProjectionInput;
  readonly view: StoryKnowledgeView;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly historyCursor: HistoryCursor | null;
}) {
  const requestIdentity = useMemo(() => JSON.stringify(input), [input]);
  const load = useCallback(
    () =>
      bridge.storyKnowledge.project(input, {
        mode: 'replace',
        requestKey: `story-knowledge:${requestIdentity}`,
        laneKey: `story-knowledge:${input.projectId}:${view}`,
      }),
    [bridge.storyKnowledge, input, requestIdentity, view],
  );
  const resource = useBridgeQuery(`story-knowledge:${requestIdentity}`, load);

  if (resource.state === 'loading') {
    return <p className="safety-inline">正在读取故事知识…</p>;
  }
  if (resource.state === 'failure') {
    return (
      <div className="safety-inline is-error" role="alert" data-story-knowledge-error>
        <span>{resource.error ? authorErrorSummary(resource.error) : '故事知识暂时无法读取。'}</span>
        <button type="button" onClick={() => void resource.refresh()}>
          重试
        </button>
      </div>
    );
  }
  if (resource.state === 'cancelled') {
    return (
      <div className="safety-inline" role="status" data-story-knowledge-cancelled>
        <span>读取已取消，或目标章节与人物已经变化。</span>
        <button type="button" onClick={() => void resource.refresh()}>
          重新读取
        </button>
      </div>
    );
  }
  if (!resource.data) return <p className="empty-copy">暂无可显示的故事知识。</p>;

  return (
    <StoryKnowledgeProjectionView
      projection={resource.data}
      onNavigate={onNavigate}
      onHistoryCursor={onHistoryCursor}
      historyCursor={historyCursor}
    />
  );
}

function StoryKnowledgeProjectionView({
  projection,
  onNavigate,
  onHistoryCursor,
  historyCursor,
}: {
  readonly projection: StoryKnowledgeProjection;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly historyCursor: HistoryCursor | null;
}) {
  switch (projection.view) {
    case 'character_card':
      return <CharacterCard projection={projection} onNavigate={onNavigate} />;
    case 'relationships':
      return <RelationshipGraph projection={projection} onNavigate={onNavigate} />;
    case 'timeline':
      return <TimelineView projection={projection} onNavigate={onNavigate} />;
    case 'foreshadowing':
      return <ForeshadowingLane projection={projection} onNavigate={onNavigate} />;
    case 'arc':
      return <ArcRoute projection={projection} onNavigate={onNavigate} />;
    case 'history':
      return (
        <HistoryTimeline
          projection={projection}
          onNavigate={onNavigate}
          onHistoryCursor={onHistoryCursor}
          historyCursor={historyCursor}
        />
      );
    case 'chapter_assist':
      return null;
  }
}

function CharacterCard({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'character_card' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  return (
    <div className="story-knowledge-stack" data-story-character-card>
      <article className="feature-card">
        <header className="row-between">
          <div>
            <h3>{projection.character.name}</h3>
            <p>{projection.character.summary || '尚未填写人物简介。'}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              onNavigate({
                type: 'entity',
                projectId: projection.projectId,
                entityId: projection.character.id,
                query: null,
              })
            }
          >
            打开人物编辑
          </button>
        </header>
      </article>
      <KnowledgeGroup title="固定事实" empty="暂无固定事实。">
        {projection.facts.map((fact) => (
          <article key={fact.id} className="compact-card">
            <strong>{fact.key}</strong>
            <span>{displayValue(fact.value)}</span>
            {fact.description ? <small>{fact.description}</small> : null}
          </article>
        ))}
      </KnowledgeGroup>
      <KnowledgeGroup title="当前状态" empty="当前章节没有可用状态。">
        {projection.states.map((state) => (
          <article key={state.id} className="compact-card">
            <strong>{state.key}</strong>
            <span>{displayValue(state.value)}</span>
            <small>{state.semanticKind}</small>
          </article>
        ))}
      </KnowledgeGroup>
      <KnowledgeGroup title="人物关系" empty="当前没有人物关系。">
        {projection.relationships.map((relation) => (
          <RelationshipCard
            key={relation.id}
            relation={relation}
            projectId={projection.projectId}
            onNavigate={onNavigate}
          />
        ))}
      </KnowledgeGroup>
    </div>
  );
}

function RelationshipGraph({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'relationships' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  if (projection.relationships.length === 0) {
    return <p className="empty-copy">当前章节没有可显示的人物关系。</p>;
  }
  return (
    <div className="story-relationship-graph" data-story-relationship-graph>
      <button
        type="button"
        className="story-graph-center"
        onClick={() =>
          onNavigate({
            type: 'entity',
            projectId: projection.projectId,
            entityId: projection.center.id,
            query: null,
          })
        }
      >
        <strong>{projection.center.name}</strong>
        <span>中心人物</span>
      </button>
      <div className="story-graph-neighbors">
        {projection.relationships.map((relation) => {
          const neighborId =
            relation.fromCharacterId === projection.center.id
              ? relation.toCharacterId
              : relation.fromCharacterId;
          const neighborName =
            relation.fromCharacterId === projection.center.id
              ? relation.toCharacterName
              : relation.fromCharacterName;
          return (
            <button
              key={relation.id}
              type="button"
              className="compact-card story-graph-node"
              onClick={() =>
                onNavigate({
                  type: 'entity',
                  projectId: projection.projectId,
                  entityId: neighborId,
                  query: null,
                })
              }
            >
              <strong>{neighborName}</strong>
              <span>{relation.label || relation.category}</span>
              <small>{relation.category}</small>
            </button>
          );
        })}
      </div>
      {projection.truncated ? <p className="hint-copy">关系较多，仅显示当前窗口。</p> : null}
    </div>
  );
}

function TimelineView({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'timeline' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  if (projection.items.length === 0) {
    return <p className="empty-copy">当前时间窗口没有事件。</p>;
  }
  return (
    <ol className="story-timeline" data-story-timeline>
      {projection.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="feature-card story-timeline-item"
            onClick={() =>
              onNavigate({
                type: 'draft-block',
                projectId: projection.projectId,
                chapterId: item.chapterId,
                logicalBlockId: null,
                query: null,
              })
            }
          >
            <small>{item.chapterTitle}</small>
            <strong>{item.title}</strong>
            <span>
              {item.startValue}
              {item.endValue ? ` — ${item.endValue}` : ''}
            </span>
          </button>
        </li>
      ))}
      {projection.truncatedBefore || projection.truncatedAfter ? (
        <li className="hint-copy">时间线两侧仍有更多事件，可切换章节继续查看。</li>
      ) : null}
    </ol>
  );
}

function ForeshadowingLane({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'foreshadowing' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  if (projection.items.length === 0) {
    return <p className="empty-copy">当前章节没有需要关注的伏笔。</p>;
  }
  return (
    <div className="story-knowledge-stack" data-story-foreshadowing-lane>
      {projection.items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="feature-card story-foreshadowing-item"
          data-attention={item.attention}
          onClick={() =>
            onNavigate({
              type: 'foreshadowing',
              projectId: projection.projectId,
              foreshadowingId: item.id,
              chapterId: projection.anchorChapterId,
              query: null,
            })
          }
        >
          <span className="row-between">
            <strong>{item.title}</strong>
            <small>{attentionLabel(item.attention)}</small>
          </span>
          <span>{item.description || '尚未填写说明。'}</span>
        </button>
      ))}
      {projection.truncated ? <p className="hint-copy">伏笔较多，仅显示当前窗口。</p> : null}
    </div>
  );
}

function ArcRoute({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'arc' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  if (projection.milestones.length === 0) {
    return <p className="empty-copy">该人物暂无成长节点。</p>;
  }
  return (
    <div className="story-knowledge-stack" data-story-arc-route>
      <article className="feature-card">
        <h3>{projection.character.name}</h3>
        <p>{projection.character.summary || '尚未填写人物简介。'}</p>
      </article>
      <ol className="story-arc-route">
        {projection.milestones.map((milestone) => {
          const chapterId = milestone.actualChapterId ?? milestone.plannedChapterId;
          return (
            <li key={milestone.id} className="feature-card">
              <small>{milestone.arcTitle}</small>
              <strong>{milestone.title}</strong>
              <p>{milestone.description || '尚未填写节点说明。'}</p>
              <span>{milestone.status}</span>
              {chapterId ? (
                <button
                  type="button"
                  onClick={() =>
                    onNavigate({
                      type: 'draft-block',
                      projectId: projection.projectId,
                      chapterId,
                      logicalBlockId: null,
                      query: null,
                    })
                  }
                >
                  打开对应章节
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {projection.truncated ? <p className="hint-copy">成长节点较多，仅显示当前窗口。</p> : null}
    </div>
  );
}

function HistoryTimeline({
  projection,
  onNavigate,
  onHistoryCursor,
  historyCursor,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'history' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly historyCursor: HistoryCursor | null;
}) {
  return (
    <div className="story-knowledge-stack" data-story-history>
      <div className="row-between">
        <h3>章节历史</h3>
        {historyCursor ? (
          <button type="button" onClick={() => onHistoryCursor(null)}>
            回到最新
          </button>
        ) : null}
      </div>
      {projection.items.length === 0 ? (
        <p className="empty-copy">当前页没有历史记录。</p>
      ) : (
        <ol className="story-timeline">
          {projection.items.map((item) => (
            <li key={item.versionId}>
              <button
                type="button"
                className="feature-card story-timeline-item"
                onClick={() =>
                  onNavigate({
                    type: 'version',
                    projectId: projection.projectId,
                    chapterId: item.chapterId,
                    versionId: item.versionId,
                    query: null,
                  })
                }
              >
                <small>{new Date(item.createdAt).toLocaleString()}</small>
                <strong>{item.title}</strong>
                <span>{item.finalized ? '当前定稿' : item.versionType}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {projection.nextBeforeCreatedAt && projection.nextBeforeVersionId ? (
        <button
          type="button"
          onClick={() =>
            onHistoryCursor({
              createdAt: projection.nextBeforeCreatedAt!,
              versionId: projection.nextBeforeVersionId!,
            })
          }
        >
          查看更早记录
        </button>
      ) : null}
    </div>
  );
}

function RelationshipCard({
  relation,
  projectId,
  onNavigate,
}: {
  readonly relation: Extract<
    StoryKnowledgeProjection,
    { readonly view: 'character_card' }
  >['relationships'][number];
  readonly projectId: string;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  return (
    <article className="compact-card">
      <strong>{relation.label || relation.category}</strong>
      <span>
        {relation.fromCharacterName} → {relation.toCharacterName}
      </span>
      <span className="button-row">
        <button
          type="button"
          onClick={() =>
            onNavigate({
              type: 'entity',
              projectId,
              entityId: relation.fromCharacterId,
              query: null,
            })
          }
        >
          {relation.fromCharacterName}
        </button>
        <button
          type="button"
          onClick={() =>
            onNavigate({
              type: 'entity',
              projectId,
              entityId: relation.toCharacterId,
              query: null,
            })
          }
        >
          {relation.toCharacterName}
        </button>
      </span>
    </article>
  );
}

function KnowledgeGroup({
  title,
  empty,
  children,
}: {
  readonly title: string;
  readonly empty: string;
  readonly children: React.ReactNode;
}) {
  const values = Array.isArray(children) ? children : [children];
  return (
    <section className="feature-card">
      <h3>{title}</h3>
      {values.length === 0 ? <p className="empty-copy">{empty}</p> : children}
    </section>
  );
}

function StoryKnowledgeSelectionPrompt({
  view,
  hasEntity,
  hasChapter,
}: {
  readonly view: StoryKnowledgeView;
  readonly hasEntity: boolean;
  readonly hasChapter: boolean;
}) {
  const needsEntity =
    view === 'character-card' ||
    view === 'relationships' ||
    view === 'character-timeline' ||
    view === 'arc';
  const needsChapter =
    view === 'relationships' ||
    view === 'story-timeline' ||
    view === 'character-timeline' ||
    view === 'foreshadowing' ||
    view === 'history';
  const missing = [
    needsEntity && !hasEntity ? '人物' : null,
    needsChapter && !hasChapter ? '章节' : null,
  ].filter(Boolean);
  return (
    <p className="empty-copy" data-story-knowledge-empty>
      请先选择{missing.join('和')}，再查看{VIEW_LABELS[view]}。
    </p>
  );
}

function projectionInput(
  view: StoryKnowledgeView,
  projectId: string,
  entityId: string | null,
  chapterId: string | null,
  historyCursor: HistoryCursor | null,
): StoryKnowledgeProjectionInput | null {
  switch (view) {
    case 'character-card':
      return entityId
        ? { view: 'character_card', projectId, characterId: entityId, chapterId, limit: 50 }
        : null;
    case 'relationships':
      return entityId && chapterId
        ? { view: 'relationships', projectId, characterId: entityId, chapterId, limit: 50 }
        : null;
    case 'story-timeline':
      return chapterId
        ? { view: 'timeline', projectId, chapterId, characterId: null, before: 12, after: 12 }
        : null;
    case 'character-timeline':
      return chapterId && entityId
        ? { view: 'timeline', projectId, chapterId, characterId: entityId, before: 12, after: 12 }
        : null;
    case 'foreshadowing':
      return chapterId ? { view: 'foreshadowing', projectId, chapterId, limit: 50 } : null;
    case 'arc':
      return entityId
        ? { view: 'arc', projectId, characterId: entityId, chapterId, limit: 50 }
        : null;
    case 'history':
      return chapterId
        ? {
            view: 'history',
            projectId,
            chapterId,
            beforeCreatedAt: historyCursor?.createdAt ?? null,
            beforeVersionId: historyCursor?.versionId ?? null,
            limit: 30,
          }
        : null;
  }
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function attentionLabel(attention: 'none' | 'due' | 'overdue' | 'blocked'): string {
  switch (attention) {
    case 'blocked':
      return '存在前置条件';
    case 'overdue':
      return '已超过回收窗口';
    case 'due':
      return '当前可推进';
    case 'none':
      return '正常';
  }
}
