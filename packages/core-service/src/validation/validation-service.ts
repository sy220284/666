import { randomUUID } from 'node:crypto';

import {
  ValidationCatalogSchema,
  ValidationListInputSchema,
  type ValidationCatalog,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { catalog } from './validation-catalog.js';
import { ValidationCommentOperations } from './validation-comment-operations.js';
import { ValidationExceptionOperations } from './validation-exception-operations.js';
import { ValidationIssueOperations } from './validation-issue-operations.js';
import {
  systemClock,
  type ValidationAiCompletionInput,
  type ValidationServiceOptions,
} from './validation-model.js';
import { ValidationRuleOperations } from './validation-rule-operations.js';
import { ValidationTodoOperations } from './validation-todo-operations.js';

export class ValidationService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #rules: ValidationRuleOperations;
  readonly #issues: ValidationIssueOperations;
  readonly #todos: ValidationTodoOperations;
  readonly #comments: ValidationCommentOperations;
  readonly #exceptions: ValidationExceptionOperations;

  constructor(workspace: ProjectWorkspaceService, options: ValidationServiceOptions = {}) {
    const clock: DatabaseClock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    this.#workspace = workspace;
    this.#rules = new ValidationRuleOperations(workspace, clock, idFactory);
    this.#issues = new ValidationIssueOperations(workspace, clock, idFactory);
    this.#todos = new ValidationTodoOperations(workspace, clock, idFactory);
    this.#comments = new ValidationCommentOperations(workspace, clock, idFactory);
    this.#exceptions = new ValidationExceptionOperations(workspace, clock, idFactory);
  }

  list(raw: unknown): ValidationCatalog {
    const input = ValidationListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const value = catalog(database, input.projectId);
      return ValidationCatalogSchema.parse({
        ...value,
        issues: value.issues.filter(
          (issue) =>
            (!input.chapterId || issue.anchor.chapterId === input.chapterId) &&
            (input.includeClosed || issue.status === 'open'),
        ),
        todos: value.todos.filter(
          (todo) =>
            (!input.chapterId || todo.chapterId === input.chapterId) &&
            (input.includeClosed || todo.status === 'open'),
        ),
        comments: value.comments.filter(
          (comment) =>
            (!input.chapterId || comment.chapterId === input.chapterId) &&
            (input.includeClosed || comment.status === 'open'),
        ),
      });
    });
  }

  runRules(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#rules.runRules(requestId, raw);
  }

  completeAiBatch(
    requestId: string,
    raw: ValidationAiCompletionInput,
  ): Promise<{ readonly batchId: string; readonly catalog: ValidationCatalog }> {
    return this.#rules.completeAiBatch(requestId, raw);
  }

  updateIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#issues.updateIssue(requestId, raw);
  }

  createTodoFromIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#issues.createTodoFromIssue(requestId, raw);
  }

  saveTodo(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#todos.saveTodo(requestId, raw);
  }

  addComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#comments.addComment(requestId, raw);
  }

  resolveComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#comments.resolveComment(requestId, raw);
  }

  rememberException(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#exceptions.remember(requestId, raw);
  }

  disableException(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#exceptions.disable(requestId, raw);
  }
}
