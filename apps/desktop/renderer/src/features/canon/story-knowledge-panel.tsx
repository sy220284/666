import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  StoryKnowledgeProjection,
  StoryKnowledgeProjectionInput,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeQuery } from '../../bridge/use-bridge-resource.js';
import { authorErrorSummary } from '../../presentation/author-error-message.js';
import type { AuthorNavigationTarget } from '../../shell/navigation-target.js';
import { StoryKnowledgeHistoryMetadata } from './story-knowledge-history-metadata.js';

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

  useEffect(() => setHistoryCursor(null), [props.projectId, props.selectedChapterId]);

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
        <ProjectionPane
          bridge={props.bridge}
          input={input}
          view={view}
          historyCursor={historyCursor}
          onHistoryCursor={setHistoryCursor}
          onNavigate={props.onNavigate}
        />
      ) : (
        <SelectionPrompt
          view={view}
          hasEntity={Boolean(props.selectedEntityId)}
          hasChapter={Boolean(props.selectedChapterId)}
        />
      )}
    </section>
  );
}

function ProjectionPane({
  bridge,
  input,
  view,
  historyCursor,
  onHistoryCursor,
  onNavigate,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly input: StoryKnowledgeProjectionInput;
  readonly view: StoryKnowledgeView;
  readonly historyCursor: HistoryCursor | null;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  const requestIdentity = useMemo(() => JSON.stringify(input), [input]);
  const load = useCallback(
    () =>
      bridge.storyKnowledge.project(input, {
        mode: 'replace',
        requestKey: `story-knowledge:${requestIdentity}`,
        laneKey: `story-knowledge:${input.projectId}:${view}`,
      }),
    [bridge, input, requestIdentity, view],
  );
  const resource = useBridgeQuery(`story-knowledge:${requestIdentity}`, load);

  if (resource.state === 'loading') return <p className="safety-inline">正在读取故事知识…</p>;
  if (resource.state === 'failure') {
    return (
      <ReadState dataAttribute="data-story-knowledge-error" error>
        <span>
          {resource.error ? authorErrorSummary(resource.error) : '故事知识暂时无法读取。'}
        </span>
        <button type="button" onClick={() => void resource.refresh()}>
          重试
        </button>
      </ReadState>
    );
  }
  if (resource.state === 'cancelled') {
    return (
      <ReadState dataAttribute="data-story-knowledge-cancelled">
        <span>读取已取消，或目标章节与人物已经变化。</span>
        <button type="button" onClick={() => void resource.refresh()}>
          重新读取
        </button>
      </ReadState>
    );
  }
  if (!resource.data) return <p className="empty-copy">暂无可显示的故事知识。</p>;

  return (
    <ProjectionContent
      projection={resource.data}
      historyCursor={historyCursor}
      onHistoryCursor={onHistoryCursor}
      onNavigate={onNavigate}
    />
  );
}

function ReadState({
  children,
  dataAttribute,
  error = false,
}: {
  readonly children: ReactNode;
  readonly dataAttribute: 'data-story-knowledge-error' | 'data-story-knowledge-cancelled';
  readonly error?: boolean;
}) {
  return (
    <div
      className={`safety-inline${error ? ' is-error' : ''}`}
      role={error ? 'alert' : 'status'}
      data-story-knowledge-error={dataAttribute === 'data-story-knowledge-error' ? '' : undefined}
      data-story-knowledge-cancelled={
        dataAttribute === 'data-story-knowledge-cancelled' ? '' : undefined
      }
    >
      {children}
    </div>
  );
}

function ProjectionContent({
  projection,
  historyCursor,
  onHistoryCursor,
  onNavigate,
}: {
  readonly projection: StoryKnowledgeProjection;
  readonly historyCursor: HistoryCursor | null;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  switch (projection.view) {
    case 'character_card':
      return <CharacterCard projection={projection} onNavigate={onNavigate} />;
    case 'relationships':
      return <RelationshipGraph projection={projection} onNavigate={onNavigate} />;
    case 'timeline':
      return <Timeline projection={projection} onNavigate={onNavigate} />;
    case 'foreshadowing':
      return <ForeshadowingLane projection={projection} onNavigate={onNavigate} />;
    case 'arc':
      return <ArcRoute projection={projection} onNavigate={onNavigate} />;
    case 'history':
      return (
        <History
          projection={projection}
          historyCursor={historyCursor}
          onHistoryCursor={onHistoryCursor}
          onNavigate={onNavigate}
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
    <div className="story-knowledge-stack" data-story-character-card data-character-card>
      <article className="feature-card row-between">
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
      </article>
      <Group title="固定事实" empty={projection.facts.length === 0} emptyText="暂无固定事实。">
        {projection.facts.map((fact) => (
          <article key={fact.id} className="compact-card">
            <strong>{fact.key}</strong>
            <span>{displayValue(fact.value)}</span>
            {fact.description ? <small>{fact.description}</small> : null}
          </article>
        ))}
      </Group>
      <Group
        title="当前状态"
        empty={projection.states.length === 0}
        emptyText="当前章节没有可用状态。"
      >
        {projection.states.map((state) => (
          <article key={state.id} className="compact-card">
            <strong>{state.key}</strong>
            <span>{displayValue(state.value)}</span>
            <small>{state.semanticKind}</small>
          </article>
        ))}
      </Group>
      <Group
        title="人物关系"
        empty={projection.relationships.length === 0}
        emptyText="当前没有人物关系。"
      >
        {projection.relationships.map((relation) => (
          <article key={relation.id} className="compact-card">
            <strong>{relation.label || relation.category}</strong>
            <span>
              {relation.fromCharacterName} → {relation.toCharacterName}
            </span>
          </article>
        ))}
      </Group>
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
    <div className="story-relationship-graph" data-story-relationship-graph data-relationship-graph>
      <button
        type="button"
        className="story-graph-center"
        onClick={() => navigateEntity(onNavigate, projection.projectId, projection.center.id)}
      >
        <strong>{projection.center.name}</strong>
        <span>中心人物</span>
      </button>
      <div className="story-graph-neighbors">
        {projection.relationships.map((relation) => {
          const fromCenter = relation.fromCharacterId === projection.center.id;
          const neighborId = fromCenter ? relation.toCharacterId : relation.fromCharacterId;
          const neighborName = fromCenter ? relation.toCharacterName : relation.fromCharacterName;
          return (
            <button
              key={relation.id}
              type="button"
              className="compact-card story-graph-node"
              onClick={() => navigateEntity(onNavigate, projection.projectId, neighborId)}
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

function Timeline({
  projection,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'timeline' }>;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  if (projection.items.length === 0) return <p className="empty-copy">当前时间窗口没有事件。</p>;
  return (
    <ol className="story-timeline" data-story-timeline data-timeline-window>
      {projection.items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            className="feature-card story-timeline-item"
            onClick={() => navigateChapter(onNavigate, projection.projectId, item.chapterId)}
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
  if (projection.items.length === 0)
    return <p className="empty-copy">当前章节没有需要关注的伏笔。</p>;
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
  if (projection.milestones.length === 0) return <p className="empty-copy">该人物暂无成长节点。</p>;
  return (
    <div className="story-knowledge-stack" data-story-arc-route>
      <article className="feature-card">
        <h3>{projection.character.name}</h3>
        <p>{projection.character.summary || '尚未填写人物简介。'}</p>
      </article>
      <ol className="story-arc-route">
        {projection.milestones.map((milestone) => {
          const targetChapterId = milestone.actualChapterId ?? milestone.plannedChapterId;
          return (
            <li key={milestone.id} className="feature-card">
              <small>{milestone.arcTitle}</small>
              <strong>{milestone.title}</strong>
              <p>{milestone.description || '尚未填写节点说明。'}</p>
              <span>{milestone.status}</span>
              {targetChapterId ? (
                <button
                  type="button"
                  onClick={() => navigateChapter(onNavigate, projection.projectId, targetChapterId)}
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

function History({
  projection,
  historyCursor,
  onHistoryCursor,
  onNavigate,
}: {
  readonly projection: Extract<StoryKnowledgeProjection, { readonly view: 'history' }>;
  readonly historyCursor: HistoryCursor | null;
  readonly onHistoryCursor: (cursor: HistoryCursor | null) => void;
  readonly onNavigate: (target: AuthorNavigationTarget) => void;
}) {
  const nextCreatedAt = projection.nextBeforeCreatedAt;
  const nextVersionId = projection.nextBeforeVersionId;
  return (
    <div className="story-knowledge-stack" data-story-history data-history-projection>
      <section className="feature-card story-knowledge-group">
        <div className="row-between">
          <h3>章节版本</h3>
          {historyCursor ? (
            <button type="button" onClick={() => onHistoryCursor(null)}>
              回到最新
            </button>
          ) : null}
        </div>
        {projection.items.length === 0 ? (
          <p className="empty-copy">当前页没有版本记录。</p>
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
        {nextCreatedAt && nextVersionId ? (
          <button
            type="button"
            onClick={() => onHistoryCursor({ createdAt: nextCreatedAt, versionId: nextVersionId })}
          >
            查看更早版本
          </button>
        ) : null}
      </section>

      <StoryKnowledgeHistoryMetadata projection={projection} />
    </div>
  );
}

function Group({
  title,
  empty,
  emptyText,
  children,
}: {
  readonly title: string;
  readonly empty: boolean;
  readonly emptyText: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="feature-card story-knowledge-group">
      <h3>{title}</h3>
      {empty ? <p className="empty-copy">{emptyText}</p> : children}
    </section>
  );
}

function SelectionPrompt({
  view,
  hasEntity,
  hasChapter,
}: {
  readonly view: StoryKnowledgeView;
  readonly hasEntity: boolean;
  readonly hasChapter: boolean;
}) {
  const needsEntity = ['character-card', 'relationships', 'character-timeline', 'arc'].includes(
    view,
  );
  const needsChapter = [
    'relationships',
    'story-timeline',
    'character-timeline',
    'foreshadowing',
    'history',
  ].includes(view);
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

function navigateEntity(
  onNavigate: (target: AuthorNavigationTarget) => void,
  projectId: string,
  entityId: string,
) {
  onNavigate({ type: 'entity', projectId, entityId, query: null });
}

function navigateChapter(
  onNavigate: (target: AuthorNavigationTarget) => void,
  projectId: string,
  chapterId: string,
) {
  onNavigate({ type: 'draft-block', projectId, chapterId, logicalBlockId: null, query: null });
}

function displayValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '—';
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
