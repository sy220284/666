import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  ProjectCreateInputSchema,
  ProjectIdSchema,
  ProjectWorkspaceManifestSchema,
  type ProjectWorkspaceManifest,
  type ProjectWorkspaceSummary,
} from '@worldforge/contracts';

import { ProjectDatabase, loadMigrations, type DatabaseClock } from '../database/index.js';
import { createSqliteMigrationRecoveryPoint } from '../migration-recovery.js';
import type { RecentProjectsRepository } from '../recent-projects.js';
import { ProjectWorkspaceError } from './workspace-path-policy.js';
import { readWorkspaceManifest, replaceWorkspaceManifest } from './workspace-manifest.js';

export interface ActiveProjectContext {
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

export interface WorkspaceVerifierContext {
  readonly migrationsDirectory: string;
  readonly appVersion: string;
  readonly projectMigrationRecoveryDirectory: string;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
}

export interface ProjectWorkspaceOperationContext extends WorkspaceVerifierContext {
  readonly recentProjects: RecentProjectsRepository;
  readonly copyWorkspace: (source: string, target: string) => Promise<void>;
  readonly hashWorkspace: (workspacePath: string) => Promise<string>;
  readonly freeBytes: (directory: string) => Promise<bigint>;
  active: ActiveProjectContext | null;
  assertNoActive(): void;
  assertActiveContext(projectId: string, requireWrite?: boolean): ActiveProjectContext;
  registerRecentBestEffort(requestId: string, summary: ProjectWorkspaceSummary): Promise<boolean>;
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

export async function loadWorkspace(
  context: WorkspaceVerifierContext,
  selectedPath: string,
): Promise<ActiveProjectContext> {
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
      throw new ProjectWorkspaceError('PROJECT_PATH_MISSING', 'The workspace is not a directory.');
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

  const manifest = await readWorkspaceManifest(manifestPath);

  const migrations = await loadMigrations(context.migrationsDirectory, 'project');
  assertManifestDatabaseIdentity(databasePath, manifest.projectId);
  let database: ProjectDatabase;
  try {
    database = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: context.appVersion,
      clock: context.clock,
      prepareRecoveryPoint: async (recoveryContext) => {
        await createSqliteMigrationRecoveryPoint(
          recoveryContext,
          path.join(context.projectMigrationRecoveryDirectory, manifest.projectId),
          context.idFactory(),
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
      await replaceWorkspaceManifest(manifestPath, activeManifest, context.idFactory);
    }
    const row = readProjectRow(database);
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

function readProjectRow(database: ProjectDatabase): ProjectRow | null {
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

export async function closeProjectContext(context: ActiveProjectContext): Promise<void> {
  if (!context.database) return;
  await context.database.drain();
  if (context.database.mode === 'read-write') await context.database.checkpoint('TRUNCATE');
  await context.database.close();
}
