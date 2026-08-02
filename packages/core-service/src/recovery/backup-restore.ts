import { chmod, lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  RecoveryRestoreInputSchema,
  RecoveryRestoredProjectSchema,
  type RecoveryRestoreInput,
  type RecoveryRestoredProject,
} from '@worldforge/contracts';

import {
  RecoveryServiceError,
  existingWritableDirectory,
  hashFile,
  isMissing,
  readBackupMetadata,
  safeName,
  verifyDatabase,
  type RecoveryRuntime,
} from './backup-manifest.js';

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export function remapProjectIdentity(
  databasePath: string,
  previousProjectId: string,
  nextProjectId: string,
  nextName: string,
  timestamp: string,
): void {
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    enableForeignKeyConstraints: false,
    readBigInts: true,
  });
  try {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE');
    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all()
      .map((row) => String(row.name));
    for (const table of tables) {
      const references = database
        .prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`)
        .all();
      for (const reference of references) {
        if (String(reference.table) !== 'projects' || String(reference.to) !== 'id') continue;
        const column = String(reference.from);
        database
          .prepare(
            `UPDATE ${quoteIdentifier(table)} SET ${quoteIdentifier(column)} = ? WHERE ${quoteIdentifier(column)} = ?`,
          )
          .run(nextProjectId, previousProjectId);
      }
    }
    const changed = database
      .prepare('UPDATE projects SET id = ?, name = ?, created_at = ?, updated_at = ? WHERE id = ?')
      .run(nextProjectId, nextName, timestamp, timestamp, previousProjectId);
    if (Number(changed.changes) !== 1) throw new Error('PROJECT_ID_REMAP_FAILED');
    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('PROJECT_ID_REMAP_FOREIGN_KEY_FAILED');
    }
    database.exec('COMMIT');
    database.exec('PRAGMA foreign_keys = ON');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    throw error;
  } finally {
    database.close();
  }
}

export class BackupRestoreOperations {
  readonly #runtime: RecoveryRuntime;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
  }

  async restoreCheckpoint(
    requestId: string,
    raw: RecoveryRestoreInput,
    targetParentDirectory: string,
  ): Promise<RecoveryRestoredProject> {
    const input = RecoveryRestoreInputSchema.parse(raw);
    const sourceProject = this.#runtime.workspace.assertActiveProject(input.projectId);
    const metadata = (await readBackupMetadata(this.#runtime, input.projectId)).find(
      (record) => record.backupId === input.backupId,
    );
    if (!metadata) {
      throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The checkpoint was not found.');
    }
    if (path.basename(metadata.backupFileName) !== metadata.backupFileName) {
      throw new RecoveryServiceError(
        'RESTORE_SOURCE_INVALID',
        'The checkpoint file name is invalid.',
      );
    }
    const backupPath = path.join(
      this.#runtime.backupRootDirectory,
      input.projectId,
      metadata.backupFileName,
    );
    try {
      if ((await hashFile(backupPath)) !== metadata.sha256) {
        throw new RecoveryServiceError(
          'RESTORE_SOURCE_INVALID',
          'The checkpoint hash does not match.',
        );
      }
      verifyDatabase(backupPath, input.projectId);
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'RESTORE_SOURCE_INVALID',
        'The checkpoint cannot be verified.',
        { cause: error },
      );
    }

    const parent = await existingWritableDirectory(targetParentDirectory);
    const nextProjectId = this.#runtime.idFactory();
    const restoredAt = this.#runtime.clock.now().toISOString();
    const nextName = `${sourceProject.name}（恢复副本）`.slice(0, 240);
    const directoryName = `${safeName(sourceProject.name)}-恢复-${input.backupId.slice(0, 8)}.worldforge`;
    const target = path.join(parent, directoryName);
    const staging = path.join(parent, `.${directoryName}.restore-${this.#runtime.idFactory()}`);
    try {
      await lstat(target);
      throw new RecoveryServiceError(
        'RESTORE_TARGET_CONFLICT',
        'The recovery target already exists.',
      );
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      if (!isMissing(error)) throw error;
    }
    const requiredBytes = BigInt(metadata.sizeBytes) * 2n + 1_048_576n;
    if ((await this.#runtime.freeBytes(parent)) < requiredBytes) {
      throw new RecoveryServiceError(
        'BACKUP_SPACE_LOW',
        'There is not enough space for the restored copy.',
      );
    }

    let targetCreated = false;
    try {
      await mkdir(staging, { mode: 0o700 });
      const databasePath = path.join(staging, 'project.sqlite');
      await this.#runtime.copyBackup(backupPath, databasePath);
      await chmod(databasePath, 0o600);
      await this.#runtime.afterRestoreCopied?.(databasePath);
      remapProjectIdentity(databasePath, input.projectId, nextProjectId, nextName, restoredAt);
      verifyDatabase(databasePath, nextProjectId);
      const manifest = {
        format: 'worldforge-project',
        manifestVersion: 1,
        projectId: nextProjectId,
        displayName: nextName,
        databaseFile: 'project.sqlite',
        projectSchemaVersion: sourceProject.schemaVersion,
        createdAt: restoredAt,
      } as const;
      await writeFile(
        path.join(staging, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        },
      );
      await rename(staging, target);
      targetCreated = true;
      const registered = await this.#runtime.workspace.registerRecoveredWorkspace(
        requestId,
        target,
      );
      return RecoveryRestoredProjectSchema.parse({
        ...registered,
        sourceProjectId: input.projectId,
        backupId: input.backupId,
      });
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      if (targetCreated) await rm(target, { recursive: true, force: true });
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'RESTORE_VERIFY_FAILED',
        'The restored copy failed verification.',
        { cause: error },
      );
    }
  }
}
