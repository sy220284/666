import { randomUUID } from 'node:crypto';

import {
  ProjectIdSchema,
  RequestIdSchema,
  type ProjectCreateInput,
  type ProjectWorkspaceSummary,
} from '@worldforge/contracts';

import {
  BoundedIdempotentPromiseCache,
  IdempotentRequestConflictError,
} from '../bounded-idempotent-promise-cache.js';
import {
  DatabaseFoundationError,
  type DatabaseClock,
  type DatabaseReadOperation,
  type DatabaseWriteOperation,
} from '../database/index.js';
import type { RecentProjectsRepository } from '../recent-projects.js';
import { stableJson } from '../stable-json.js';
import { createProjectWorkspace } from './project-create.js';
import {
  defaultCopyWorkspace,
  defaultFreeBytes,
  defaultHashWorkspace,
  moveProjectWorkspace,
} from './project-move.js';
import {
  openProjectWorkspace,
  registerRecoveredProjectWorkspace,
  type ProjectOpenInput,
} from './project-open.js';
import {
  ProjectWorkspaceError,
  resolveWorkspacePath,
  type ProjectWorkspaceErrorCode,
} from './workspace-path-policy.js';
import {
  closeProjectContext,
  type ActiveProjectContext,
  type ProjectWorkspaceOperationContext,
} from './workspace-verifier.js';

const systemClock: DatabaseClock = { now: () => new Date() };

function requestFingerprint(scope: string, input: unknown): string {
  return stableJson({ scope, input });
}

export type { ProjectWorkspaceErrorCode };
export { ProjectWorkspaceError };

export interface ProjectWorkspaceServiceOptions {
  readonly projectMigrationsDirectory: string;
  readonly projectMigrationRecoveryDirectory: string;
  readonly appVersion: string;
  readonly recentProjects: RecentProjectsRepository;
  readonly clock?: DatabaseClock;
  readonly copyWorkspace?: (source: string, target: string) => Promise<void>;
  readonly hashWorkspace?: (workspacePath: string) => Promise<string>;
  readonly freeBytes?: (directory: string) => Promise<bigint>;
  readonly idFactory?: () => string;
}

export class ProjectWorkspaceService {
  readonly #migrationsDirectory: string;
  readonly #appVersion: string;
  readonly #projectMigrationRecoveryDirectory: string;
  readonly #recentProjects: RecentProjectsRepository;
  readonly #clock: DatabaseClock;
  readonly #copyWorkspace: (source: string, target: string) => Promise<void>;
  readonly #hashWorkspace: (workspacePath: string) => Promise<string>;
  readonly #freeBytes: (directory: string) => Promise<bigint>;
  readonly #idFactory: () => string;
  readonly #operations = new BoundedIdempotentPromiseCache();
  #lifecycleTail: Promise<void> = Promise.resolve();
  #active: ActiveProjectContext | null = null;

  constructor(options: ProjectWorkspaceServiceOptions) {
    this.#migrationsDirectory = options.projectMigrationsDirectory;
    this.#appVersion = options.appVersion;
    this.#projectMigrationRecoveryDirectory = options.projectMigrationRecoveryDirectory;
    this.#recentProjects = options.recentProjects;
    this.#clock = options.clock ?? systemClock;
    this.#copyWorkspace = options.copyWorkspace ?? defaultCopyWorkspace;
    this.#hashWorkspace = options.hashWorkspace ?? defaultHashWorkspace;
    this.#freeBytes = options.freeBytes ?? defaultFreeBytes;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  get activeProject(): ProjectWorkspaceSummary | null {
    return this.#active?.summary ?? null;
  }

  create(
    requestId: string,
    input: ProjectCreateInput,
    parentDirectory: string,
  ): Promise<ProjectWorkspaceSummary> {
    return this.#idempotent(
      requestId,
      requestFingerprint('project.create', { input, parentDirectory }),
      () => createProjectWorkspace(this.#operationContext(), requestId, input, parentDirectory),
    );
  }

  open(requestId: string, input: ProjectOpenInput): Promise<ProjectWorkspaceSummary> {
    return this.#idempotent(requestId, requestFingerprint('project.open', input), () =>
      openProjectWorkspace(this.#operationContext(), requestId, input),
    );
  }

  close(requestId: string, projectId: string): Promise<{ projectId: string; closed: true }> {
    return this.#idempotent(
      requestId,
      requestFingerprint('project.close', { projectId }),
      async () => {
        const context = this.#assertActiveContext(projectId);
        try {
          await closeProjectContext(context);
        } finally {
          if (this.#active === context) this.#active = null;
        }
        return { projectId: context.summary.projectId, closed: true };
      },
    );
  }

  move(
    requestId: string,
    projectId: string,
    targetParentDirectory: string,
  ): Promise<ProjectWorkspaceSummary & { readonly sourceRetained: boolean }> {
    return this.#idempotent(
      requestId,
      requestFingerprint('project.move', { projectId, targetParentDirectory }),
      () =>
        moveProjectWorkspace(this.#operationContext(), requestId, projectId, targetParentDirectory),
    );
  }

  registerRecoveredWorkspace(
    requestId: string,
    workspacePath: string,
  ): Promise<ProjectWorkspaceSummary> {
    return this.#idempotent(
      requestId,
      requestFingerprint('project.register-recovered', { workspacePath }),
      () => registerRecoveredProjectWorkspace(this.#operationContext(), requestId, workspacePath),
    );
  }

  assertActiveProject(projectId: string, requireWrite = false): ProjectWorkspaceSummary {
    return this.#assertActiveContext(projectId, requireWrite).summary;
  }

  readProject<T>(projectId: string, operation: DatabaseReadOperation<T>): T {
    const context = this.#assertActiveContext(projectId);
    if (!context.database) {
      throw new ProjectWorkspaceError(
        'PROJECT_READ_ONLY',
        'The project database is unreadable; only external recovery points are available.',
      );
    }
    return context.database.read(operation);
  }

  async writeProject<T>(
    requestId: string,
    projectId: string,
    operation: DatabaseWriteOperation<T>,
    commandIdentity?: unknown,
  ): Promise<T> {
    const context = this.#assertActiveContext(projectId, true);
    if (!context.database) {
      throw new ProjectWorkspaceError(
        'PROJECT_READ_ONLY',
        'The project database is unreadable; write operations are disabled.',
      );
    }
    const fingerprint =
      commandIdentity === undefined
        ? undefined
        : requestFingerprint('project.write', { projectId, commandIdentity });
    try {
      return (await context.database.write(requestId, operation, fingerprint)).value;
    } catch (error) {
      if (error instanceof DatabaseFoundationError && error.code === 'REQUEST_ID_CONFLICT') {
        throw new ProjectWorkspaceError(
          'PROJECT_TARGET_CONFLICT',
          'The requestId was already used for a different project command.',
          { cause: error },
        );
      }
      throw error;
    }
  }

  async resolveProjectPath(projectId: string, relativePath: string): Promise<string> {
    const context = this.#assertActiveContext(projectId);
    return resolveWorkspacePath(context.summary.workspacePath, relativePath);
  }

  async shutdown(): Promise<void> {
    await this.#lifecycleTail;
    const context = this.#active;
    if (!context) return;
    try {
      await closeProjectContext(context);
    } finally {
      if (this.#active === context) this.#active = null;
    }
  }

  async #registerRecentBestEffort(
    requestId: string,
    summary: ProjectWorkspaceSummary,
  ): Promise<boolean> {
    try {
      await this.#recentProjects.register(requestId, {
        projectId: summary.projectId,
        workspacePath: summary.workspacePath,
        displayName: summary.name,
      });
      return true;
    } catch {
      return false;
    }
  }

  #assertNoActive(): void {
    if (this.#active) {
      throw new ProjectWorkspaceError(
        'PROJECT_ALREADY_ACTIVE',
        'Close the active project before opening another project.',
      );
    }
  }

  #assertActiveContext(projectId: string, requireWrite = false): ActiveProjectContext {
    const validProjectId = ProjectIdSchema.parse(projectId);
    const context = this.#active;
    if (!context || context.summary.projectId !== validProjectId) {
      throw new ProjectWorkspaceError(
        'PROJECT_ID_MISMATCH',
        'The command does not belong to the active project.',
      );
    }
    if (requireWrite && context.summary.databaseMode !== 'read-write') {
      throw new ProjectWorkspaceError(
        'PROJECT_READ_ONLY',
        'The active project is open in read-only compatibility mode.',
      );
    }
    return context;
  }

  #operationContext(): ProjectWorkspaceOperationContext {
    const getActive = (): ActiveProjectContext | null => this.#active;
    const setActive = (value: ActiveProjectContext | null): void => {
      this.#active = value;
    };
    const assertNoActive = (): void => this.#assertNoActive();
    const assertActiveContext = (projectId: string, requireWrite = false): ActiveProjectContext =>
      this.#assertActiveContext(projectId, requireWrite);
    const registerRecentBestEffort = (
      requestId: string,
      summary: ProjectWorkspaceSummary,
    ): Promise<boolean> => this.#registerRecentBestEffort(requestId, summary);

    return {
      migrationsDirectory: this.#migrationsDirectory,
      appVersion: this.#appVersion,
      projectMigrationRecoveryDirectory: this.#projectMigrationRecoveryDirectory,
      recentProjects: this.#recentProjects,
      clock: this.#clock,
      copyWorkspace: this.#copyWorkspace,
      hashWorkspace: this.#hashWorkspace,
      freeBytes: this.#freeBytes,
      idFactory: this.#idFactory,
      get active() {
        return getActive();
      },
      set active(value) {
        setActive(value);
      },
      assertNoActive,
      assertActiveContext,
      registerRecentBestEffort,
    };
  }

  #idempotent<T>(requestId: string, fingerprint: string, operation: () => Promise<T>): Promise<T> {
    const validRequestId = RequestIdSchema.parse(requestId);
    try {
      const existing = this.#operations.get<T>(validRequestId, fingerprint);
      if (existing) return existing;
    } catch (error) {
      if (error instanceof IdempotentRequestConflictError) {
        throw new ProjectWorkspaceError(
          'PROJECT_TARGET_CONFLICT',
          'The requestId was already used for a different project lifecycle command.',
          { cause: error },
        );
      }
      throw error;
    }
    const result = this.#lifecycleTail.then(operation);
    this.#lifecycleTail = result.then(
      () => undefined,
      () => undefined,
    );
    return this.#operations.remember(validRequestId, fingerprint, result);
  }
}
