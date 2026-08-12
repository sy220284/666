import { chmod, link, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
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
import {
  rethrowRecoveryFailure,
  settleRecoveryCompensation,
} from './recovery-compensation.js';
import {
  finalizeProjectClone,
  prepareProjectClone,
  projectCloneAction,
  projectCloneTables,
  remapProjectScopedDerivedIdentity,
} from './project-clone-policy.js';

interface RestoreRequestRecord {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly backupId: string;
  readonly restoredProjectId: string;
}

interface RestoreOperationJournal {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly backupId: string;
  readonly targetParentDirectory: string;
  readonly targetPath: string;
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

function restoreOperationJournal(raw: unknown): RestoreOperationJournal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.requestId !== 'string' ||
    typeof value.sourceProjectId !== 'string' ||
    typeof value.backupId !== 'string' ||
    typeof value.targetParentDirectory !== 'string' ||
    typeof value.targetPath !== 'string'
  ) {
    return null;
  }
  return value as unknown as RestoreOperationJournal;
}

function isAlreadyExists(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

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
    prepareProjectClone(database, timestamp);
    const tables = projectCloneTables(database);
    for (const table of tables) {
      const action = projectCloneAction(table);
      if (action === 'preserve' || action === 'identity' || action === 'regenerate') continue;
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
    remapProjectScopedDerivedIdentity(database, previousProjectId, nextProjectId);
    finalizeProjectClone(database, nextProjectId);
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

  async #bindRestoreOperation(
    requestId: string,
    input: RecoveryRestoreInput,
    parent: string,
    target: string,
  ): Promise<void> {
    const directory = path.join(this.#runtime.backupRootDirectory, input.projectId, '.operations');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const journalPath = path.join(directory, `restore-${requestId}.json`);
    const desired: RestoreOperationJournal = {
      schemaVersion: 1,
      requestId,
      sourceProjectId: input.projectId,
      backupId: input.backupId,
      targetParentDirectory: parent,
      targetPath: target,
    };
    const temporaryPath = `${journalPath}.partial-${this.#runtime.idFactory()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(desired, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      try {
        await link(temporaryPath, journalPath);
      } catch (error) {
        if (!isAlreadyExists(error)) throw error;
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }

    try {
      const details = await lstat(journalPath);
      if (!details.isFile() || details.isSymbolicLink()) {
        throw new Error('RESTORE_JOURNAL_FILE_INVALID');
      }
      const stored = restoreOperationJournal(
        JSON.parse(await readFile(journalPath, 'utf8')) as unknown,
      );
      if (
        !stored ||
        stored.requestId !== desired.requestId ||
        stored.sourceProjectId !== desired.sourceProjectId ||
        stored.backupId !== desired.backupId ||
        stored.targetParentDirectory !== desired.targetParentDirectory ||
        stored.targetPath !== desired.targetPath
      ) {
        throw new Error('RESTORE_JOURNAL_INTENT_MISMATCH');
      }
    } catch (error) {
      throw new RecoveryServiceError(
        'RESTORE_TARGET_CONFLICT',
        'The requestId belongs to a different restore target or backup.',
        { cause: error },
      );
    }
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

    const replay = await readFile(path.join(target, 'restore-request.json'), 'utf8')
      .then((content) => restoreRequestRecord(JSON.parse(content) as unknown))
      .catch(() => null);
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
      `${safePathComponent(sourceProject.name, 130)}-恢复-${input.backupId}`,
      '.worldforge',
    );
    const target = path.join(parent, directoryName);
    await this.#bindRestoreOperation(requestId, input, parent, target);
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
      const failures = await settleRecoveryCompensation([
        {
          label: 'restore-staging',
          run: () => rm(staging, { recursive: true, force: true }),
        },
        ...(targetCreated
          ? [
              {
                label: 'restore-target',
                run: () => rm(target, { recursive: true, force: true }),
              },
            ]
          : []),
      ]);
      rethrowRecoveryFailure(
        error,
        failures,
        'RESTORE_VERIFY_FAILED',
        'The restored copy failed verification.',
      );
    }
  }
}
