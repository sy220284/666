import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import {
  AppDatabase,
  DatabaseFoundationError,
  loadMigrations,
  type DatabaseClock,
  type MigrationRecoveryContext,
} from './database/index.js';
import { WindowPreferencesRepository } from './window-preferences.js';

export interface AppRuntimeOptions {
  readonly databasePath: string;
  readonly migrationsDirectory: string;
  readonly recoveryDirectory: string;
  readonly appVersion: string;
  readonly clock?: DatabaseClock;
  readonly recoveryId?: () => string;
}

export interface AppRuntime {
  readonly database: AppDatabase;
  readonly windowPreferences: WindowPreferencesRepository;
  close(): Promise<void>;
}

function quickCheck(database: DatabaseSync): boolean {
  const rows = database.prepare('PRAGMA quick_check').all();
  return rows.length === 1 && Object.values(rows[0] ?? {})[0] === 'ok';
}

export async function createAppMigrationRecoveryPoint(
  context: MigrationRecoveryContext,
  recoveryDirectory: string,
  recoveryId: string = randomUUID(),
): Promise<string> {
  if (context.kind !== 'app') {
    throw new DatabaseFoundationError(
      'MIGRATION_RECOVERY_POINT_FAILED',
      'The app recovery helper only accepts app databases.',
    );
  }
  await mkdir(recoveryDirectory, { recursive: true, mode: 0o700 });
  await chmod(recoveryDirectory, 0o700);
  const fileName = `app-v${context.fromVersion}-to-v${context.toVersion}-${recoveryId}.sqlite`;
  const finalPath = path.join(recoveryDirectory, fileName);
  const partialPath = `${finalPath}.partial`;
  const partialSidecars = [`${partialPath}-shm`, `${partialPath}-wal`] as const;
  const cleanupPartial = async (): Promise<void> => {
    await Promise.all([
      rm(partialPath, { force: true }),
      ...partialSidecars.map((sidecar) => rm(sidecar, { force: true })),
    ]);
  };
  const source = new DatabaseSync(context.databasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
  });
  try {
    await backup(source, partialPath);
  } catch (error) {
    await cleanupPartial();
    throw error;
  } finally {
    source.close();
  }

  try {
    const recovery = new DatabaseSync(partialPath, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
    });
    try {
      if (!quickCheck(recovery)) {
        throw new DatabaseFoundationError(
          'MIGRATION_RECOVERY_POINT_FAILED',
          'The app migration recovery point failed quick_check.',
        );
      }
      recovery.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      recovery.prepare('PRAGMA journal_mode = DELETE').get();
      if (!quickCheck(recovery)) {
        throw new DatabaseFoundationError(
          'MIGRATION_RECOVERY_POINT_FAILED',
          'The consolidated app migration recovery point failed quick_check.',
        );
      }
    } finally {
      recovery.close();
    }
    await Promise.all(partialSidecars.map((sidecar) => rm(sidecar, { force: true })));
    await chmod(partialPath, 0o600);
    await rename(partialPath, finalPath);
    return finalPath;
  } catch (error) {
    await cleanupPartial();
    throw error;
  }
}

export async function openAppRuntime(options: AppRuntimeOptions): Promise<AppRuntime> {
  const migrations = await loadMigrations(options.migrationsDirectory, 'app');
  const database = await AppDatabase.open({
    path: options.databasePath,
    migrations,
    appVersion: options.appVersion,
    ...(options.clock ? { clock: options.clock } : {}),
    prepareRecoveryPoint: async (context) => {
      await createAppMigrationRecoveryPoint(
        context,
        options.recoveryDirectory,
        options.recoveryId?.() ?? randomUUID(),
      );
    },
  });
  return {
    database,
    windowPreferences: new WindowPreferencesRepository(database, options.clock),
    close: () => database.close(),
  };
}
