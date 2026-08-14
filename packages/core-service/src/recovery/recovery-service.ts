import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';

import {
  BackupPolicySchema,
  BackupRecordSchema,
  RecoveryCleanupApplyInputSchema,
  RecoveryDailyBackupInputSchema,
  type BackupCleanupPreview,
  type BackupPolicy,
  type BackupRecord,
  type RecoveryCleanupApplyInput,
  type RecoveryCleanupResult,
  type RecoveryCreateInput,
  type RecoveryDailyBackupInput,
  type RecoveryExportInput,
  type RecoveryNamedSnapshotInput,
  type RecoveryOverview,
  type RecoveryPolicyUpdateInput,
  type RecoveryProtectionInput,
  type RecoveryRestoreInput,
  type RecoveryRestoredProject,
  type RecoveryVersionExport,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import { BackupCreateOperations } from './backup-create.js';
import { BackupRestoreOperations } from './backup-restore.js';
import {
  RecoveryServiceError,
  createRecoveryRuntime,
  hashFile,
  readBackupMetadata,
  verifyDatabase,
  type RecoveryRuntime,
  type RecoveryServiceErrorCode,
  type RecoveryServiceOptions,
} from './backup-manifest.js';
import { IdempotentBackupCleanupOperations } from './idempotent-cleanup.js';
import {
  finalizeArtifactBackup,
  removeArtifactBackup,
  restoreArtifactBackup,
} from './project-artifact-backup.js';
import { VersionExportOperations } from './version-export.js';

export { RecoveryServiceError };
export type { RecoveryServiceErrorCode, RecoveryServiceOptions };

interface RecoveryCommandEntry {
  readonly fingerprint: string;
  readonly promise: Promise<unknown>;
  settled: boolean;
}

interface DailyBackupLaneEntry {
  readonly day: string;
  readonly promise: Promise<BackupRecord>;
}

interface DailyBackupArbitration {
  readonly winner: BackupRecord;
  readonly losers: readonly BackupRecord[];
}

const MAXIMUM_RETAINED_RECOVERY_COMMANDS = 1_000;
const dailyBackupLanes = new Map<string, DailyBackupLaneEntry>();

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

function backupRecordValues(record: BackupRecord): (string | number | null)[] {
  return [
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
  ];
}

export class RecoveryService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #runtime: RecoveryRuntime;
  readonly #create: BackupCreateOperations;
  readonly #cleanup: IdempotentBackupCleanupOperations;
  readonly #restore: BackupRestoreOperations;
  readonly #versionExport: VersionExportOperations;
  readonly #backupRootDirectory: string;
  readonly #now: () => Date;
  readonly #commands = new Map<string, RecoveryCommandEntry>();

  constructor(workspace: ProjectWorkspaceService, options: RecoveryServiceOptions) {
    this.#workspace = workspace;
    this.#backupRootDirectory = path.resolve(options.backupRootDirectory);
    this.#now = () => options.clock?.now() ?? new Date();
    this.#runtime = createRecoveryRuntime(workspace, options);
    this.#create = new BackupCreateOperations(this.#runtime);
    this.#cleanup = new IdempotentBackupCleanupOperations(this.#runtime);
    this.#restore = new BackupRestoreOperations(this.#runtime);
    this.#versionExport = new VersionExportOperations(this.#runtime);
  }

  createOperationCheckpoint(requestId: string, raw: RecoveryCreateInput): Promise<BackupRecord> {
    return this.#share('create-checkpoint', requestId, raw, 'BACKUP_CREATE_FAILED', async () =>
      this.#finalizeBackupArtifacts(await this.#create.createOperationCheckpoint(requestId, raw)),
    );
  }

  async createDailyBackup(requestId: string, raw: RecoveryDailyBackupInput): Promise<BackupRecord> {
    const input = RecoveryDailyBackupInputSchema.parse(raw);
    const day = this.#now().toISOString().slice(0, 10);
    const laneKey = stableJson({
      backupRootDirectory: this.#backupRootDirectory,
      projectId: input.projectId,
    });
    const existing = dailyBackupLanes.get(laneKey);
    if (existing?.day === day) return existing.promise;

    const execute = (): Promise<BackupRecord> =>
      this.#share('create-daily', requestId, input, 'BACKUP_CREATE_FAILED', async () => {
        const candidate = await this.#finalizeBackupArtifacts(
          await this.#create.createDailyBackup(requestId, input),
        );
        return this.#finalizeDailyWinner(input.projectId, day, candidate);
      });
    const operation = existing ? existing.promise.then(execute, execute) : execute();
    const entry: DailyBackupLaneEntry = { day, promise: operation };
    dailyBackupLanes.set(laneKey, entry);
    const clear = (): void => {
      if (dailyBackupLanes.get(laneKey) === entry) dailyBackupLanes.delete(laneKey);
    };
    void operation.then(clear, clear);
    return operation;
  }

  createNamedSnapshot(requestId: string, raw: RecoveryNamedSnapshotInput): Promise<BackupRecord> {
    return this.#share('create-named', requestId, raw, 'BACKUP_CREATE_FAILED', async () =>
      this.#finalizeBackupArtifacts(await this.#create.createNamedSnapshot(requestId, raw)),
    );
  }

  getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#workspace.assertActiveProject(projectId);
    if (project.databaseMode === 'read-write') this.#assertPersistedPolicyReadable(projectId);
    return this.#cleanup.getOverview(projectId);
  }

  updatePolicy(requestId: string, raw: RecoveryPolicyUpdateInput): Promise<BackupPolicy> {
    return this.#share('update-policy', requestId, raw, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.updatePolicy(requestId, raw),
    );
  }

  setProtection(requestId: string, raw: RecoveryProtectionInput): Promise<BackupRecord> {
    return this.#share('set-protection', requestId, raw, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.setProtection(requestId, raw),
    );
  }

  async previewCleanup(projectId: string): Promise<BackupCleanupPreview> {
    this.#assertCleanupPolicyReadable(projectId);
    return this.#cleanup.previewCleanup(projectId);
  }

  async applyCleanup(
    requestId: string,
    raw: RecoveryCleanupApplyInput,
  ): Promise<RecoveryCleanupResult> {
    const input = RecoveryCleanupApplyInputSchema.parse(raw);
    this.#assertCleanupPolicyReadable(input.projectId);
    return this.#share('apply-cleanup', requestId, input, 'BACKUP_CLEANUP_STALE', async () => {
      const result = await this.#cleanup.applyCleanup(requestId, input);
      await Promise.allSettled(
        result.deletedBackupIds.map((backupId) =>
          removeArtifactBackup(this.#backupRootDirectory, input.projectId, backupId),
        ),
      );
      return result;
    });
  }

  restoreCheckpoint(
    requestId: string,
    raw: RecoveryRestoreInput,
    targetParentDirectory: string,
  ): Promise<RecoveryRestoredProject> {
    return this.#share(
      'restore-checkpoint',
      requestId,
      { raw, targetParentDirectory },
      'RESTORE_TARGET_CONFLICT',
      async () => {
        const input = raw;
        const metadata = (await readBackupMetadata(this.#runtime, input.projectId)).find(
          (record) => record.backupId === input.backupId,
        );
        if (!metadata) {
          throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The checkpoint was not found.');
        }
        const restored = await this.#restore.restoreCheckpoint(requestId, raw, targetParentDirectory);
        try {
          await restoreArtifactBackup(this.#runtime, metadata, restored.workspacePath);
          return restored;
        } catch (error) {
          throw error instanceof RecoveryServiceError
            ? error
            : new RecoveryServiceError(
                'RESTORE_VERIFY_FAILED',
                'Managed project artifacts could not be restored completely.',
                { cause: error },
              );
        }
      },
    );
  }

  exportVersion(raw: RecoveryExportInput, targetDirectory: string): Promise<RecoveryVersionExport> {
    return this.#versionExport.exportVersion(raw, targetDirectory);
  }

  async #finalizeBackupArtifacts(record: BackupRecord): Promise<BackupRecord> {
    try {
      return await finalizeArtifactBackup(this.#runtime, record);
    } catch (error) {
      await this.#discardIncompleteBackup(record);
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'Managed project artifacts could not be captured completely.',
        { cause: error },
      );
    }
  }

  async #discardIncompleteBackup(record: BackupRecord): Promise<void> {
    await Promise.allSettled([
      this.#workspace.writeProject(randomUUID(), record.projectId, (database) => {
        database
          .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
          .run(record.backupId, record.projectId);
      }),
      rm(path.join(this.#backupRootDirectory, record.projectId, record.backupFileName), {
        force: true,
      }),
      rm(path.join(this.#backupRootDirectory, record.projectId, `${record.backupId}.json`), {
        force: true,
      }),
      removeArtifactBackup(this.#backupRootDirectory, record.projectId, record.backupId),
    ]);
  }

  async #finalizeDailyWinner(
    projectId: string,
    day: string,
    candidate: BackupRecord,
  ): Promise<BackupRecord> {
    if (
      candidate.projectId !== projectId ||
      candidate.track !== 'daily' ||
      candidate.createdAt.slice(0, 10) !== day
    ) {
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'The daily backup candidate does not match its project and date.',
      );
    }
    const candidatePath = path.join(
      this.#backupRootDirectory,
      projectId,
      candidate.backupFileName,
    );
    if ((await hashFile(candidatePath)) !== candidate.sha256) {
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'The daily backup candidate does not match its recorded hash.',
      );
    }
    verifyDatabase(candidatePath, projectId);

    const arbitration = await this.#workspace.writeProject(
      randomUUID(),
      projectId,
      (database): DailyBackupArbitration => {
        database
          .prepare(
            `INSERT INTO backup_records(
               id, project_id, operation, backup_file_name, size_bytes, sha256,
               created_at, verified_at, backup_track, display_name, note,
               author_protected, migration_protected, schema_version
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO NOTHING`,
          )
          .run(...backupRecordValues(candidate));
        const rows = database
          .prepare(
            `SELECT id AS backupId, project_id AS projectId, operation,
                    backup_file_name AS backupFileName, size_bytes AS sizeBytes, sha256,
                    created_at AS createdAt, verified_at AS verifiedAt,
                    backup_track AS track, display_name AS displayName, note,
                    author_protected AS authorProtected,
                    migration_protected AS migrationProtected, schema_version AS schemaVersion
               FROM backup_records
              WHERE project_id = ?
                AND backup_track = 'daily'
                AND substr(created_at, 1, 10) = ?
              ORDER BY rowid ASC`,
          )
          .all(projectId, day)
          .map((row) => backupRecordFromRow(row as Record<string, unknown>));
        const winner = rows[0];
        if (!winner) {
          throw new RecoveryServiceError(
            'BACKUP_VERIFY_FAILED',
            'Daily backup arbitration did not produce a winner.',
          );
        }
        const losers = rows.slice(1);
        const remove = database.prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?');
        for (const loser of losers) remove.run(loser.backupId, projectId);
        database
          .prepare(
            `UPDATE backup_failures
                SET resolved_at = ?
              WHERE project_id = ? AND backup_track = 'daily' AND resolved_at IS NULL`,
          )
          .run(winner.verifiedAt, projectId);
        return { winner, losers };
      },
      { operation: 'recovery.daily-winner', day },
    );

    await Promise.allSettled(
      arbitration.losers.map(async (loser) => {
        const directory = path.join(this.#backupRootDirectory, projectId);
        await Promise.all([
          rm(path.join(directory, loser.backupFileName), { force: true }),
          rm(path.join(directory, `${loser.backupId}.json`), { force: true }),
          removeArtifactBackup(this.#backupRootDirectory, projectId, loser.backupId),
        ]);
      }),
    );
    return arbitration.winner;
  }

  #assertPersistedPolicyReadable(projectId: string): void {
    this.#workspace.readProject(projectId, (database) => {
      const row = database
        .prepare(
          `SELECT project_id AS projectId, policy_version AS policyVersion,
                  daily_retention_count AS dailyRetentionCount,
                  major_retention_count AS majorRetentionCount,
                  major_retention_days AS majorRetentionDays,
                  quota_bytes AS quotaBytes, updated_at AS updatedAt
             FROM backup_policies WHERE project_id = ?`,
        )
        .get(projectId);
      this.#parsePersistedPolicy(projectId, row);
    });
  }

  #assertCleanupPolicyReadable(projectId: string): void {
    this.#workspace.assertActiveProject(projectId, true);
    try {
      this.#assertPersistedPolicyReadable(projectId);
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'BACKUP_CLEANUP_STALE',
        'Backup cleanup is disabled because the retention policy cannot be read safely.',
        { cause: error },
      );
    }
  }

  #parsePersistedPolicy(projectId: string, row: Record<string, unknown> | undefined): void {
    if (!row) return;
    try {
      BackupPolicySchema.parse({
        projectId: String(row.projectId),
        policyVersion: Number(row.policyVersion),
        dailyRetentionCount: Number(row.dailyRetentionCount),
        majorRetentionCount: Number(row.majorRetentionCount),
        majorRetentionDays: Number(row.majorRetentionDays),
        quotaBytes: Number(row.quotaBytes),
        updatedAt: String(row.updatedAt),
      });
    } catch (error) {
      throw new RecoveryServiceError(
        'BACKUP_CLEANUP_STALE',
        `The persisted backup policy for project ${projectId} is invalid.`,
        { cause: error },
      );
    }
  }

  #share<T>(
    operation: string,
    requestId: string,
    input: unknown,
    conflictCode: RecoveryServiceErrorCode,
    execute: () => Promise<T>,
  ): Promise<T> {
    const key = `${operation}:${requestId}`;
    const fingerprint = stableJson(input);
    const existing = this.#commands.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        return Promise.reject(
          new RecoveryServiceError(
            conflictCode,
            'The requestId was already used with different recovery command input.',
          ),
        );
      }
      return existing.promise as Promise<T>;
    }

    const promise = Promise.resolve().then(execute);
    const entry: RecoveryCommandEntry = { fingerprint, promise, settled: false };
    this.#commands.set(key, entry);
    void promise.then(
      () => {
        if (this.#commands.get(key) !== entry) return;
        entry.settled = true;
        this.#trimSettledCommands();
      },
      () => {
        if (this.#commands.get(key) === entry) this.#commands.delete(key);
      },
    );
    this.#trimSettledCommands();
    return promise;
  }

  #trimSettledCommands(): void {
    while (this.#commands.size > MAXIMUM_RETAINED_RECOVERY_COMMANDS) {
      const settled = [...this.#commands.entries()].find(([, entry]) => entry.settled);
      if (!settled) return;
      this.#commands.delete(settled[0]);
    }
  }
}
