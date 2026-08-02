import {
  ValidationUpdateIssueInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { ValidationServiceError } from '../validation.js';
import { validationCatalog } from './validation-review-catalog.js';

export class ValidationIssueService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock) {
    this.#workspace = workspace;
    this.#clock = clock;
  }

  update(requestId: string, raw: unknown): Promise<ValidationCatalog> {
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
      return validationCatalog(database, input.projectId);
    });
  }
}
