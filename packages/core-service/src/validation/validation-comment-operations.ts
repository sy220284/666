import {
  StoryCommentAddInputSchema,
  StoryCommentResolveInputSchema,
  StoryCommentReopenInputSchema,
  StoryCommentBatchInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { catalog } from './validation-catalog.js';
import { validateScopedIds, ValidationServiceError } from './validation-model.js';
import { addCommentTags } from './validation-comment-workflow.js';

export class ValidationCommentOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  addComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentAddInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      validateScopedIds(database, {
        projectId: input.projectId,
        chapterId: input.chapterId,
        sceneBeatId: null,
        logicalBlockId: input.logicalBlockId,
      });
      if (input.sourceVersionId) {
        const version = database
          .prepare(
            `SELECT 1 FROM versions version
             JOIN chapters chapter ON chapter.id = version.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE version.id = ? AND volume.project_id = ?`,
          )
          .get(input.sourceVersionId, input.projectId);
        if (!version) {
          throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Version not found.');
        }
      }
      if (
        input.issueId &&
        !database
          .prepare('SELECT 1 FROM validation_issues WHERE id = ? AND project_id = ?')
          .get(input.issueId, input.projectId)
      ) {
        throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      }
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO story_comments(
             id, project_id, chapter_id, source_version_id, logical_block_id,
             validation_issue_id, body, status, created_at, updated_at, resolved_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          input.chapterId,
          input.sourceVersionId,
          input.logicalBlockId,
          input.issueId,
          input.body,
          now,
          now,
        );
      return catalog(database, input.projectId);
    });
  }

  resolveComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentResolveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const now = this.#clock.now().toISOString();
      const updated = database
        .prepare(
          `UPDATE story_comments
              SET status = 'resolved', resolved_at = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND status = 'open'`,
        )
        .run(now, now, input.commentId, input.projectId);
      if (Number(updated.changes) !== 1) {
        throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Open comment not found.');
      }
      return catalog(database, input.projectId);
    });
  }

  reopenComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentReopenInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const now = this.#clock.now().toISOString();
      const updated = database
        .prepare(
          `UPDATE story_comments
              SET status = 'open', resolved_at = NULL, updated_at = ?
            WHERE id = ? AND project_id = ? AND status = 'resolved'`,
        )
        .run(now, input.commentId, input.projectId);
      if (Number(updated.changes) !== 1) {
        throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Resolved comment not found.');
      }
      return catalog(database, input.projectId);
    });
  }

  batchComments(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentBatchInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const placeholders = input.commentIds.map(() => '?').join(', ');
      const rows = database
        .prepare(
          `SELECT id, status FROM story_comments
            WHERE project_id = ? AND id IN (${placeholders})`,
        )
        .all(input.projectId, ...input.commentIds) as Array<{
        readonly id: string;
        readonly status: 'open' | 'resolved';
      }>;
      if (rows.length !== input.commentIds.length) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'One or more comments were not found.',
        );
      }
      if (input.action === 'resolve' && rows.some((row) => row.status !== 'open')) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'All comments must be open before resolving.',
        );
      }
      if (input.action === 'reopen' && rows.some((row) => row.status !== 'resolved')) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'All comments must be resolved before reopening.',
        );
      }
      const now = this.#clock.now().toISOString();
      if (input.action === 'tag') {
        addCommentTags(database, input.commentIds, input.tags, now);
      } else {
        const targetStatus = input.action === 'resolve' ? 'resolved' : 'open';
        const resolvedAt = input.action === 'resolve' ? now : null;
        for (const commentId of input.commentIds) {
          database
            .prepare(
              `UPDATE story_comments
                  SET status = ?, resolved_at = ?, updated_at = ?
                WHERE id = ? AND project_id = ?`,
            )
            .run(targetStatus, resolvedAt, now, commentId, input.projectId);
        }
      }
      return catalog(database, input.projectId);
    });
  }
}
