import type { NarrativePlanningCatalog } from '@worldforge/contracts';

import {
  authorCharacterArcStatusLabel,
  authorForeshadowingStatusLabel,
} from '../../presentation/author-value-format.js';
import {
  arcTypeLabel,
  chapterName,
  entityName,
  type CanonAuthorReferences,
} from './canon-author-fields.js';
import { LedgerRecord, LedgerSection } from './canon-panel-shared.js';

export function NarrativePlanningResults({
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
