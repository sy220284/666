import {
  StoryTodoSaveInputSchema,
  ValidationCreateTodoInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { ValidationServiceError } from '../validation.js';
import {
  validateValidationScopedIds,
  validationCatalog,
  validationIssueRows,
} from './validation-review-catalog.js';

export class ValidationTodoService {
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

  createFromIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationCreateTodoInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const issue = validationIssueRows(database, input.projectId).find(
        (candidate) => candidate.issueId === input.issueId,
      );
      if (!issue) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO story_todos(
             id, project_id, chapter_id, scene_beat_id, logical_block_id,
             validation_issue_id, title, status, created_at, updated_at, completed_at
           ) VALUES(?, ?, ?, NULL, ?, ?, ?, 'open', ?, ?, NULL)`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          issue.chapterId,
          issue.logicalBlockId,
          issue.issueId,
          input.title ?? issue.suggestion ?? issue.rationale.slice(0, 240),
          now,
          now,
        );
      return validationCatalog(database, input.projectId);
    });
  }

  save(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = StoryTodoSaveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      validateValidationScopedIds(database, input);
      const now = this.#clock.now().toISOString();
      const todoId = input.todoId ?? this.#idFactory();
      if (input.todoId) {
        const updated = database
          .prepare(
            `UPDATE story_todos
                SET chapter_id = ?, scene_beat_id = ?, logical_block_id = ?,
                    title = ?, status = ?, updated_at = ?, completed_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(
            input.chapterId,
            input.sceneBeatId,
            input.logicalBlockId,
            input.title,
            input.status,
            now,
            input.status === 'done' ? now : null,
            todoId,
            input.projectId,
          );
        if (Number(updated.changes) !== 1) {
          throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Todo not found.');
        }
      } else {
        database
          .prepare(
            `INSERT INTO story_todos(
               id, project_id, chapter_id, scene_beat_id, logical_block_id,
               validation_issue_id, title, status, created_at, updated_at, completed_at
             ) VALUES(?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
          )
          .run(
            todoId,
            input.projectId,
            input.chapterId,
            input.sceneBeatId,
            input.logicalBlockId,
            input.title,
            input.status,
            now,
            now,
            input.status === 'done' ? now : null,
          );
      }
      return validationCatalog(database, input.projectId);
    });
  }
}
