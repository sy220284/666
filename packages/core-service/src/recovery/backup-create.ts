import { chmod, lstat, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
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
import { safeFileName, safeTemporaryName } from './path-name.js';
import { acquireFileLease } from './file-lease.js';
import {
  rethrowRecoveryFailure,
  settleRecoveryCompensation,
} from './recovery-compensation.js';

interface BackupClassification {
  readonly track: BackupRecord['track'];
  readonly displayName: string | null;
  readonly note: string | null;
  readonly authorProtected: boolean;
  readonly migrationProtected: boolean;
}

function backupRecordFromRow(row: Record<string, unknown>): BackupRecord {
  return BackupRecordSchema.parse({
    ...row,
    sizeBytes: Number(row.sizeBytes),
    authorProtected: Number(row.authorProtected) === 1,
    migrationProtected: Number(row.migrationProtected) === 1,
    schemaVersion: Number(row.schemaVersion),
    protectionReasons: [],
  });
}

function samePersistedRecord(left: BackupRecord, right: BackupRecord): boolean {
  return (
    left.backupId === right.backupId &&
    left.projectId === right.projectId &&
    left.operation === right.operation &&
    left.backupFileName === right.backupFileName &&
    left.sizeBytes === right.sizeBytes &&
    left.sha256 === right.sha256 &&
    left.createdAt === right.createdAt &&
    left.verifiedAt === right.verifiedAt &&
    left.track === right.track &&
    left.displayName === right.displayName &&
    left.note === right.note &&
    left.authorProtected === right.authorProtected &&
    left.migrationProtected === right.migrationProtected &&
    left.schemaVersion === right.schemaVersion
  );
}

function sameIntent(
  record: BackupRecord,
  input: RecoveryCreateInput,
  classification: BackupClassification,
): boolean {
  return (
    record.projectId === input.projectId &&
    record.operation === input.operation &&
    record.track === classification.track &&
    record.displayName === classification.displayName &&
    record.note === classification.note &&
    record.authorProtected === classification.authorProtected &&
    record.migrationProtected === classification.migrationProtected
  );
}

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
    const lease = await acquireFileLease(lockPath, this.#runtime.dailyBackupLeaseTiming);
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
        () => lease.assertOwner(),
      );
    } finally {
      await lease.release();
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
    classification: BackupClassification,
    assertOwnership?: () => Promise<void>,
  ): Promise<BackupRecord> {
    try {
      return await this.#createBackup(requestId, input, classification, assertOwnership);
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

  #readDatabaseRecord(projectId: string, backupId: string): BackupRecord | null {
    return this.#runtime.workspace.readProject(projectId, (database) => {
      const row = database
        .prepare(
          `SELECT id AS backupId, project_id AS projectId, operation,
                  backup_file_name AS backupFileName, size_bytes AS sizeBytes, sha256,
                  created_at AS createdAt, verified_at AS verifiedAt,
                  backup_track AS track, display_name AS displayName, note,
                  author_protected AS authorProtected,
                  migration_protected AS migrationProtected, schema_version AS schemaVersion
             FROM backup_records
            WHERE id = ? AND project_id = ?`,
        )
        .get(backupId, projectId) as Record<string, unknown> | undefined;
      return row ? backupRecordFromRow(row) : null;
    });
  }

  async #writeMetadata(projectName: string, record: BackupRecord, metadataPath: string): Promise<void> {
    const metadata: BackupMetadata = { ...record, sourceWorkspaceName: projectName };
    const partialPath = `${metadataPath}.repair-${this.#runtime.idFactory()}`;
    try {
      await writeFile(partialPath, `${JSON.stringify(metadata, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await rename(partialPath, metadataPath);
    } finally {
      await rm(partialPath, { force: true });
    }
  }

  async #registerRecord(requestId: string, record: BackupRecord): Promise<void> {
    await this.#runtime.workspace.writeProject(requestId, record.projectId, (database) => {
      database
        .prepare(
          `INSERT INTO backup_records(
               id, project_id, operation, backup_file_name, size_bytes, sha256,
               created_at, verified_at, backup_track, display_name, note,
               author_protected, migration_protected, schema_version
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
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
      const row = database
        .prepare(
          `SELECT id AS backupId, project_id AS projectId, operation,
                  backup_file_name AS backupFileName, size_bytes AS sizeBytes, sha256,
                  created_at AS createdAt, verified_at AS verifiedAt,
                  backup_track AS track, display_name AS displayName, note,
                  author_protected AS authorProtected,
                  migration_protected AS migrationProtected, schema_version AS schemaVersion
             FROM backup_records
            WHERE id = ? AND project_id = ?`,
        )
        .get(record.backupId, record.projectId) as Record<string, unknown> | undefined;
      if (!row || !samePersistedRecord(backupRecordFromRow(row), record)) {
        throw new RecoveryServiceError(
          'BACKUP_VERIFY_FAILED',
          'The backup database registration does not match its verified files.',
        );
      }
      database
        .prepare(
          `UPDATE backup_failures
                SET resolved_at = ?
              WHERE project_id = ? AND backup_track = ? AND resolved_at IS NULL`,
        )
        .run(record.verifiedAt, record.projectId, record.track);
    });
  }

  async #existingBackup(
    requestId: string,
    input: RecoveryCreateInput,
    classification: BackupClassification,
    projectName: string,
    backupPath: string,
    metadataPath: string,
  ): Promise<BackupRecord | null> {
    const metadataRecord = (await readBackupMetadata(this.#runtime, input.projectId)).find(
      (record) => record.backupId === requestId,
    );
    const databaseRecord = this.#readDatabaseRecord(input.projectId, requestId);
    if (metadataRecord && databaseRecord && !samePersistedRecord(metadataRecord, databaseRecord)) {
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'The backup metadata and database registration do not match.',
      );
    }
    const record = metadataRecord ?? databaseRecord;
    if (!record) return null;
    if (
      record.backupFileName !== path.basename(backupPath) ||
      !sameIntent(record, input, classification)
    ) {
      throw new RecoveryServiceError(
        'BACKUP_CREATE_FAILED',
        'The requestId was already used for a different backup operation.',
      );
    }
    try {
      if ((await hashFile(backupPath)) !== record.sha256) {
        throw new RecoveryServiceError(
          'BACKUP_VERIFY_FAILED',
          'The replayed backup file does not match its recorded hash.',
        );
      }
      verifyDatabase(backupPath, input.projectId);
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'The replayed backup is unavailable.', {
        cause: error,
      });
    }
    if (!metadataRecord) await this.#writeMetadata(projectName, record, metadataPath);
    if (!databaseRecord) await this.#registerRecord(this.#runtime.idFactory(), record);
    return record;
  }

  async #createBackup(
    requestId: string,
    input: RecoveryCreateInput,
    classification: BackupClassification,
    assertOwnership?: () => Promise<void>,
  ): Promise<BackupRecord> {
    const project = this.#runtime.workspace.assertActiveProject(input.projectId, true);
    const sourceDatabasePath = path.join(project.workspacePath, 'project.sqlite');
    const backupDirectory = path.join(this.#runtime.backupRootDirectory, input.projectId);
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);

    const backupId = requestId;
    const fileName = safeFileName(`backup-${backupId}`, '.sqlite');
    const finalPath = path.join(backupDirectory, fileName);
    const metadataPath = path.join(backupDirectory, `${backupId}.json`);
    const existing = await this.#existingBackup(
      requestId,
      input,
      classification,
      project.name,
      finalPath,
      metadataPath,
    );
    if (existing) return existing;

    try {
      await lstat(finalPath);
      await rm(finalPath, { force: true });
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await rm(metadataPath, { force: true });

    const sourceBytes = BigInt((await stat(sourceDatabasePath)).size);
    const requiredBytes = sourceBytes * 2n + 1_048_576n;
    if ((await this.#runtime.freeBytes(backupDirectory)) < requiredBytes) {
      throw new RecoveryServiceError(
        'BACKUP_SPACE_LOW',
        'There is not enough space for a verified checkpoint.',
      );
    }

    const createdAt = this.#runtime.clock.now().toISOString();
    const partialName = safeTemporaryName(fileName, `.partial-${this.#runtime.idFactory()}`);
    const partialPath = path.join(backupDirectory, partialName);
    const metadataPartialPath = `${metadataPath}.partial-${this.#runtime.idFactory()}`;
    let finalBackupCreated = false;
    let finalMetadataCreated = false;
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
      await assertOwnership?.();
      await rename(partialPath, finalPath);
      finalBackupCreated = true;
      await rename(metadataPartialPath, metadataPath);
      finalMetadataCreated = true;
      await assertOwnership?.();
      await this.#registerRecord(requestId, record);
      return record;
    } catch (error) {
      const failures = await settleRecoveryCompensation([
        {
          label: 'backup-partial',
          run: () => rm(partialPath, { force: true }),
        },
        {
          label: 'backup-metadata-partial',
          run: () => rm(metadataPartialPath, { force: true }),
        },
        ...(finalBackupCreated
          ? [
              {
                label: 'backup-final',
                run: () => rm(finalPath, { force: true }),
              },
            ]
          : []),
        ...(finalMetadataCreated
          ? [
              {
                label: 'backup-metadata-final',
                run: () => rm(metadataPath, { force: true }),
              },
            ]
          : []),
      ]);
      rethrowRecoveryFailure(
        error,
        failures,
        'BACKUP_CREATE_FAILED',
        'The operation checkpoint could not be created.',
      );
    }
  }
}
