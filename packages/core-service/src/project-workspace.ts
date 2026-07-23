import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  chmod,
  constants,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  ProjectCreateInputSchema,
  ProjectIdSchema,
  ProjectWorkspaceManifestSchema,
  RequestIdSchema,
  type ProjectCreateInput,
  type ProjectWorkspaceManifest,
  type ProjectWorkspaceSummary,
} from '@worldforge/contracts';

import { BoundedIdempotentPromiseCache } from './bounded-idempotent-promise-cache.js';
import {
  ProjectDatabase,
  latestMigrationVersion,
  loadMigrations,
  type DatabaseClock,
} from './database/index.js';
import type { DatabaseReadOperation, DatabaseWriteOperation } from './database/index.js';
import { createSqliteMigrationRecoveryPoint } from './migration-recovery.js';
import { initializeProjectStructure } from './project-structure.js';
import type { RecentProjectsRepository } from './recent-projects.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type ProjectWorkspaceErrorCode =
  | 'PROJECT_ALREADY_ACTIVE'
  | 'PROJECT_ID_MISMATCH'
  | 'PROJECT_PATH_OUTSIDE_SCOPE'
  | 'PROJECT_PATH_MISSING'
  | 'PROJECT_MOVE_FAILED'
  | 'PROJECT_TARGET_CONFLICT'
  | 'PROJECT_READ_ONLY'
  | 'PROJECT_DIRECTORY_READ_ONLY'
  | 'PROJECT_OPEN_FAILED'
  | 'PROJECT_CREATE_FAILED'
  | 'PROJECT_MANIFEST_INVALID';

export class ProjectWorkspaceError extends Error {
  readonly code: ProjectWorkspaceErrorCode;

  constructor(code: ProjectWorkspaceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ProjectWorkspaceError';
    this.code = code;
  }
}

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

interface ActiveProjectContext {
  readonly database: ProjectDatabase | null;
  readonly manifest: ProjectWorkspaceManifest;
  readonly summary: ProjectWorkspaceSummary;
}

interface ProjectRow {
  readonly id: string;
  readonly name: string;
  readonly channel: string;
  readonly schemaVersion: number;
  readonly createdAt: string;
}

type ProjectOpenInput = { readonly workspacePath: string } | { readonly recentProjectId: string };

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function isPermissionFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ['EACCES', 'EPERM', 'EROFS'].includes(String(error.code))
  );
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}

function databaseIsPhysicallyUnreadable(databasePath: string): boolean {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
    });
    database.prepare('PRAGMA schema_version').get();
    return false;
  } catch {
    return true;
  } finally {
    database?.close();
  }
}

function assertManifestDatabaseIdentity(databasePath: string, manifestProjectId: string): void {
  let database: DatabaseSync | undefined;
  try {
    database = new DatabaseSync(databasePath, {
      readOnly: true,
      allowExtension: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
    });
    const hasProjects = database
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'projects'")
      .get();
    if (!hasProjects) return;
    const rows = database.prepare('SELECT id FROM projects ORDER BY created_at LIMIT 2').all();
    if (rows.length !== 1 || String(rows[0]?.id) !== manifestProjectId) {
      throw new ProjectWorkspaceError(
        'PROJECT_ID_MISMATCH',
        'The project manifest does not match the project database.',
      );
    }
  } catch (error) {
    if (error instanceof ProjectWorkspaceError) throw error;
    // The database foundation performs authoritative integrity and compatibility checks below.
  } finally {
    database?.close();
  }
}

function validWorkspaceName(name: string): string {
  const trimmed = name.trim();
  const containsControlCharacter = [...trimmed].some(
    (character) => (character.codePointAt(0) ?? 0) < 32,
  );
  if (
    trimmed === '.' ||
    trimmed === '..' ||
    /[<>:"/\\|?*]/u.test(trimmed) ||
    containsControlCharacter ||
    /[. ]$/u.test(trimmed)
  ) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'The project name cannot be represented as a safe workspace directory.',
    );
  }
  return `${trimmed}.worldforge`;
}

async function existingDirectory(directory: string, requireWritable = false): Promise<string> {
  if (!path.isAbsolute(directory)) {
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_OUTSIDE_SCOPE',
      'Project directories must be absolute paths selected by the desktop process.',
    );
  }
  try {
    const canonical = await realpath(path.normalize(directory));
    const details = await stat(canonical);
    if (!details.isDirectory()) {
      throw new ProjectWorkspaceError(
        'PROJECT_PATH_MISSING',
        'The selected path is not a directory.',
      );
    }
    if (requireWritable) {
      if ((details.mode & 0o222) === 0) {
        throw new ProjectWorkspaceError(
          'PROJECT_DIRECTORY_READ_ONLY',
          'The selected directory is read-only.',
        );
      }
      await access(canonical, constants.W_OK);
    }
    return canonical;
  } catch (error) {
    if (error instanceof ProjectWorkspaceError) throw error;
    if (isPermissionFailure(error)) {
      throw new ProjectWorkspaceError(
        'PROJECT_DIRECTORY_READ_ONLY',
        'The selected directory cannot be written.',
        { cause: error },
      );
    }
    throw new ProjectWorkspaceError(
      'PROJECT_PATH_MISSING',
      'The selected project directory does not exist.',
      { cause: error },
    );
  }
}

async function workspaceSize(directory: string): Promise<bigint> {
  let total = 0n;
  const visit = async (current: string): Promise<void> => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'Symbolic links are not allowed inside a project workspace.',
        );
      }
      if (entry.isDirectory()) await visit(entryPath);
      else if (entry.isFile()) total += BigInt((await stat(entryPath)).size);
    }
  };
  await visit(directory);
  return total;
}

async function defaultCopyWorkspace(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    force: false,
    errorOnExist: true,
    preserveTimestamps: true,
    verbatimSymlinks: true,
  });
}

async function defaultHashWorkspace(directory: string): Promise<string> {
  const hash = createHash('sha256');
  const visit = async (current: string, relativeDirectory: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en'));
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'Symbolic links are not allowed inside a project workspace.',
        );
      }
      if (entry.isDirectory()) {
        hash.update(`directory\0${relativePath}\0`, 'utf8');
        await visit(entryPath, relativePath);
      } else if (entry.isFile()) {
        hash.update(`file\0${relativePath}\0`, 'utf8');
        hash.update(await readFile(entryPath));
        hash.update('\0', 'utf8');
      } else {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'Unsupported filesystem entries are not allowed inside a project workspace.',
        );
      }
    }
  };
  await visit(directory, '');
  return hash.digest('hex');
}

async function defaultFreeBytes(directory: string): Promise<bigint> {
  const details = await statfs(directory, { bigint: true });
  return details.bavail * details.bsize;
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
    return this.#idempotent(requestId, async () => {
      this.#assertNoActive();
      const project = ProjectCreateInputSchema.parse(input);
      const parent = await existingDirectory(parentDirectory, true);
      const workspaceName = validWorkspaceName(project.name);
      const finalPath = path.join(parent, workspaceName);
      const stagingPath = path.join(parent, `.${workspaceName}.create-${this.#idFactory()}`);
      if (await this.#exists(finalPath)) {
        throw new ProjectWorkspaceError(
          'PROJECT_TARGET_CONFLICT',
          'A project workspace with the same name already exists.',
        );
      }

      const projectId = this.#idFactory();
      const createdAt = this.#clock.now().toISOString();
      let renamed = false;
      try {
        await mkdir(stagingPath, { mode: 0o700 });
        await chmod(stagingPath, 0o700);
        const migrations = await loadMigrations(this.#migrationsDirectory, 'project');
        const projectSchemaVersion = latestMigrationVersion(migrations);
        const databasePath = path.join(stagingPath, 'project.sqlite');
        const database = await ProjectDatabase.open({
          path: databasePath,
          migrations,
          appVersion: this.#appVersion,
          clock: this.#clock,
        });
        try {
          if (database.mode !== 'read-write' || database.schemaVersion !== projectSchemaVersion) {
            throw new ProjectWorkspaceError(
              'PROJECT_CREATE_FAILED',
              'A new project database did not reach the latest registered schema version.',
            );
          }
          await database.write(requestId, (connection) => {
            connection
              .prepare(
                `INSERT INTO projects(
                   id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
                 ) VALUES(?, ?, ?, NULL, ?, ?, ?)`,
              )
              .run(
                projectId,
                project.name,
                project.channel,
                database.schemaVersion,
                createdAt,
                createdAt,
              );
            initializeProjectStructure(
              connection,
              projectId,
              project.initialStructure ?? 'starter',
              createdAt,
              this.#idFactory,
            );
          });
          await database.checkpoint('TRUNCATE');
        } finally {
          await database.close();
        }
        await chmod(databasePath, 0o600);
        const manifest = ProjectWorkspaceManifestSchema.parse({
          format: 'worldforge-project',
          manifestVersion: 1,
          projectId,
          displayName: project.name,
          databaseFile: 'project.sqlite',
          projectSchemaVersion,
          createdAt,
        });
        await writeFile(
          path.join(stagingPath, 'manifest.json'),
          `${JSON.stringify(manifest, null, 2)}\n`,
          { encoding: 'utf8', mode: 0o600, flag: 'wx' },
        );
        await rename(stagingPath, finalPath);
        renamed = true;
        const context = await this.#loadWorkspace(finalPath);
        try {
          await this.#recentProjects.register(requestId, {
            projectId: context.summary.projectId,
            workspacePath: context.summary.workspacePath,
            displayName: context.summary.name,
          });
        } catch (error) {
          await this.#closeContext(context);
          throw error;
        }
        this.#active = context;
        return context.summary;
      } catch (error) {
        if (!this.#active) {
          await rm(renamed ? finalPath : stagingPath, { recursive: true, force: true });
        }
        if (error instanceof ProjectWorkspaceError) throw error;
        if (isPermissionFailure(error)) {
          throw new ProjectWorkspaceError(
            'PROJECT_DIRECTORY_READ_ONLY',
            'The project workspace could not be created in the selected directory.',
            { cause: error },
          );
        }
        throw new ProjectWorkspaceError(
          'PROJECT_CREATE_FAILED',
          'The project workspace could not be created safely.',
          { cause: error },
        );
      }
    });
  }

  open(requestId: string, input: ProjectOpenInput): Promise<ProjectWorkspaceSummary> {
    return this.#idempotent(requestId, async () => {
      this.#assertNoActive();
      let workspacePath: string;
      if ('recentProjectId' in input) {
        const projectId = ProjectIdSchema.parse(input.recentProjectId);
        workspacePath = this.#recentProjects.get(projectId).workspacePath;
      } else {
        workspacePath = input.workspacePath;
      }
      const context = await this.#loadWorkspace(workspacePath);
      try {
        await this.#recentProjects.register(requestId, {
          projectId: context.summary.projectId,
          workspacePath: context.summary.workspacePath,
          displayName: context.summary.name,
        });
      } catch (error) {
        await this.#closeContext(context);
        throw error;
      }
      this.#active = context;
      return context.summary;
    });
  }

  close(requestId: string, projectId: string): Promise<{ projectId: string; closed: true }> {
    return this.#idempotent(requestId, async () => {
      const context = this.#assertActiveContext(projectId);
      try {
        await this.#closeContext(context);
      } finally {
        if (this.#active === context) this.#active = null;
      }
      return { projectId: context.summary.projectId, closed: true };
    });
  }

  move(
    requestId: string,
    projectId: string,
    targetParentDirectory: string,
  ): Promise<ProjectWorkspaceSummary & { readonly sourceRetained: boolean }> {
    return this.#idempotent(requestId, async () => {
      const context = this.#assertActiveContext(projectId, true);
      const source = context.summary.workspacePath;
      const targetParent = await existingDirectory(targetParentDirectory, true);
      if (isInside(source, targetParent)) {
        throw new ProjectWorkspaceError(
          'PROJECT_MOVE_FAILED',
          'A project cannot be moved inside its own workspace.',
        );
      }
      const target = path.join(targetParent, path.basename(source));
      if (target === source) {
        return { ...context.summary, sourceRetained: false };
      }
      if (await this.#exists(target)) {
        throw new ProjectWorkspaceError(
          'PROJECT_TARGET_CONFLICT',
          'The move target already exists.',
        );
      }

      const staging = `${target}.move-${this.#idFactory()}`;
      let targetCreated = false;
      try {
        try {
          await this.#closeContext(context);
        } finally {
          if (this.#active === context) this.#active = null;
        }

        const requiredBytes = await workspaceSize(source);
        if ((await this.#freeBytes(targetParent)) < requiredBytes) {
          throw new ProjectWorkspaceError(
            'PROJECT_MOVE_FAILED',
            'The target volume does not have enough free space.',
          );
        }
        await this.#copyWorkspace(source, staging);
        const [sourceHash, targetHash] = await Promise.all([
          this.#hashWorkspace(source),
          this.#hashWorkspace(staging),
        ]);
        if (sourceHash !== targetHash) {
          throw new ProjectWorkspaceError(
            'PROJECT_MOVE_FAILED',
            'The copied project did not match the source workspace.',
          );
        }
        const verification = await this.#loadWorkspace(staging);
        await this.#closeContext(verification);
        await rename(staging, target);
        targetCreated = true;

        const moved = await this.#loadWorkspace(target);
        try {
          await this.#recentProjects.register(requestId, {
            projectId: moved.summary.projectId,
            workspacePath: moved.summary.workspacePath,
            displayName: moved.summary.name,
          });
        } catch (error) {
          await this.#closeContext(moved);
          throw error;
        }
        this.#active = moved;
        let sourceRetained = false;
        try {
          await rm(source, { recursive: true });
        } catch {
          sourceRetained = true;
        }
        return { ...moved.summary, sourceRetained };
      } catch (error) {
        await rm(staging, { recursive: true, force: true });
        if (targetCreated && !this.#active) {
          await rm(target, { recursive: true, force: true });
        }
        if (!this.#active && (await this.#exists(source))) {
          try {
            const restored = await this.#loadWorkspace(source);
            this.#active = restored;
            await this.#recentProjects.register(this.#idFactory(), {
              projectId: restored.summary.projectId,
              workspacePath: restored.summary.workspacePath,
              displayName: restored.summary.name,
            });
          } catch {
            // Keep the original move error. The source remains untouched for manual recovery.
          }
        }
        if (error instanceof ProjectWorkspaceError) throw error;
        throw new ProjectWorkspaceError(
          'PROJECT_MOVE_FAILED',
          'The project move failed; the original workspace was retained.',
          { cause: error },
        );
      }
    });
  }

  registerRecoveredWorkspace(
    requestId: string,
    workspacePath: string,
  ): Promise<ProjectWorkspaceSummary> {
    return this.#idempotent(requestId, async () => {
      const context = await this.#loadWorkspace(workspacePath);
      try {
        await this.#recentProjects.register(requestId, {
          projectId: context.summary.projectId,
          workspacePath: context.summary.workspacePath,
          displayName: context.summary.name,
        });
        return context.summary;
      } finally {
        await this.#closeContext(context);
      }
    });
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
  ): Promise<T> {
    const context = this.#assertActiveContext(projectId, true);
    if (!context.database) {
      throw new ProjectWorkspaceError(
        'PROJECT_READ_ONLY',
        'The project database is unreadable; write operations are disabled.',
      );
    }
    return (await context.database.write(requestId, operation)).value;
  }

  async resolveProjectPath(projectId: string, relativePath: string): Promise<string> {
    const context = this.#assertActiveContext(projectId);
    if (
      path.isAbsolute(relativePath) ||
      path.win32.isAbsolute(relativePath) ||
      relativePath.split(/[\\/]+/u).includes('..')
    ) {
      throw new ProjectWorkspaceError(
        'PROJECT_PATH_OUTSIDE_SCOPE',
        'The requested path is outside the active project workspace.',
      );
    }
    const root = context.summary.workspacePath;
    const candidate = path.resolve(root, relativePath);
    if (!isInside(root, candidate)) {
      throw new ProjectWorkspaceError(
        'PROJECT_PATH_OUTSIDE_SCOPE',
        'The requested path is outside the active project workspace.',
      );
    }

    let current = root;
    for (const segment of path.relative(root, candidate).split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      try {
        const details = await lstat(current);
        if (details.isSymbolicLink()) {
          throw new ProjectWorkspaceError(
            'PROJECT_PATH_OUTSIDE_SCOPE',
            'Symbolic links cannot escape the active project workspace.',
          );
        }
        const canonical = await realpath(current);
        if (!isInside(root, canonical)) {
          throw new ProjectWorkspaceError(
            'PROJECT_PATH_OUTSIDE_SCOPE',
            'The requested path resolved outside the active project workspace.',
          );
        }
      } catch (error) {
        if (error instanceof ProjectWorkspaceError) throw error;
        if (isMissing(error)) break;
        throw error;
      }
    }
    return candidate;
  }

  async shutdown(): Promise<void> {
    await this.#lifecycleTail;
    const context = this.#active;
    if (!context) return;
    try {
      await this.#closeContext(context);
    } finally {
      if (this.#active === context) this.#active = null;
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

  async #loadWorkspace(selectedPath: string): Promise<ActiveProjectContext> {
    let workspacePath: string;
    try {
      if (!path.isAbsolute(selectedPath)) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'A project workspace path must be absolute.',
        );
      }
      const selectedDetails = await lstat(path.normalize(selectedPath));
      if (selectedDetails.isSymbolicLink()) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_OUTSIDE_SCOPE',
          'A project workspace cannot be opened through a symbolic link.',
        );
      }
      if (!selectedDetails.isDirectory()) {
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_MISSING',
          'The workspace is not a directory.',
        );
      }
      workspacePath = await realpath(path.normalize(selectedPath));
    } catch (error) {
      if (error instanceof ProjectWorkspaceError) throw error;
      throw new ProjectWorkspaceError(
        'PROJECT_PATH_MISSING',
        'The project workspace directory does not exist.',
        { cause: error },
      );
    }

    const manifestPath = path.join(workspacePath, 'manifest.json');
    const databasePath = path.join(workspacePath, 'project.sqlite');
    for (const requiredPath of [manifestPath, databasePath]) {
      try {
        const details = await lstat(requiredPath);
        if (details.isSymbolicLink()) {
          throw new ProjectWorkspaceError(
            'PROJECT_PATH_OUTSIDE_SCOPE',
            'Project manifest and database files cannot be symbolic links.',
          );
        }
        if (!details.isFile()) {
          throw new ProjectWorkspaceError(
            'PROJECT_PATH_MISSING',
            'A required project workspace file is missing.',
          );
        }
      } catch (error) {
        if (error instanceof ProjectWorkspaceError) throw error;
        throw new ProjectWorkspaceError(
          'PROJECT_PATH_MISSING',
          'A required project workspace file is missing.',
          { cause: error },
        );
      }
    }

    let manifest: ProjectWorkspaceManifest;
    try {
      manifest = ProjectWorkspaceManifestSchema.parse(
        JSON.parse(await readFile(manifestPath, 'utf8')) as unknown,
      );
    } catch (error) {
      throw new ProjectWorkspaceError(
        'PROJECT_MANIFEST_INVALID',
        'The project manifest is invalid or unsupported.',
        { cause: error },
      );
    }

    const migrations = await loadMigrations(this.#migrationsDirectory, 'project');
    assertManifestDatabaseIdentity(databasePath, manifest.projectId);
    let database: ProjectDatabase;
    try {
      database = await ProjectDatabase.open({
        path: databasePath,
        migrations,
        appVersion: this.#appVersion,
        clock: this.#clock,
        prepareRecoveryPoint: async (context) => {
          await createSqliteMigrationRecoveryPoint(
            context,
            path.join(this.#projectMigrationRecoveryDirectory, manifest.projectId),
            this.#idFactory(),
          );
        },
      });
    } catch (error) {
      if (databaseIsPhysicallyUnreadable(databasePath)) {
        return {
          database: null,
          manifest,
          summary: {
            projectId: manifest.projectId,
            name: manifest.displayName,
            channel: '未分类',
            workspacePath,
            schemaVersion: manifest.projectSchemaVersion,
            databaseMode: 'read-only',
            compatibility: 'integrity-failed',
            readOnlyReason: 'integrity-failed',
            createdAt: manifest.createdAt,
          },
        };
      }
      throw new ProjectWorkspaceError(
        'PROJECT_OPEN_FAILED',
        'The project database could not be opened safely.',
        { cause: error },
      );
    }

    try {
      let activeManifest = manifest;
      if (
        database.mode === 'read-write' &&
        manifest.projectSchemaVersion !== database.schemaVersion
      ) {
        activeManifest = ProjectWorkspaceManifestSchema.parse({
          ...manifest,
          projectSchemaVersion: database.schemaVersion,
        });
        const temporaryManifestPath = `${manifestPath}.update-${this.#idFactory()}`;
        try {
          await writeFile(temporaryManifestPath, `${JSON.stringify(activeManifest, null, 2)}\n`, {
            encoding: 'utf8',
            mode: 0o600,
            flag: 'wx',
          });
          await rename(temporaryManifestPath, manifestPath);
        } finally {
          await rm(temporaryManifestPath, { force: true });
        }
      }
      const row = this.#readProjectRow(database);
      if (row && row.id !== manifest.projectId) {
        throw new ProjectWorkspaceError(
          'PROJECT_ID_MISMATCH',
          'The project manifest does not match the project database.',
        );
      }
      if (!row && database.compatibility !== 'integrity-failed') {
        throw new ProjectWorkspaceError(
          'PROJECT_ID_MISMATCH',
          'The project database does not contain its required project identity.',
        );
      }
      const readOnlyReason = database.mode === 'read-only' ? database.compatibility : null;
      const summary: ProjectWorkspaceSummary = {
        projectId: manifest.projectId,
        name: row?.name ?? manifest.displayName,
        channel: row?.channel ?? '未分类',
        workspacePath,
        schemaVersion: database.schemaVersion,
        databaseMode: database.mode,
        compatibility: database.compatibility,
        readOnlyReason,
        createdAt: row?.createdAt ?? manifest.createdAt,
      };
      return { database, manifest: activeManifest, summary };
    } catch (error) {
      await database.close();
      throw error;
    }
  }

  #readProjectRow(database: ProjectDatabase): ProjectRow | null {
    try {
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT id, name, channel, schema_version, created_at
               FROM projects
              ORDER BY created_at ASC
              LIMIT 2`,
          )
          .all(),
      );
      if (rows.length !== 1) return null;
      const row = rows[0];
      if (!row) return null;
      const id = ProjectIdSchema.safeParse(row.id);
      const name = ProjectCreateInputSchema.shape.name.safeParse(row.name);
      const channel = ProjectCreateInputSchema.shape.channel.safeParse(row.channel);
      if (!id.success || !name.success || !channel.success || typeof row.created_at !== 'string') {
        return null;
      }
      return {
        id: id.data,
        name: name.data,
        channel: channel.data,
        schemaVersion: Number(row.schema_version),
        createdAt: row.created_at,
      };
    } catch {
      return null;
    }
  }

  async #closeContext(context: ActiveProjectContext): Promise<void> {
    if (!context.database) return;
    await context.database.drain();
    if (context.database.mode === 'read-write') await context.database.checkpoint('TRUNCATE');
    await context.database.close();
  }

  async #exists(candidate: string): Promise<boolean> {
    try {
      await lstat(candidate);
      return true;
    } catch (error) {
      if (isMissing(error)) return false;
      throw error;
    }
  }

  #idempotent<T>(requestId: string, operation: () => Promise<T>): Promise<T> {
    const validRequestId = RequestIdSchema.parse(requestId);
    const existing = this.#operations.get<T>(validRequestId);
    if (existing) return existing;
    const result = this.#lifecycleTail.then(operation);
    this.#lifecycleTail = result.then(
      () => undefined,
      () => undefined,
    );
    return this.#operations.remember(validRequestId, result);
  }
}
