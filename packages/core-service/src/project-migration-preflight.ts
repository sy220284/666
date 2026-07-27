import type { DatabaseSync } from 'node:sqlite';

interface AnchorViolation {
  readonly recordType: 'story_todo' | 'story_comment';
  readonly recordId: string;
  readonly code: string;
}

function firstViolation(
  database: DatabaseSync,
  recordType: AnchorViolation['recordType'],
  code: string,
  sql: string,
): AnchorViolation | null {
  const row = database.prepare(sql).get() as { readonly id?: unknown } | undefined;
  if (!row?.id) return null;
  return { recordType, recordId: String(row.id), code };
}

/**
 * Validates schema 27 StoryTodo/StoryComment anchors before migration 28 is
 * allowed to change the database. Migration 28 adds compound anchor triggers,
 * but triggers protect only future writes. Historical invalid rows therefore
 * stop the upgrade while the original schema and data remain unchanged.
 */
export function validateSchema28ProjectAnchors(database: DatabaseSync): void {
  const violations: readonly (AnchorViolation | null)[] = [
    firstViolation(
      database,
      'story_todo',
      'STORY_TODO_BEAT_CHAPTER_SCOPE_INVALID',
      `SELECT todo.id
         FROM story_todos todo
        WHERE todo.scene_beat_id IS NOT NULL
          AND (
            todo.chapter_id IS NULL
            OR NOT EXISTS (
              SELECT 1
                FROM scene_beats beat
               WHERE beat.id = todo.scene_beat_id
                 AND beat.project_id = todo.project_id
                 AND beat.chapter_id = todo.chapter_id
            )
          )
        ORDER BY todo.id
        LIMIT 1`,
    ),
    firstViolation(
      database,
      'story_todo',
      'STORY_TODO_BLOCK_CHAPTER_SCOPE_INVALID',
      `SELECT todo.id
         FROM story_todos todo
        WHERE todo.logical_block_id IS NOT NULL
          AND (
            todo.chapter_id IS NULL
            OR NOT (
              EXISTS (
                SELECT 1
                  FROM chapters chapter
                  JOIN volumes volume ON volume.id = chapter.volume_id
                  JOIN drafts draft ON draft.id = chapter.active_draft_id
                  JOIN draft_blocks block ON block.draft_id = draft.id
                 WHERE chapter.id = todo.chapter_id
                   AND volume.project_id = todo.project_id
                   AND block.logical_block_id = todo.logical_block_id
              )
              OR (
                todo.validation_issue_id IS NOT NULL
                AND EXISTS (
                  SELECT 1
                    FROM validation_issues issue
                   WHERE issue.id = todo.validation_issue_id
                     AND issue.project_id = todo.project_id
                     AND issue.chapter_id IS todo.chapter_id
                     AND issue.logical_block_id IS todo.logical_block_id
                )
              )
            )
          )
        ORDER BY todo.id
        LIMIT 1`,
    ),
    firstViolation(
      database,
      'story_todo',
      'STORY_TODO_ISSUE_ANCHOR_SCOPE_INVALID',
      `SELECT todo.id
         FROM story_todos todo
        WHERE todo.validation_issue_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM validation_issues issue
             WHERE issue.id = todo.validation_issue_id
               AND issue.project_id = todo.project_id
               AND (todo.chapter_id IS NULL OR issue.chapter_id IS todo.chapter_id)
               AND (todo.logical_block_id IS NULL OR issue.logical_block_id IS todo.logical_block_id)
          )
        ORDER BY todo.id
        LIMIT 1`,
    ),
    firstViolation(
      database,
      'story_comment',
      'STORY_COMMENT_VERSION_CHAPTER_SCOPE_INVALID',
      `SELECT comment.id
         FROM story_comments comment
        WHERE comment.source_version_id IS NOT NULL
          AND (
            comment.chapter_id IS NULL
            OR NOT EXISTS (
              SELECT 1
                FROM versions version
                JOIN chapters chapter ON chapter.id = version.chapter_id
                JOIN volumes volume ON volume.id = chapter.volume_id
               WHERE version.id = comment.source_version_id
                 AND chapter.id = comment.chapter_id
                 AND volume.project_id = comment.project_id
            )
          )
        ORDER BY comment.id
        LIMIT 1`,
    ),
    firstViolation(
      database,
      'story_comment',
      'STORY_COMMENT_BLOCK_SOURCE_SCOPE_INVALID',
      `SELECT comment.id
         FROM story_comments comment
        WHERE comment.logical_block_id IS NOT NULL
          AND NOT (
            (
              comment.source_version_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM version_blocks block
                 WHERE block.version_id = comment.source_version_id
                   AND block.logical_block_id = comment.logical_block_id
              )
            )
            OR (
              comment.source_version_id IS NULL
              AND comment.chapter_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM chapters chapter
                  JOIN volumes volume ON volume.id = chapter.volume_id
                  JOIN drafts draft ON draft.id = chapter.active_draft_id
                  JOIN draft_blocks block ON block.draft_id = draft.id
                 WHERE chapter.id = comment.chapter_id
                   AND volume.project_id = comment.project_id
                   AND block.logical_block_id = comment.logical_block_id
              )
            )
            OR (
              comment.source_version_id IS NULL
              AND comment.validation_issue_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM validation_issues issue
                 WHERE issue.id = comment.validation_issue_id
                   AND issue.project_id = comment.project_id
                   AND (comment.chapter_id IS NULL OR issue.chapter_id IS comment.chapter_id)
                   AND issue.logical_block_id IS comment.logical_block_id
              )
            )
          )
        ORDER BY comment.id
        LIMIT 1`,
    ),
    firstViolation(
      database,
      'story_comment',
      'STORY_COMMENT_ISSUE_ANCHOR_SCOPE_INVALID',
      `SELECT comment.id
         FROM story_comments comment
        WHERE comment.validation_issue_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
              FROM validation_issues issue
             WHERE issue.id = comment.validation_issue_id
               AND issue.project_id = comment.project_id
               AND (comment.chapter_id IS NULL OR issue.chapter_id IS comment.chapter_id)
               AND (
                 comment.source_version_id IS NULL
                 OR issue.source_version_id IS comment.source_version_id
               )
               AND (
                 comment.logical_block_id IS NULL
                 OR issue.logical_block_id IS comment.logical_block_id
               )
          )
        ORDER BY comment.id
        LIMIT 1`,
    ),
  ];

  const violation = violations.find((candidate): candidate is AnchorViolation => candidate !== null);
  if (!violation) return;

  throw new Error(
    `PROJECT_SCHEMA_28_PREFLIGHT_FAILED:${violation.code}:${violation.recordType}:${violation.recordId}`,
  );
}
