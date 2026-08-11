import type { DatabaseSync } from 'node:sqlite';

import {
  ArcMilestoneResolutionValueSchema,
  CanonFactProposalValueSchema,
  CharacterRelationshipProposalValueSchema,
  EntityCreateProposalValueSchema,
  EntityStateProposalValueSchema,
  ForeshadowingProposalValueSchema,
  KnowledgeStateProposalValueSchema,
  TimelineEventProposalValueSchema,
  type StateProposal,
  type StateProposalDraft,
} from '@worldforge/contracts';
import { normalizeCharacterRelationshipLabel, normalizeContinuityKey } from '@worldforge/domain';

import { applyCharacterRelationshipInTransaction } from '../continuity-relationship.js';
import { applyEntityStateInTransaction, applyKnowledgeState } from '../continuity-state.js';
import { applyTimelineEvent } from '../continuity-timeline.js';
import { validateChapterRange } from '../continuity-validation.js';
import { applyCanonFact, applyEntityCreate } from '../entity-canon.js';
import { applyArcMilestoneTransitionInTransaction } from '../narrative-planning/character-arc-operations.js';
import { applyForeshadowingTransition } from '../narrative-planning/foreshadowing-operations.js';
import { StateProposalServiceError } from './state-row-mappers.js';

export interface StateProposalInsertShape {
  readonly target: StateProposal['target'];
  readonly previousValue: unknown | null;
  readonly proposedValue: unknown;
  readonly targetKey: string;
}

function activeEntity(
  connection: DatabaseSync,
  projectId: string,
  entityId: string,
  expectedType?: string,
): void {
  const row = connection
    .prepare(
      `SELECT entity_type AS entityType
         FROM entities WHERE id = ? AND project_id = ? AND status = 'active'`,
    )
    .get(entityId, projectId) as { readonly entityType: string } | undefined;
  if (!row || (expectedType && row.entityType !== expectedType)) {
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_NOT_FOUND',
      `The active ${expectedType ?? ''} proposal Entity was not found.`.trim(),
    );
  }
}

function json(value: string | null | undefined): unknown | null {
  return value == null ? null : (JSON.parse(value) as unknown);
}

export function stateProposalInsertShape(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  draft: StateProposalDraft,
): StateProposalInsertShape {
  switch (draft.proposalType) {
    case 'entity_state': {
      activeEntity(connection, projectId, draft.entityId);
      validateChapterRange(connection, projectId, chapterId, draft.validUntilChapterId);
      const stateKey = normalizeContinuityKey(draft.stateKey, 120);
      const current = connection
        .prepare(
          `SELECT value_json AS valueJson, semantic_kind AS semanticKind,
                  valid_until_chapter_id AS validUntilChapterId
             FROM entity_states
            WHERE project_id = ? AND entity_id = ? AND state_key = ?
              AND record_status = 'current'`,
        )
        .get(projectId, draft.entityId, stateKey) as
        | {
            readonly valueJson: string;
            readonly semanticKind: string;
            readonly validUntilChapterId: string | null;
          }
        | undefined;
      return {
        target: { targetType: 'entity_state', entityId: draft.entityId, stateKey },
        previousValue: current
          ? {
              value: json(current.valueJson),
              semanticKind: current.semanticKind,
              validUntilChapterId: current.validUntilChapterId,
            }
          : null,
        proposedValue: {
          value: draft.proposedValue,
          semanticKind: draft.semanticKind,
          validUntilChapterId: draft.validUntilChapterId,
        },
        targetKey: `entity-state:${draft.entityId}:${stateKey}`,
      };
    }
    case 'knowledge_state': {
      activeEntity(connection, projectId, draft.characterId, 'character');
      validateChapterRange(
        connection,
        projectId,
        chapterId,
        draft.proposedKnowledge.validUntilChapterId,
      );
      const informationKey = normalizeContinuityKey(draft.informationKey);
      const current = connection
        .prepare(
          `SELECT knowledge_status AS knowledgeStatus,
                  valid_until_chapter_id AS validUntilChapterId, notes
             FROM knowledge_states
            WHERE project_id = ? AND character_id = ? AND information_key = ?
              AND record_status = 'current'`,
        )
        .get(projectId, draft.characterId, informationKey) as
        | {
            readonly knowledgeStatus: string;
            readonly validUntilChapterId: string | null;
            readonly notes: string;
          }
        | undefined;
      return {
        target: { targetType: 'knowledge_state', characterId: draft.characterId, informationKey },
        previousValue: current ?? null,
        proposedValue: draft.proposedKnowledge,
        targetKey: `knowledge:${draft.characterId}:${informationKey}`,
      };
    }
    case 'timeline_event': {
      const eventId = draft.proposedEvent.eventId;
      const current = eventId
        ? (connection
            .prepare(
              `SELECT id AS eventId, title, start_value AS startValue,
                      end_value AS endValue, precision, location_id AS locationId,
                      description
                 FROM timeline_events WHERE id = ? AND project_id = ? AND status = 'active'`,
            )
            .get(eventId, projectId) ?? null)
        : null;
      if (eventId && !current) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_NOT_FOUND',
          'The active TimelineEvent proposal target was not found.',
        );
      }
      return {
        target: { targetType: 'timeline_event', eventId },
        previousValue: current,
        proposedValue: draft.proposedEvent,
        targetKey: `timeline:${eventId ?? `${draft.proposedEvent.startValue}:${draft.proposedEvent.title}`}`,
      };
    }
    case 'character_relationship': {
      activeEntity(connection, projectId, draft.fromCharacterId, 'character');
      activeEntity(connection, projectId, draft.toCharacterId, 'character');
      validateChapterRange(
        connection,
        projectId,
        chapterId,
        draft.proposedRelationship.validUntilChapterId,
      );
      const label = normalizeCharacterRelationshipLabel(draft.proposedRelationship.label);
      const current = connection
        .prepare(
          `SELECT valid_until_chapter_id AS validUntilChapterId
             FROM character_relationships
            WHERE project_id = ? AND from_character_id = ? AND to_character_id = ?
              AND category = ? AND label = ? AND record_status = 'current'`,
        )
        .get(
          projectId,
          draft.fromCharacterId,
          draft.toCharacterId,
          draft.proposedRelationship.category,
          label,
        ) as { readonly validUntilChapterId: string | null } | undefined;
      return {
        target: {
          targetType: 'character_relationship',
          fromCharacterId: draft.fromCharacterId,
          toCharacterId: draft.toCharacterId,
          category: draft.proposedRelationship.category,
          label,
        },
        previousValue: current ?? null,
        proposedValue: { ...draft.proposedRelationship, label },
        targetKey: `relationship:${draft.fromCharacterId}:${draft.toCharacterId}:${draft.proposedRelationship.category}:${label}`,
      };
    }
    case 'foreshadowing': {
      const current = connection
        .prepare('SELECT status FROM foreshadowings WHERE id = ? AND project_id = ?')
        .get(draft.proposedForeshadowing.foreshadowingId, projectId) as
        { readonly status: string } | undefined;
      if (!current) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_NOT_FOUND',
          'The Foreshadowing proposal target was not found.',
        );
      }
      return {
        target: {
          targetType: 'foreshadowing',
          foreshadowingId: draft.proposedForeshadowing.foreshadowingId,
        },
        previousValue: current,
        proposedValue: draft.proposedForeshadowing,
        targetKey: `foreshadowing:${draft.proposedForeshadowing.foreshadowingId}`,
      };
    }
    case 'arc_milestone': {
      const current = connection
        .prepare(
          `SELECT status, actual_chapter_id AS actualChapterId
             FROM arc_milestones WHERE id = ? AND project_id = ?`,
        )
        .get(draft.arcMilestoneId, projectId) as
        { readonly status: string; readonly actualChapterId: string | null } | undefined;
      if (!current) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_NOT_FOUND',
          'The proposal ArcMilestone was not found.',
        );
      }
      if (current.status !== 'planned') {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'Only planned ArcMilestones may receive pending proposals.',
        );
      }
      const proposedValue = ArcMilestoneResolutionValueSchema.parse({
        status: draft.proposedStatus,
        actualChapterId: draft.actualChapterId,
      });
      return {
        target: { targetType: 'arc_milestone', arcMilestoneId: draft.arcMilestoneId },
        previousValue: current,
        proposedValue,
        targetKey: `milestone:${draft.arcMilestoneId}`,
      };
    }
    case 'entity_create': {
      const normalizedName = draft.proposedEntity.name.trim();
      const duplicate = connection
        .prepare(
          `SELECT 1 FROM entities
            WHERE project_id = ? AND entity_type = ? AND status = 'active'
              AND lower(name) = lower(?)`,
        )
        .get(projectId, draft.proposedEntity.entityType, normalizedName);
      if (duplicate) {
        throw new StateProposalServiceError(
          'STATE_PROPOSAL_CONFLICT',
          'An active Entity with the same type and name already exists.',
        );
      }
      return {
        target: {
          targetType: 'entity_create',
          entityType: draft.proposedEntity.entityType,
          name: normalizedName,
        },
        previousValue: null,
        proposedValue: { ...draft.proposedEntity, name: normalizedName },
        targetKey: `entity-create:${draft.proposedEntity.entityType}:${normalizedName.toLowerCase()}`,
      };
    }
    case 'canon_fact': {
      activeEntity(connection, projectId, draft.entityId);
      const factKey = normalizeContinuityKey(draft.factKey, 120);
      const current = connection
        .prepare(
          `SELECT value_json AS valueJson, description
             FROM canon_facts
            WHERE project_id = ? AND entity_id = ? AND fact_key = ? AND status = 'current'`,
        )
        .get(projectId, draft.entityId, factKey) as
        { readonly valueJson: string; readonly description: string } | undefined;
      return {
        target: { targetType: 'canon_fact', entityId: draft.entityId, factKey },
        previousValue: current
          ? { value: json(current.valueJson), description: current.description }
          : null,
        proposedValue: draft.proposedFact,
        targetKey: `canon-fact:${draft.entityId}:${factKey}`,
      };
    }
  }
}

export function applyStateProposalInTransaction(
  connection: DatabaseSync,
  proposal: StateProposal,
  value: unknown,
  now: string,
  idFactory: () => string,
): unknown {
  try {
    switch (proposal.proposalType) {
      case 'entity_state': {
        if (proposal.target.targetType !== 'entity_state') break;
        const parsed = EntityStateProposalValueSchema.parse(value);
        applyEntityStateInTransaction(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            entityId: proposal.target.entityId,
            stateKey: proposal.target.stateKey,
            semanticKind: parsed.semanticKind,
            value: parsed.value,
            validFromChapterId: proposal.chapterId,
            validUntilChapterId: parsed.validUntilChapterId,
            evidence: proposal.evidence,
            sourceVersionId: proposal.sourceVersionId,
          },
          now,
          idFactory,
        );
        return parsed;
      }
      case 'knowledge_state': {
        if (proposal.target.targetType !== 'knowledge_state') break;
        const parsed = KnowledgeStateProposalValueSchema.parse(value);
        applyKnowledgeState(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            informationKey: proposal.target.informationKey,
            characterId: proposal.target.characterId,
            knowledgeStatus: parsed.knowledgeStatus,
            validFromChapterId: proposal.chapterId,
            validUntilChapterId: parsed.validUntilChapterId,
            sourceVersionId: proposal.sourceVersionId,
            sourceLogicalBlockId:
              proposal.evidence.find((anchor) => anchor.kind === 'logicalBlock')?.targetId ?? null,
            notes: parsed.notes,
          },
          now,
          idFactory,
        );
        return parsed;
      }
      case 'timeline_event': {
        if (proposal.target.targetType !== 'timeline_event') break;
        const parsed = TimelineEventProposalValueSchema.parse(value);
        if (parsed.eventId !== proposal.target.eventId) {
          throw new StateProposalServiceError(
            'STATE_PROPOSAL_INVALID',
            'Timeline edit acceptance cannot change the proposal target Event.',
          );
        }
        const eventId = proposal.target.eventId ?? idFactory();
        applyTimelineEvent(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            ...parsed,
            eventId: proposal.target.eventId,
            chapterId: proposal.chapterId,
          },
          eventId,
          now,
        );
        return { ...parsed, eventId };
      }
      case 'character_relationship': {
        if (proposal.target.targetType !== 'character_relationship') break;
        const parsed = CharacterRelationshipProposalValueSchema.parse(value);
        if (
          parsed.category !== proposal.target.category ||
          normalizeCharacterRelationshipLabel(parsed.label) !== proposal.target.label
        ) {
          throw new StateProposalServiceError(
            'STATE_PROPOSAL_INVALID',
            'Relationship edit acceptance cannot change the proposal target identity.',
          );
        }
        const relationshipId = applyCharacterRelationshipInTransaction(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            fromCharacterId: proposal.target.fromCharacterId,
            toCharacterId: proposal.target.toCharacterId,
            category: parsed.category,
            label: parsed.label,
            validFromChapterId: proposal.chapterId,
            validUntilChapterId: parsed.validUntilChapterId,
            sourceVersionId: proposal.sourceVersionId,
            evidence: proposal.evidence,
          },
          now,
          idFactory,
        );
        return { ...parsed, relationshipId };
      }
      case 'foreshadowing': {
        if (proposal.target.targetType !== 'foreshadowing') break;
        const parsed = ForeshadowingProposalValueSchema.parse(value);
        applyForeshadowingTransition(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            foreshadowingId: proposal.target.foreshadowingId,
            status: parsed.status,
          },
          now,
        );
        return parsed;
      }
      case 'arc_milestone': {
        if (proposal.target.targetType !== 'arc_milestone') break;
        const parsed = ArcMilestoneResolutionValueSchema.parse(value);
        applyArcMilestoneTransitionInTransaction(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            milestoneId: proposal.target.arcMilestoneId,
            status: parsed.status,
            actualChapterId: parsed.actualChapterId,
          },
          now,
          'state_proposal',
        );
        return parsed;
      }
      case 'entity_create': {
        const parsed = EntityCreateProposalValueSchema.parse(value);
        const entityId = applyEntityCreate(
          connection,
          { projectId: proposal.projectId, authority: 'author', ...parsed },
          now,
          idFactory,
        );
        return { ...parsed, entityId };
      }
      case 'canon_fact': {
        if (proposal.target.targetType !== 'canon_fact') break;
        const parsed = CanonFactProposalValueSchema.parse(value);
        const factId = applyCanonFact(
          connection,
          {
            projectId: proposal.projectId,
            authority: 'author',
            entityId: proposal.target.entityId,
            factKey: proposal.target.factKey,
            value: parsed.value,
            description: parsed.description,
            sourceType: 'author',
            sourceId: proposal.id,
          },
          now,
          idFactory,
        );
        return { ...parsed, factId };
      }
    }
  } catch (error) {
    if (error instanceof StateProposalServiceError) throw error;
    throw new StateProposalServiceError(
      'STATE_PROPOSAL_CONFLICT',
      error instanceof Error ? error.message : 'The StateProposal could not be applied.',
      { cause: error },
    );
  }
  throw new StateProposalServiceError(
    'STATE_PROPOSAL_INVARIANT',
    'The StateProposal target does not match its type.',
  );
}
