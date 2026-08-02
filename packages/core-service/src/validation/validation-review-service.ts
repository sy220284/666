import { randomUUID } from 'node:crypto';

import type { ValidationCatalog } from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { ValidationService, type ValidationServiceOptions } from '../validation.js';
import { ValidationCommentService } from './validation-comment-service.js';
import { ValidationIssueService } from './validation-issue-service.js';
import { ValidationTodoService } from './validation-todo-service.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export class ValidationReviewService extends ValidationService {
  readonly #issues: ValidationIssueService;
  readonly #todos: ValidationTodoService;
  readonly #comments: ValidationCommentService;

  constructor(workspace: ProjectWorkspaceService, options: ValidationServiceOptions = {}) {
    const clock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    super(workspace, { clock, idFactory });
    this.#issues = new ValidationIssueService(workspace, clock);
    this.#todos = new ValidationTodoService(workspace, clock, idFactory);
    this.#comments = new ValidationCommentService(workspace, clock, idFactory);
  }

  override updateIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#issues.update(requestId, raw);
  }

  override createTodoFromIssue(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#todos.createFromIssue(requestId, raw);
  }

  override saveTodo(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#todos.save(requestId, raw);
  }

  override addComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#comments.add(requestId, raw);
  }

  override resolveComment(requestId: string, raw: unknown): Promise<ValidationCatalog> {
    return this.#comments.resolve(requestId, raw);
  }
}
