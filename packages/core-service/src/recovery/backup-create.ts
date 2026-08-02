import { chmod, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BackupFailureRecordSchema,
  BackupRecordSchema,
  RecoveryCreateInputSchema,
  RecoveryDailyBackupInputSchema,
  RecoveryNamedSnapshotInputSchema,
  type BackupFailureCode,
  type BackupRecord,
  type RecoveryCreateInput,
  type RecoveryDailyBackupInput,
  type RecoveryNamedSnapshotInput,
} from '@worldforge/contracts';

import {
  RecoveryServiceError,
  hashFile,
  isMissing,
  readBackupMetadata,
  verifyDatabase,
  type BackupMetadata,
  type RecoveryRuntime,
} from './backup-manifest.js';

export class BackupCreateOperations {
  readonly #runtime: RecoveryRuntime;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
  }

  async createOperationCheckpoint(
    requestId: string,
    raw: RecoveryCreateInput,
  ): Promise<BackupRecord> {
    const input = RecoveryCreateInputSchema.parse(raw);
    const named = input.operation === 'manual-protection';
    return this.#createTrackedBackup(requestId, input, {
      track: named ? 'named' : 'major',
      displayName: named ? '手动恢复点' : null,
      note: null,
      authorProtected: named,
      migrationProtected: input.operation === 'migration',
    });
  }

  async createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {
    const input = RecoveryDailyBackupInputSchema.parse(raw);
    const today = this.#runtime.clock.now().toISOString().slice(0, 10);
    const backupDirectory = path.join(this.#runtime.backupRootDirectory, input.projectId);
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);
    const lockPath = path.join(backupDirectory, `.daily-${today}.lock`);
    const startedAt = Date.now();
    let lock: Awaited<ReturnType<typeof open>>;
    for (;;) {
      try {
        lock = await open(lockPath, 'wx', 0o600);
        break;
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
        if (Date.now() - startedAt >= 30_000) {
          try {
            const details = await stat(lockPath);
            if (Date.now() - details.mtimeMs >= 30_000) {
              await rm(lockPath, { force: true });
              continue;
            }
          } catch (lockError) {
            if (isMissing(lockError)) continue;
            throw lockError;
          }
          throw new RecoveryServiceError(
            'BACKUP_CREATE_FAILED',
            'Daily backup coordination timed out.',
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    try {
      const existing = (await readBackupMetadata(this.#runtime, input.projectId)).find(
        (record) => record.track === 'daily' && record.createdAt.slice(0, 10) === today,
      );
      if (existing) return existing;
      return await this.#createTrackedBackup(
        requestId,
        { projectId: input.projectId, operation: 'manual-protection' },
        {
          track: 'daily',
          displayName: null,
          note: null,
          authorProtected: false,
          migrationProtected: false,
        },
      );
    } finally {
      await lock.close();
      await rm(lockPath, { force: true });
    }
  }

  async createNamedSnapshot(
    requestId: string,
    raw: RecoveryNamedSnapshotInput,
  ): Promise<BackupRecord> {
    const input = RecoveryNamedSnapshotInputSchema.parse(raw);
    return this.#createTrackedBackup(
      requestId,
      { projectId: input.projectId, operation: 'manual-protection' },
      {
        track: 'named',
        displayName: input.name,
        note: input.note ?? null,
        authorProtected: true,
        migrationProtected: false,
      },
    );
  }

  async #createTrackedBackup(
    requestId: string,
    input: RecoveryCreateInput,
    classification: {
      readonly track: BackupRecord['track'];
      readonly displayName: string | null;
      readonly note: string | null;
      readonly authorProtected: boolean;
      readonly migrationProtected: boolean;
    },
  ): Promise<BackupRecord> {
    try {
      return await this.#createBackup(requestId, input, classification);
    } catch (error) {
      await this.#recordBackupFailure(input, classification.track, error);
      throw error;
    }
  }

  async #recordBackupFailure(
    input: RecoveryCreateInput,
    track: BackupRecord['track'],
    error: unknown,
  ): Promise<void> {
    const allowed = new Set<BackupFailureCode>([
      'BACKUP_CREATE_FAILED',
      'BACKUP_VERIFY_FAILED',
      'BACKUP_SPACE_LOW',
    ]);
    const errorCode =
      error instanceof RecoveryServiceError && allowed.has(error.code as BackupFailureCode)
        ? (error.code as BackupFailureCode)
        : 'BACKUP_CREATE_FAILED';
    const failure = BackupFailureRecordSchema.parse({
      failureId: this.#runtime.idFactory(),
      projectId: input.projectId,
      operation: input.operation,
      track,
      errorCode,
      occurredAt: this.#runtime.clock.now().toISOString(),
      resolvedAt: null,
    });
    try {
      await this.#runtime.workspace.writeProject(
        this.#runtime.idFactory(),
        input.projectId,
        (database) => {
          database
            .prepare(
              `INSERT INTO backup_failures(
                 id, project_id, operation, backup_track, error_code, occurred_at, resolved_at
               ) VALUES(?, ?, ?, ?, ?, ?, NULL)`,
            )
            .run(
              failure.failureId,
              failure.projectId,
              failure.operation,
              failure.track,
              failure.errorCode,
              failure.occurredAt,
            );
        },
      );
    } catch {
      // Best effort only: the original backup failure remains authoritative.
    }
  }

  async #createBackup(
    requestId: string,
    input: RecoveryCreateInput,
    classification: {
      readonly track: BackupRecord['track'];
      readonly displayName: string | null;
      readonly note: string | null;
      readonly authorProtected: boolean;
      readonly migrationProtected: boolean;
    },
  ): Promise<BackupRecord> {
    const project = this.#runtime.workspace.assertActiveProject(input.projectId, true);
    const sourceDatabasePath = path.join(project.workspacePath, 'project.sqlite');
    const backupDirectory = path.join(this.#runtime.backupRootDirectory, input.projectId);
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);
    const sourceBytes = BigInt((await stat(sourceDatabasePath)).size);
    const requiredBytes = sourceBytes * 2n + 1_048_576n;
    if ((await this.#runtime.freeBytes(backupDirectory)) < requiredBytes) {
      throw new RecoveryServiceError(
        'BACKUP_SPACE_LOW',
        'There is not enough space for a verified checkpoint.',
      );
    }

    const backupId = this.#runtime.idFactory();
    const createdAt = this.#runtime.clock.now().toISOString();
    const fileName = `${createdAt.replaceAll(':', '-').replaceAll('.', '-')}-${input.operation}-${backupId}.sqlite`;
    const finalPath = path.join(backupDirectory, fileName);
    const partialPath = `${finalPath}.partial`;
    const metadataPath = path.join(backupDirectory, `${backupId}.json`);
    const metadataPartialPath = `${metadataPath}.partial`;
    try {
      await this.#runtime.onlineBackup(sourceDatabasePath, partialPath);
      await this.#runtime.afterBackupCreated?.(partialPath);
      verifyDatabase(partialPath, input.projectId);
      const sha256 = await hashFile(partialPath);
      const sizeBytes = (await stat(partialPath)).size;
      const verifiedAt = this.#runtime.clock.now().toISOString();
      const record = BackupRecordSchema.parse({
        backupId,
        projectId: input.projectId,
        operation: input.operation,
        backupFileName: fileName,
        sizeBytes,
        sha256,
        createdAt,
        verifiedAt,
        track: classification.track,
        displayName: classification.displayName,
        note: classification.note,
        authorProtected: classification.authorProtected,
        migrationProtected: classification.migrationProtected,
        schemaVersion: project.schemaVersion,
        protectionReasons: [
          ...(classification.authorProtected ? ['author-protected'] : []),
          ...(classification.migrationProtected ? ['migration-protected'] : []),
        ],
      });
      const metadata: BackupMetadata = { ...record, sourceWorkspaceName: project.name };
      await chmod(partialPath, 0o600);
      await writeFile(metadataPartialPath, `${JSON.stringify(metadata, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await rename(partialPath, finalPath);
      await rename(metadataPartialPath, metadataPath);
      try {
        await this.#runtime.workspace.writeProject(requestId, input.projectId, (database) => {
          database
            .prepare(
              `INSERT INTO backup_records(
                   id, project_id, operation, backup_file_name, size_bytes, sha256,
                   created_at, verified_at, backup_track, display_name, note,
                   author_protected, migration_protected, schema_version
                 ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              record.backupId,
              record.projectId,
              record.operation,
              record.backupFileName,
              record.sizeBytes,
              record.sha256,
              record.createdAt,
              record.verifiedAt,
              record.track,
              record.displayName,
              record.note,
              record.authorProtected ? 1 : 0,
              record.migrationProtected ? 1 : 0,
              record.schemaVersion,
            );
          database
            .prepare(
              `UPDATE backup_failures
                    SET resolved_at = ?
                  WHERE project_id = ? AND backup_track = ? AND resolved_at IS NULL`,
            )
            .run(record.verifiedAt, record.projectId, record.track);
        });
      } catch (error) {
        await Promise.all([rm(finalPath, { force: true }), rm(metadataPath, { force: true })]);
        throw error;
      }
      return record;
    } catch (error) {
      await Promise.all([
        rm(partialPath, { force: true }),
        rm(metadataPartialPath, { force: true }),
      ]);
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'BACKUP_CREATE_FAILED',
        'The operation checkpoint could not be created.',
        { cause: error },
      );
    }
  }
}
