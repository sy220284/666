import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import { DatabaseFoundationError, type MigrationRecoveryContext } from './database/index.js';

function quickCheck(database: DatabaseSync): boolean {
  const rows = database.prepare('PRAGMA quick_check').all();
  return rows.length === 1 && Object.values(rows[0] ?? {})[0] === 'ok';
}

export async function createSqliteMigrationRecoveryPoint(
  context: MigrationRecoveryContext,
  recoveryDirectory: string,
  recoveryId: string = randomUUID(),
): Promise<string> {
  await mkdir(recoveryDirectory, { recursive: true, mode: 0o700 });
  await chmod(recoveryDirectory, 0o700);
  const fileName = `${context.kind}-v${context.fromVersion}-to-v${context.toVersion}-${recoveryId}.sqlite`;
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
          'The migration recovery point failed quick_check.',
        );
      }
      recovery.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
      recovery.prepare('PRAGMA journal_mode = DELETE').get();
      if (!quickCheck(recovery)) {
        throw new DatabaseFoundationError(
          'MIGRATION_RECOVERY_POINT_FAILED',
          'The consolidated migration recovery point failed quick_check.',
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
