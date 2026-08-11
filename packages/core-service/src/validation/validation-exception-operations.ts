import type { DatabaseSync } from 'node:sqlite';

import {
  ValidationExceptionDisableInputSchema,
  ValidationExceptionRememberInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { validateChapterRange } from '../continuity-validation.js';
import { catalog } from './validation-catalog.js';
import { ValidationServiceError } from './validation-model.js';

interface IssueScopeRow {
  readonly issueType: string;
  readonly ruleId: string | null;
  readonly chapterId: string;
}

export class ValidationExceptionOperations {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, clock: DatabaseClock, idFactory: () => string) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
  }

  remember(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationExceptionRememberInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const issue = database
        .prepare(
          `SELECT issue_type AS issueType, rule_id AS ruleId, chapter_id AS chapterId
             FROM validation_issues WHERE id = ? AND project_id = ?`,
        )
        .get(input.issueId, input.projectId) as IssueScopeRow | undefined;
      if (!issue?.chapterId) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'The ValidationIssue for this exception was not found in the project.',
        );
      }

      const scope = exceptionScope(database, input, issue);
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO validation_exceptions(
             id, project_id, exception_type, scope_type, issue_type,
             validation_issue_id, chapter_id, entity_id,
             valid_from_chapter_id, valid_until_chapter_id, project_rule_key,
             notes, active, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          input.exceptionType,
          input.scopeType,
          issue.issueType,
          scope.validationIssueId,
          scope.chapterId,
          scope.entityId,
          scope.validFromChapterId,
          scope.validUntilChapterId,
          scope.projectRuleKey,
          input.notes,
          now,
          now,
        );
      database
        .prepare(
          `UPDATE validation_issues SET status = 'ignored', updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(now, input.issueId, input.projectId);
      return catalog(database, input.projectId);
    });
  }

  disable(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    const input = ValidationExceptionDisableInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const result = database
        .prepare(
          `UPDATE validation_exceptions SET active = 0, updated_at = ?
            WHERE id = ? AND project_id = ? AND active = 1`,
        )
        .run(this.#clock.now().toISOString(), input.exceptionId, input.projectId);
      if (Number(result.changes) !== 1) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'The active ValidationException was not found in the project.',
        );
      }
      return catalog(database, input.projectId);
    });
  }
}

function exceptionScope(
  database: DatabaseSync,
  input: ReturnType<typeof ValidationExceptionRememberInputSchema.parse>,
  issue: IssueScopeRow,
): {
  readonly validationIssueId: string | null;
  readonly chapterId: string | null;
  readonly entityId: string | null;
  readonly validFromChapterId: string | null;
  readonly validUntilChapterId: string | null;
  readonly projectRuleKey: string | null;
} {
  const empty = {
    validationIssueId: null,
    chapterId: null,
    entityId: null,
    validFromChapterId: null,
    validUntilChapterId: null,
    projectRuleKey: null,
  };
  switch (input.scopeType) {
    case 'issue':
      return { ...empty, validationIssueId: input.issueId, chapterId: issue.chapterId };
    case 'chapter':
      return { ...empty, chapterId: issue.chapterId };
    case 'entity': {
      if (!input.entityId) {
        throw new ValidationServiceError(
          'VALIDATION_INVALID',
          'An entity-scoped exception requires an Entity.',
        );
      }
      const entity = database
        .prepare(`SELECT 1 FROM entities WHERE id = ? AND project_id = ? AND status = 'active'`)
        .get(input.entityId, input.projectId);
      if (!entity) {
        throw new ValidationServiceError(
          'VALIDATION_NOT_FOUND',
          'The exception Entity was not found in the project.',
        );
      }
      return { ...empty, entityId: input.entityId };
    }
    case 'chapter_range':
      if (!input.validFromChapterId) {
        throw new ValidationServiceError(
          'VALIDATION_INVALID',
          'A chapter-range exception requires its first chapter.',
        );
      }
      validateChapterRange(
        database,
        input.projectId,
        input.validFromChapterId,
        input.validUntilChapterId,
      );
      return {
        ...empty,
        validFromChapterId: input.validFromChapterId,
        validUntilChapterId: input.validUntilChapterId,
      };
    case 'project_rule':
      return { ...empty, projectRuleKey: input.projectRuleKey ?? issue.ruleId ?? issue.issueType };
  }
}
