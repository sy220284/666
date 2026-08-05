import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
  verifyDatabase,
  type RecoveryRuntime,
} from './backup-manifest.js';
import { safeFileName, safePathComponent } from './path-name.js';

interface RestoreRequestRecord {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly backupId: string;
  readonly restoredProjectId: string;
}

function restoreRequestRecord(raw: unknown): RestoreRequestRecord | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.requestId !== 'string' ||
    typeof value.sourceProjectId !== 'string' ||
    typeof value.backupId !== 'string' ||
    typeof value.restoredProjectId !== 'string'
  ) {
    return null;
  }
  return value as unknown as RestoreRequestRecord;
}

export function remapProjectIdentity(
  databasePath: string,
  sourceProjectId: string,
  nextProjectId: string,
  nextName: string,
  restoredAt: string,
): void {
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  try {
    database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
    try {
      const project = database
        .prepare('SELECT id FROM projects WHERE id = ?')
        .get(sourceProjectId) as { id: string } | undefined;
      if (!project) {
        throw new RecoveryServiceError(
          'RESTORE_SOURCE_INVALID',
          'The checkpoint does not contain the expected project.',
        );
      }
      database
        .prepare('UPDATE projects SET id = ?, name = ?, updated_at = ? WHERE id = ?')
        .run(nextProjectId, nextName, restoredAt, sourceProjectId);
      for (const table of [
        'volumes',
        'entities',
        'project_briefs',
        'continuation_state',
        'backup_records',
        'backup_failures',
        'backup_policies',
        'replace_plans',
        'search_index_state',
        'project_dictionary',
      ]) {
        database
          .prepare(`UPDATE ${table} SET project_id = ? WHERE project_id = ?`)
          .run(nextProjectId, sourceProjectId);
      }
      database.exec('COMMIT; PRAGMA foreign_keys = ON;');
      if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
        throw new RecoveryServiceError(
          'RESTORE_VERIFY_FAILED',
          'The restored project references are invalid.',
        );
      }
    } catch (error) {
      if (database.isTransaction) database.exec('ROLLBACK');
      database.exec('PRAGMA foreign_keys = ON;');
      throw error;
    }
  } finally {
    database.close();
  }
}

export class BackupRestoreOperations {
  readonly #runtime: RecoveryRuntime;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
  }

  async #replayExisting(
    requestId: string,
    input: RecoveryRestoreInput,
    target: string,
  ): Promise<RecoveryRestoredProject | null> {
    try {
      const details = await lstat(target);
      if (!details.isDirectory()) {
        throw new RecoveryServiceError(
          'RESTORE_TARGET_CONFLICT',
          'The recovery target already exists and is not a project directory.',
        );
      }
    } catch (error) {
      if (isMissing(error)) return null;
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'RESTORE_TARGET_CONFLICT',
        'The recovery target could not be inspected.',
        { cause: error },
      );
    }

    let replay: RestoreRequestRecord | null = null;
    try {
      replay = restoreRequestRecord(
        JSON.parse(await readFile(path.join(target, 'restore-request.json'), 'utf8')) as unknown,
      );
    } catch {
      replay = null;
    }
    if (
      !replay ||
      replay.requestId !== requestId ||
      replay.sourceProjectId !== input.projectId ||
      replay.backupId !== input.backupId ||
      replay.restoredProjectId !== requestId
    ) {
      throw new RecoveryServiceError(
        'RESTORE_TARGET_CONFLICT',
        'The recovery target belongs to a different restore request.',
      );
    }

    try {
      const registered = await this.#runtime.workspace.registerRecoveredWorkspace(requestId, target);
      return RecoveryRestoredProjectSchema.parse({
        ...registered,
        sourceProjectId: input.projectId,
        backupId: input.backupId,
      });
    } catch (error) {
      throw new RecoveryServiceError(
        'RESTORE_VERIFY_FAILED',
        'The completed recovery target could not be reopened safely.',
        { cause: error },
      );
    }
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
    const nextProjectId = requestId;
    const restoredAt = this.#runtime.clock.now().toISOString();
    const nextName = `${sourceProject.name}（恢复副本）`.slice(0, 240);
    const directoryName = safeFileName(
      `${safePathComponent(sourceProject.name, 140)}-恢复-${requestId.slice(0, 8)}`,
      '.worldforge',
    );
    const target = path.join(parent, directoryName);
    const replayed = await this.#replayExisting(requestId, input, target);
    if (replayed) return replayed;

    const staging = path.join(parent, `.${directoryName}.restore-${requestId}`);
    await rm(staging, { recursive: true, force: true });
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
      const replayRecord: RestoreRequestRecord = {
        schemaVersion: 1,
        requestId,
        sourceProjectId: input.projectId,
        backupId: input.backupId,
        restoredProjectId: nextProjectId,
      };
      await writeFile(
        path.join(staging, 'restore-request.json'),
        `${JSON.stringify(replayRecord, null, 2)}\n`,
        {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        },
      );
      await rename(staging, target);
      targetCreated = true;
      const registered = await this.#runtime.workspace.registerRecoveredWorkspace(requestId, target);
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
