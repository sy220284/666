import { assertFinalVersion } from './ending-snapshot-service.js';
import { authorOnly } from './proposal-batch-repository.js';
import {
  type ChangeType,
  type InvalidationScope,
  type StateProposalServiceContext,
} from './state-row-mappers.js';
import {
  type DerivedInvalidationInput,
  DerivedInvalidationInputSchema,
  type DerivedInvalidationResult,
  DerivedInvalidationResultSchema,
} from '@worldforge/contracts';
import { type DatabaseSync } from 'node:sqlite';

export interface DerivedInvalidationRecordInput {
  readonly projectId: string;
  readonly sourceChapterId: string;
  readonly sourceVersionId: string;
  readonly changeTypes: readonly ChangeType[];
}

export function scopesFor(changeType: ChangeType): readonly InvalidationScope[] {
  if (changeType === 'entity_state') return ['continuity', 'validation', 'cache'];
  if (changeType === 'arc_milestone') return ['arc', 'validation', 'cache'];
  if (changeType === 'event' || changeType === 'timeline') {
    return ['timeline', 'validation', 'cache'];
  }
  if (changeType === 'foreshadowing') return ['foreshadowing', 'validation', 'cache'];
  return ['continuity', 'validation', 'cache'];
}

function laterChapterIds(
  connection: DatabaseSync,
  projectId: string,
  sourceChapterId: string,
): readonly string[] {
  const rows = connection
    .prepare(
      `SELECT target_chapter.id AS chapterId
         FROM chapters source_chapter
         JOIN volumes source_volume ON source_volume.id = source_chapter.volume_id
         JOIN volumes target_volume ON target_volume.project_id = source_volume.project_id
         JOIN chapters target_chapter ON target_chapter.volume_id = target_volume.id
        WHERE source_chapter.id = ?
          AND source_volume.project_id = ?
          AND source_chapter.deleted_at IS NULL
          AND source_volume.deleted_at IS NULL
          AND target_chapter.deleted_at IS NULL
          AND target_volume.deleted_at IS NULL
          AND (
            target_volume.order_key > source_volume.order_key
            OR (
              target_volume.order_key = source_volume.order_key
              AND target_chapter.order_key > source_chapter.order_key
            )
          )
        ORDER BY target_volume.order_key, target_chapter.order_key, target_chapter.id`,
    )
    .all(sourceChapterId, projectId) as unknown as Array<{ readonly chapterId: string }>;
  return rows.map((row) => row.chapterId);
}

export function recordDerivedInvalidation(
  connection: DatabaseSync,
  input: DerivedInvalidationRecordInput,
  now: string,
  idFactory: () => string,
): DerivedInvalidationResult {
  const semantic = [...new Set(input.changeTypes)] as ChangeType[];
  if (semantic.length === 0) {
    return DerivedInvalidationResultSchema.parse({
      invalidatedSnapshotIds: [],
      queuedScopes: [],
    });
  }

  const queuedScopes = [...new Set(semantic.flatMap(scopesFor))];
  const laterChapters = laterChapterIds(connection, input.projectId, input.sourceChapterId);
  const targetChapterIds: readonly (string | null)[] =
    laterChapters.length > 0 ? laterChapters : [null];

  for (const changeType of semantic) {
    for (const scope of scopesFor(changeType)) {
      for (const targetChapterId of targetChapterIds) {
        connection
          .prepare(
            `INSERT INTO derived_invalidations(
                 id, project_id, source_chapter_id, source_version_id,
                 target_chapter_id, scope, change_type, created_at
               ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            idFactory(),
            input.projectId,
            input.sourceChapterId,
            input.sourceVersionId,
            targetChapterId,
            scope,
            changeType,
            now,
          );
      }
    }
  }

  return DerivedInvalidationResultSchema.parse({
    // EndingSnapshot freshness is owned exclusively by the existing database triggers.
    // This ledger reports derived recomputation scopes and never mutates snapshot status.
    invalidatedSnapshotIds: [],
    queuedScopes,
  });
}

export function invalidateDerived(
  context: StateProposalServiceContext,
  requestId: string,
  raw: DerivedInvalidationInput,
): Promise<DerivedInvalidationResult> {
  const input = DerivedInvalidationInputSchema.parse(raw);
  authorOnly(input.authority);
  return context.workspace.writeProject(requestId, input.projectId, (connection) => {
    assertFinalVersion(connection, input.projectId, input.sourceChapterId, input.sourceVersionId);
    const semantic = [
      ...new Set(input.changeTypes.filter((type) => type !== 'prose')),
    ] as ChangeType[];
    return recordDerivedInvalidation(
      connection,
      {
        projectId: input.projectId,
        sourceChapterId: input.sourceChapterId,
        sourceVersionId: input.sourceVersionId,
        changeTypes: semantic,
      },
      context.clock.now().toISOString(),
      context.idFactory,
    );
  });
}
