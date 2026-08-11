import type { DatabaseSync } from 'node:sqlite';

import {
  CharacterRelationshipInvalidateInputSchema,
  CharacterRelationshipSetInputSchema,
  type CharacterRelationshipInvalidateInput,
  type CharacterRelationshipSetInput,
  type ContinuityCatalog,
} from '@worldforge/contracts';
import { compareChapterPosition, normalizeCharacterRelationshipLabel } from '@worldforge/domain';

import { ContinuityServiceError, authorOnly, type ContinuityContext } from './continuity-model.js';
import { readCatalog } from './continuity-read.js';
import {
  assertEntity,
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

interface CurrentRelationshipRow {
  readonly id: string;
  readonly validFromChapterId: string;
  readonly validUntilChapterId: string | null;
}

function replacementEndChapterId(
  connection: DatabaseSync,
  projectId: string,
  currentEndChapterId: string | null,
  nextStartChapterId: string,
): string {
  if (!currentEndChapterId) return nextStartChapterId;
  return compareChapterPosition(
    chapterPosition(connection, projectId, currentEndChapterId),
    chapterPosition(connection, projectId, nextStartChapterId),
  ) > 0
    ? nextStartChapterId
    : currentEndChapterId;
}

export function applyCharacterRelationshipInTransaction(
  connection: DatabaseSync,
  input: CharacterRelationshipSetInput,
  now: string,
  idFactory: () => string,
): string {
  const valid = CharacterRelationshipSetInputSchema.parse(input);
  const label = normalizeCharacterRelationshipLabel(valid.label);
  assertEntity(connection, valid.projectId, valid.fromCharacterId, 'character');
  assertEntity(connection, valid.projectId, valid.toCharacterId, 'character');
  validateChapterRange(
    connection,
    valid.projectId,
    valid.validFromChapterId,
    valid.validUntilChapterId,
  );
  assertVersion(connection, valid.projectId, valid.sourceVersionId);
  validateEvidence(connection, valid.projectId, valid.evidence);
  const current = connection
    .prepare(
      `SELECT id, valid_from_chapter_id AS validFromChapterId,
              valid_until_chapter_id AS validUntilChapterId
         FROM character_relationships
        WHERE project_id = ? AND from_character_id = ? AND to_character_id = ?
          AND category = ? AND label = ? AND record_status = 'current'`,
    )
    .get(valid.projectId, valid.fromCharacterId, valid.toCharacterId, valid.category, label) as
    CurrentRelationshipRow | undefined;
  if (current) {
    const ordering = compareChapterPosition(
      chapterPosition(connection, valid.projectId, current.validFromChapterId),
      chapterPosition(connection, valid.projectId, valid.validFromChapterId),
    );
    if (ordering > 0) {
      throw new ContinuityServiceError(
        'CONTINUITY_CONFLICT',
        'Historical CharacterRelationship backfill requires an explicit migration workflow.',
      );
    }
    connection
      .prepare(
        `UPDATE character_relationships
            SET record_status = 'historical', valid_until_chapter_id = ?, superseded_at = ?
          WHERE id = ?`,
      )
      .run(
        replacementEndChapterId(
          connection,
          valid.projectId,
          current.validUntilChapterId,
          valid.validFromChapterId,
        ),
        now,
        current.id,
      );
  }
  const relationshipId = idFactory();
  connection
    .prepare(
      `INSERT INTO character_relationships(
         id, project_id, from_character_id, to_character_id, category, label,
         valid_from_chapter_id, valid_until_chapter_id, record_status,
         source_version_id, evidence_json, created_at, superseded_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, NULL)`,
    )
    .run(
      relationshipId,
      valid.projectId,
      valid.fromCharacterId,
      valid.toCharacterId,
      valid.category,
      label,
      valid.validFromChapterId,
      valid.validUntilChapterId,
      valid.sourceVersionId,
      JSON.stringify(valid.evidence),
      now,
    );
  return relationshipId;
}

export function setCharacterRelationship(
  context: ContinuityContext,
  requestId: string,
  input: CharacterRelationshipSetInput,
): Promise<ContinuityCatalog> {
  const valid = CharacterRelationshipSetInputSchema.parse(input);
  authorOnly(valid.authority);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    applyCharacterRelationshipInTransaction(
      connection,
      valid,
      context.clock.now().toISOString(),
      context.idFactory,
    );
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}

export function invalidateCharacterRelationship(
  context: ContinuityContext,
  requestId: string,
  input: CharacterRelationshipInvalidateInput,
): Promise<ContinuityCatalog> {
  const valid = CharacterRelationshipInvalidateInputSchema.parse(input);
  authorOnly(valid.authority);
  return context.workspace.writeProject(requestId, valid.projectId, (connection) => {
    const now = context.clock.now().toISOString();
    const result = connection
      .prepare(
        `UPDATE character_relationships
            SET record_status = 'invalid', superseded_at = ?
          WHERE id = ? AND project_id = ? AND record_status = 'current'`,
      )
      .run(now, valid.relationshipId, valid.projectId);
    if (Number(result.changes) !== 1) {
      throw new ContinuityServiceError(
        'CONTINUITY_NOT_FOUND',
        'Current CharacterRelationship not found.',
      );
    }
    return readCatalog(connection, catalogInput(valid.projectId));
  });
}
