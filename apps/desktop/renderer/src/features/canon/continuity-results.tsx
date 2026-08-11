import type { ContinuityCatalog } from '@worldforge/contracts';

import { authorJsonValue } from '../../presentation/author-value-format.js';
import {
  authorStateLabel,
  chapterName,
  entityName,
  knowledgeStatusLabel,
  recordStatusLabel,
  timelinePrecisionLabel,
  type CanonAuthorReferences,
} from './canon-author-fields.js';
import { LedgerRecord, LedgerSection } from './canon-panel-shared.js';

export function ContinuityResults({
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
      <LedgerSection title={`人物关系（${catalog?.relationships.length ?? 0}）`}>
        {catalog?.relationships.map((relationship) => (
          <LedgerRecord
            key={relationship.id}
            title={`${entityName(references, relationship.fromCharacterId)} → ${entityName(references, relationship.toCharacterId)}`}
            lines={[
              `${relationship.category} · ${relationship.label}`,
              recordStatusLabel(relationship.recordStatus),
              `${chapterName(references, relationship.validFromChapterId)} → ${chapterName(references, relationship.validUntilChapterId)}`,
            ]}
          />
        ))}
      </LedgerSection>
    </div>
  );
}
