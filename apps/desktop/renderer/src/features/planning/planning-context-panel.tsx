import type { Entity, NarrativePlanningCatalog } from '@worldforge/contracts';

import {
  authorCharacterArcStatusLabel,
  authorEntityTypeLabel,
  authorForeshadowingStatusLabel,
} from '../../presentation/author-value-format.js';

export function PlanningContextPanel({
  entities,
  narrative,
}: {
  readonly entities: readonly Entity[];
  readonly narrative: NarrativePlanningCatalog | null;
}) {
  return (
    <aside className="planning-context" aria-label="规划上下文">
      <section className="feature-card">
        <h2>人物与设定</h2>
        {entities.length ? (
          <ul className="compact-list">
            {entities.slice(0, 12).map((entity) => (
              <li key={entity.id}>
                <strong>{entity.name}</strong>
                <span>{authorEntityTypeLabel(entity.entityType)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>暂无人物或设定。可在设定工作台建立人物、地点和规则。</p>
        )}
      </section>
      <section className="feature-card">
        <h2>权威边界</h2>
        <p>作品核心、大纲节点与场景均属于规划；正文段落移动需要单独预览与确认。</p>
        <p>动态状态和AI审阅建议不会在此自动确认为已确认设定。</p>
      </section>
      <section className="feature-card">
        <h2>伏笔与弧光摘要</h2>
        <p>
          伏笔 {narrative?.foreshadowings.length ?? 0} · 人物弧光{' '}
          {narrative?.characterArcs.length ?? 0}
        </p>
        <ul className="compact-list">
          {narrative?.foreshadowings.slice(0, 6).map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>{authorForeshadowingStatusLabel(item.status)}</span>
            </li>
          ))}
          {narrative?.characterArcs.slice(0, 6).map((arc) => (
            <li key={arc.id}>
              <strong>{arc.title}</strong>
              <span>
                {authorCharacterArcStatusLabel(arc.status)} · 节点 {arc.milestones.length}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
