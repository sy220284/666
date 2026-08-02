import { chapterPosition } from '../continuity-validation.js';
import { assertFinalVersion } from './ending-snapshot-service.js';
import { authorOnly } from './proposal-batch-repository.js';
import {
  type ChangeType,
  type InvalidationScope,
  mapSnapshot,
  type SnapshotRow,
  type StateProposalServiceContext,
} from './state-row-mappers.js';
import {
  type DerivedInvalidationInput,
  DerivedInvalidationInputSchema,
  type DerivedInvalidationResult,
  DerivedInvalidationResultSchema,
} from '@worldforge/contracts';
import { compareChapterPosition } from '@worldforge/domain';

export function scopesFor(changeType: ChangeType): readonly InvalidationScope[] {
  if (changeType === 'entity_state') return ['continuity', 'validation', 'cache'];
  if (changeType === 'arc_milestone') return ['arc', 'validation', 'cache'];
  if (changeType === 'timeline') return ['timeline', 'validation', 'cache'];
  if (changeType === 'foreshadowing') return ['foreshadowing', 'validation', 'cache'];
  return ['continuity', 'validation', 'cache'];
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
    if (semantic.length === 0) {
      return DerivedInvalidationResultSchema.parse({
        invalidatedSnapshotIds: [],
        queuedScopes: [],
      });
    }
    const sourcePosition = chapterPosition(connection, input.projectId, input.sourceChapterId);
    const rows = connection
      .prepare(
        `SELECT id, project_id AS projectId, chapter_id AS chapterId,
                  source_version_id AS sourceVersionId, status,
                  content_json AS contentJson,
                  stale_reasons_json AS staleReasonsJson,
                  created_at AS createdAt, stale_at AS staleAt
             FROM ending_snapshots
            WHERE project_id = ? AND status = 'valid'`,
      )
      .all(input.projectId) as unknown as SnapshotRow[];
    const targets = rows.filter(
      (row) =>
        compareChapterPosition(
          chapterPosition(connection, input.projectId, row.chapterId),
          sourcePosition,
        ) > 0,
    );
    const now = context.clock.now().toISOString();
    for (const row of targets) {
      const reasons = [...new Set([...mapSnapshot(row).staleReasons, ...semantic])];
      connection
        .prepare(
          `UPDATE ending_snapshots
                SET status = 'stale', stale_at = ?, stale_reasons_json = ?
              WHERE id = ? AND project_id = ? AND status = 'valid'`,
        )
        .run(now, JSON.stringify(reasons), row.id, input.projectId);
    }
    const queuedScopes = [...new Set(semantic.flatMap(scopesFor))];
    const targetChapterIds =
      targets.length > 0 ? targets.map((target) => target.chapterId) : [null];
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
              context.idFactory(),
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
      invalidatedSnapshotIds: targets.map((target) => target.id),
      queuedScopes,
    });
  });
}
