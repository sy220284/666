import {
  StoryCommentAddInputSchema,
  StoryCommentResolveInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { ValidationServiceError } from '../validation.js';
import {
  validateValidationScopedIds,
  validationCatalog,
} from './validation-review-catalog.js';

export class ValidationCommentService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(
    workspace: ProjectWorkspaceService,
    clock: DatabaseClock,
    idFactory: () => string,
  ) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  add(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryCommentAddInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      validateValidationScopedIds(database, {
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
      return validationCatalog(database, input.projectId);
    });
  }

  resolve(requestId: string, raw: unknown): Promise<ValidationCatalog> {
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
      return validationCatalog(database, input.projectId);
    });
  }
}
