import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  latestMigrationVersion,
  loadMigrations,
  type SqlMigration,
} from '@worldforge/core-service';

const defaultProjectMigrationsDirectory = 'migrations/project';

function requireAvailableVersion(targetVersion: number, migrations: readonly SqlMigration[]): void {
  const latestVersion = latestMigrationVersion(migrations);
  if (!Number.isSafeInteger(targetVersion) || targetVersion < 1 || targetVersion > latestVersion) {
    throw new RangeError(
      `Project migration version must be an integer between 1 and ${latestVersion}.`,
    );
  }
}

export async function loadProjectMigrations(
  migrationsDirectory = defaultProjectMigrationsDirectory,
): Promise<readonly SqlMigration[]> {
  return loadMigrations(path.resolve(migrationsDirectory), 'project');
}

export async function latestProjectMigrationVersion(
  migrationsDirectory = defaultProjectMigrationsDirectory,
): Promise<number> {
  return latestMigrationVersion(await loadProjectMigrations(migrationsDirectory));
}

export async function loadProjectMigrationsThrough(
  targetVersion: number,
  migrationsDirectory = defaultProjectMigrationsDirectory,
): Promise<readonly SqlMigration[]> {
  const migrations = await loadProjectMigrations(migrationsDirectory);
  requireAvailableVersion(targetVersion, migrations);
  return migrations.slice(0, targetVersion);
}

export async function materializeProjectMigrationsThrough(
  targetVersion: number,
  targetDirectory: string,
  sourceDirectory = defaultProjectMigrationsDirectory,
): Promise<readonly SqlMigration[]> {
  const migrations = await loadProjectMigrationsThrough(targetVersion, sourceDirectory);
  const resolvedTarget = path.resolve(targetDirectory);
  await mkdir(resolvedTarget, { recursive: true, mode: 0o700 });
  await Promise.all(
    migrations.map((migration) =>
      writeFile(
        path.join(
          resolvedTarget,
          `${migration.version.toString().padStart(4, '0')}_${migration.name}.sql`,
        ),
        migration.sql,
        'utf8',
      ),
    ),
  );
  return migrations;
}
