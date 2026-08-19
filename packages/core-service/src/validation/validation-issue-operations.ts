import {
  ValidationCreateTodoInputSchema,
  ValidationUpdateIssueInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { catalog, issueRows } from './validation-catalog.js';
import { ValidationServiceError } from './validation-model.js';

export class ValidationIssueOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  updateIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationUpdateIssueInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const row = database
        .prepare('SELECT severity FROM validation_issues WHERE id = ? AND project_id = ?')
        .get(input.issueId, input.projectId) as { readonly severity: string } | undefined;
      if (!row) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      const now = this.#clock.now().toISOString();
      if (input.action === 'downgrade') {
        const next = { high: 'medium', medium: 'low', low: 'info', info: 'info' }[row.severity];
        if (!next) {
          throw new ValidationServiceError(
            'VALIDATION_INVALID',
            'The persisted issue severity is invalid.',
          );
        }
        database
          .prepare(
            `UPDATE validation_issues SET severity = ?, status = 'open', updated_at = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(next, now, input.issueId, input.projectId);
      } else {
        const status = {
          resolve: 'resolved',
          ignore: 'ignored',
          mute: 'muted',
          false_positive: 'false_positive',
          reopen: 'open',
        }[input.action];
        database
          .prepare(
            'UPDATE validation_issues SET status = ?, updated_at = ? WHERE id = ? AND project_id = ?',
          )
          .run(status, now, input.issueId, input.projectId);
      }
      return catalog(database, input.projectId);
    });
  }

  createTodoFromIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationCreateTodoInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const issue = issueRows(database, input.projectId).find(
        (candidate) => candidate.issueId === input.issueId,
      );
      if (!issue) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Issue not found.');
      const existing = database
        .prepare(
          `SELECT id FROM story_todos
            WHERE project_id = ? AND validation_issue_id = ? AND status = 'open'
            ORDER BY created_at ASC, id ASC
            LIMIT 1`,
        )
        .get(input.projectId, issue.issueId);
      if (existing) return catalog(database, input.projectId);
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
      return catalog(database, input.projectId);
    });
  }
}
