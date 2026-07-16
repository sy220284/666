import { randomUUID } from 'node:crypto';

import {
  AppDatabase,
  DatabaseFoundationError,
  loadMigrations,
  type DatabaseClock,
  type MigrationRecoveryContext,
} from './database/index.js';
import { AppSettingsRepository } from './app-settings.js';
import { ProviderConfigsRepository } from './provider-configs.js';
import { RecentProjectsRepository } from './recent-projects.js';
import { WindowPreferencesRepository } from './window-preferences.js';
import { createSqliteMigrationRecoveryPoint } from './migration-recovery.js';

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
  readonly appSettings: AppSettingsRepository;
  readonly recentProjects: RecentProjectsRepository;
  readonly providerConfigs: ProviderConfigsRepository;
  readonly windowPreferences: WindowPreferencesRepository;
  close(): Promise<void>;
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
  return createSqliteMigrationRecoveryPoint(context, recoveryDirectory, recoveryId);
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
    appSettings: new AppSettingsRepository(database, options.clock),
    recentProjects: new RecentProjectsRepository(database, options.clock),
    providerConfigs: new ProviderConfigsRepository(database, options.clock),
    windowPreferences: new WindowPreferencesRepository(database, options.clock),
    close: () => database.close(),
  };
}
