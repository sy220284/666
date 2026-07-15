import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  AppDatabase,
  ProjectDatabase,
  loadMigrations,
  type DatabaseClock,
} from '@worldforge/core-service';

import { ManualClock, SequenceIdFactory } from './determinism.js';

export interface TemporaryWorldforgeWorkspaceOptions {
  readonly parentDirectory?: string;
  readonly migrationsDirectory?: string;
  readonly appVersion?: string;
  readonly projectId?: string;
  readonly clock?: DatabaseClock;
  readonly ids?: SequenceIdFactory;
}

export interface TemporaryWorldforgeWorkspace {
  readonly rootDirectory: string;
  readonly appDatabasePath: string;
  readonly projectDirectory: string;
  readonly projectDatabasePath: string;
  readonly projectId: string;
  readonly clock: DatabaseClock;
  readonly ids: SequenceIdFactory;
  readonly appDatabase: AppDatabase;
  readonly projectDatabase: ProjectDatabase;
  cleanup(): Promise<void>;
}

export async function createTemporaryWorldforgeWorkspace(
  options: TemporaryWorldforgeWorkspaceOptions = {},
): Promise<TemporaryWorldforgeWorkspace> {
  const clock = options.clock ?? new ManualClock();
  const ids = options.ids ?? new SequenceIdFactory();
  const projectId = options.projectId ?? ids.nextUuid();
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(projectId)) {
    throw new RangeError('Temporary workspace projectId must be a UUID.');
  }

  const parentDirectory = path.resolve(options.parentDirectory ?? tmpdir());
  await mkdir(parentDirectory, { recursive: true, mode: 0o700 });
  const rootDirectory = await mkdtemp(path.join(parentDirectory, 'worldforge-test-'));
  await chmod(rootDirectory, 0o700);

  const projectDirectory = path.join(rootDirectory, 'projects', projectId);
  const appDatabasePath = path.join(rootDirectory, 'app.sqlite');
  const projectDatabasePath = path.join(projectDirectory, 'project.sqlite');
  const migrationsDirectory = path.resolve(options.migrationsDirectory ?? 'migrations');
  await mkdir(projectDirectory, { recursive: true, mode: 0o700 });

  let appDatabase: AppDatabase | undefined;
  let projectDatabase: ProjectDatabase | undefined;
  try {
    const [appMigrations, projectMigrations] = await Promise.all([
      loadMigrations(path.join(migrationsDirectory, 'app'), 'app'),
      loadMigrations(path.join(migrationsDirectory, 'project'), 'project'),
    ]);
    appDatabase = await AppDatabase.open({
      path: appDatabasePath,
      migrations: appMigrations,
      appVersion: options.appVersion ?? '0.0.0-test',
      clock,
    });
    projectDatabase = await ProjectDatabase.open({
      path: projectDatabasePath,
      migrations: projectMigrations,
      appVersion: options.appVersion ?? '0.0.0-test',
      clock,
    });
  } catch (error) {
    await projectDatabase?.close().catch(() => undefined);
    await appDatabase?.close().catch(() => undefined);
    await rm(rootDirectory, { recursive: true, force: true });
    throw error;
  }

  let cleanupPromise: Promise<void> | undefined;
  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      const errors: unknown[] = [];
      try {
        await projectDatabase.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        await appDatabase.close();
      } catch (error) {
        errors.push(error);
      }
      try {
        await rm(rootDirectory, { recursive: true, force: true });
      } catch (error) {
        errors.push(error);
      }
      if (errors.length > 0)
        throw new AggregateError(errors, 'Temporary workspace cleanup failed.');
    })();
    return cleanupPromise;
  };

  return {
    rootDirectory,
    appDatabasePath,
    projectDirectory,
    projectDatabasePath,
    projectId,
    clock,
    ids,
    appDatabase,
    projectDatabase,
    cleanup,
  };
}

export async function withTemporaryWorldforgeWorkspace<T>(
  operation: (workspace: TemporaryWorldforgeWorkspace) => Promise<T> | T,
  options: TemporaryWorldforgeWorkspaceOptions = {},
): Promise<T> {
  const workspace = await createTemporaryWorldforgeWorkspace(options);
  try {
    return await operation(workspace);
  } finally {
    await workspace.cleanup();
  }
}
