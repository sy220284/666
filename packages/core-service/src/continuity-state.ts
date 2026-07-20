import type { DatabaseSync } from 'node:sqlite';

import {
  EntityStateInvalidateInputSchema,
  EntityStateSetInputSchema,
  KnowledgeStateInvalidateInputSchema,
  KnowledgeStateSetInputSchema,
  type ContinuityCatalog,
  type EntityStateInvalidateInput,
  type EntityStateSetInput,
  type KnowledgeStateInvalidateInput,
  type KnowledgeStateSetInput,
} from '@worldforge/contracts';
import { compareChapterPosition, normalizeContinuityKey } from '@worldforge/domain';

import {
  ContinuityServiceError,
  authorOnly,
  currentRecord,
  type ChapterPosition,
  type ContinuityContext,
} from './continuity-model.js';
import { readCatalog } from './continuity-read.js';
import {
  assertEntity,
  assertLogicalBlock,
  assertVersion,
  chapterPosition,
  validateChapterRange,
  validateEvidence,
} from './continuity-validation.js';

const catalogInput = (projectId: string) => ({
  projectId,
  query: '',
  includeHistory: true,
  includeArchivedEvents: false,
  effectiveAtChapterId: null,
});

function replacementEndChapterId(
  connection: DatabaseSync,
  projectId: string,
  currentEndChapterId: string | null,
  nextStartChapterId: string,
  nextStart: ChapterPosition,
): string {
  if (!currentEndChapterId) return nextStartChapterId;
  const currentEnd = chapterPosition(connection, projectId, currentEndChapterId);
  return compareChapterPosition(currentEnd, nextStart) > 0
    ? nextStartChapterId
    : currentEndChapterId;
}

export async function setEntityState(
  context: ContinuityContext,
  requestId: string,
  input: EntityStateSetInput,
): Promise<ContinuityCatalog> {
  const valid = EntityStateSetInputSchema.parse(input);
  authorOnly(valid.authority);
  const stateKey = normalizeContinuityKey(valid.stateKey, 120);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    assertEntity(connection, valid.projectId, valid.entityId);
    const range = validateChapterRange(
      connection,
      valid.projectId,
      valid.validFromChapterId,
      valid.validUntilChapterId,
    );
    assertVersion(connection, valid.projectId, valid.sourceVersionId);
    validateEvidence(connection, valid.projectId, valid.evidence);
    const current = currentRecord(connection, 'entity_states', 'entity_id = ? AND state_key = ?', [
      valid.entityId,
      stateKey,
    ]);
    const now = context.clock.now().toISOString();
    if (current) {
      const ordering = compareChapterPosition(
        chapterPosition(connection, valid.projectId, current.validFromChapterId),
        range.start,
      );
      if (ordering > 0) {
        throw new ContinuityServiceError(
          'CONTINUITY_CONFLICT',
          'Historical backfill requires an explicit migration workflow.',
        );
      }
      const previousEndChapterId = replacementEndChapterId(
        connection,
        valid.projectId,
        current.validUntilChapterId,
        valid.validFromChapterId,
        range.start,
      );
      connection
        .prepare(
          `UPDATE entity_states
              SET record_status = ?, valid_until_chapter_id = ?, superseded_at = ?
            WHERE id = ?`,
        )
        .run(ordering === 0 ? 'superseded' : 'historical', previousEndChapterId, now, current.id);
    }
    connection
      .prepare(
        `INSERT INTO entity_states(
           id, project_id, entity_id, state_key, value_json,
           valid_from_chapter_id, valid_until_chapter_id, record_status,
           evidence_json, source_version_id, created_at, superseded_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, NULL)`,
      )
      .run(
        context.idFactory(),
        valid.projectId,
        valid.entityId,
        stateKey,
        JSON.stringify(valid.value),
        valid.validFromChapterId,
        valid.validUntilChapterId,
        JSON.stringify(valid.evidence),
        valid.sourceVersionId,
        now,
      );
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}

export async function invalidateEntityState(
  context: ContinuityContext,
  requestId: string,
  input: EntityStateInvalidateInput,
): Promise<ContinuityCatalog> {
  const valid = EntityStateInvalidateInputSchema.parse(input);
  authorOnly(valid.authority);
  const stateKey = normalizeContinuityKey(valid.stateKey, 120);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    const result = connection
      .prepare(
        `UPDATE entity_states
            SET record_status = 'invalid', superseded_at = ?
          WHERE project_id = ? AND entity_id = ? AND state_key = ?
            AND record_status = 'current'`,
      )
      .run(context.clock.now().toISOString(), valid.projectId, valid.entityId, stateKey);
    if (Number(result.changes) !== 1) {
      throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Current EntityState not found.');
    }
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}

export async function setKnowledgeState(
  context: ContinuityContext,
  requestId: string,
  input: KnowledgeStateSetInput,
): Promise<ContinuityCatalog> {
  const valid = KnowledgeStateSetInputSchema.parse(input);
  authorOnly(valid.authority);
  const informationKey = normalizeContinuityKey(valid.informationKey);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    assertEntity(connection, valid.projectId, valid.characterId, 'character');
    const range = validateChapterRange(
      connection,
      valid.projectId,
      valid.validFromChapterId,
      valid.validUntilChapterId,
    );
    if (!valid.sourceVersionId && !valid.sourceLogicalBlockId) {
      throw new ContinuityServiceError(
        'CONTINUITY_INVALID',
        'KnowledgeState requires a stable Version or logical block source anchor.',
      );
    }
    if (valid.sourceVersionId) assertVersion(connection, valid.projectId, valid.sourceVersionId);
    if (valid.sourceLogicalBlockId) {
      assertLogicalBlock(connection, valid.projectId, valid.sourceLogicalBlockId);
    }
    const current = currentRecord(
      connection,
      'knowledge_states',
      'character_id = ? AND information_key = ?',
      [valid.characterId, informationKey],
    );
    const now = context.clock.now().toISOString();
    if (current) {
      const ordering = compareChapterPosition(
        chapterPosition(connection, valid.projectId, current.validFromChapterId),
        range.start,
      );
      if (ordering > 0) {
        throw new ContinuityServiceError(
          'CONTINUITY_CONFLICT',
          'Historical knowledge backfill requires an explicit migration workflow.',
        );
      }
      const previousEndChapterId = replacementEndChapterId(
        connection,
        valid.projectId,
        current.validUntilChapterId,
        valid.validFromChapterId,
        range.start,
      );
      connection
        .prepare(
          `UPDATE knowledge_states
              SET record_status = 'historical', valid_until_chapter_id = ?, superseded_at = ?
            WHERE id = ?`,
        )
        .run(previousEndChapterId, now, current.id);
    }
    connection
      .prepare(
        `INSERT INTO knowledge_states(
           id, project_id, information_key, character_id, knowledge_status,
           valid_from_chapter_id, valid_until_chapter_id, source_version_id,
           source_logical_block_id, notes, record_status, created_at, superseded_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, NULL)`,
      )
      .run(
        context.idFactory(),
        valid.projectId,
        informationKey,
        valid.characterId,
        valid.knowledgeStatus,
        valid.validFromChapterId,
        valid.validUntilChapterId,
        valid.sourceVersionId,
        valid.sourceLogicalBlockId?.trim() ?? null,
        valid.notes.trim(),
        now,
      );
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}

export async function invalidateKnowledgeState(
  context: ContinuityContext,
  requestId: string,
  input: KnowledgeStateInvalidateInput,
): Promise<ContinuityCatalog> {
  const valid = KnowledgeStateInvalidateInputSchema.parse(input);
  authorOnly(valid.authority);
  const informationKey = normalizeContinuityKey(valid.informationKey);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    const result = connection
      .prepare(
        `UPDATE knowledge_states
            SET record_status = 'invalid', superseded_at = ?
          WHERE project_id = ? AND character_id = ? AND information_key = ?
            AND record_status = 'current'`,
      )
      .run(context.clock.now().toISOString(), valid.projectId, valid.characterId, informationKey);
    if (Number(result.changes) !== 1) {
      throw new ContinuityServiceError('CONTINUITY_NOT_FOUND', 'Current KnowledgeState not found.');
    }
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}
