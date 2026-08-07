import {
  BackupFailureRecordSchema,
  BackupPolicySchema,
  RecoveryCleanupApplyInputSchema,
  RecoveryDailyBackupInputSchema,
  RecoveryVersionSummarySchema,
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
import path from 'node:path';

import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import { BackupCreateOperations } from './backup-create.js';
import { BackupRestoreOperations } from './backup-restore.js';
import {
  RecoveryServiceError,
  createRecoveryRuntime,
  type RecoveryServiceErrorCode,
  type RecoveryServiceOptions,
} from './backup-manifest.js';
import { IdempotentBackupCleanupOperations } from './idempotent-cleanup.js';
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

const MAXIMUM_RETAINED_RECOVERY_COMMANDS = 1_000;
const dailyBackupLanes = new Map<string, DailyBackupLaneEntry>();

export class RecoveryService {
  readonly #workspace: ProjectWorkspaceService;
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
    const runtime = createRecoveryRuntime(workspace, options);
    this.#create = new BackupCreateOperations(runtime);
    this.#cleanup = new IdempotentBackupCleanupOperations(runtime);
    this.#restore = new BackupRestoreOperations(runtime);
    this.#versionExport = new VersionExportOperations(runtime);
  }

  createOperationCheckpoint(requestId: string, raw: RecoveryCreateInput): Promise<BackupRecord> {
    return this.#share('create-checkpoint', requestId, raw, 'BACKUP_CREATE_FAILED', () =>
      this.#create.createOperationCheckpoint(requestId, raw),
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
      this.#share('create-daily', requestId, input, 'BACKUP_CREATE_FAILED', () =>
        this.#create.createDailyBackup(requestId, input),
      );
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
    return this.#share('create-named', requestId, raw, 'BACKUP_CREATE_FAILED', () =>
      this.#create.createNamedSnapshot(requestId, raw),
    );
  }

  getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#workspace.assertActiveProject(projectId);
    if (project.databaseMode === 'read-write') {
      this.#workspace.readProject(projectId, (database) => {
        database
          .prepare(
            `SELECT id AS failureId, project_id AS projectId, operation,
                    backup_track AS track, error_code AS errorCode,
                    occurred_at AS occurredAt, resolved_at AS resolvedAt
               FROM backup_failures
              WHERE project_id = ? AND resolved_at IS NULL
              ORDER BY occurred_at DESC, id DESC
              LIMIT 20`,
          )
          .all(projectId)
          .forEach((row) => BackupFailureRecordSchema.parse(row));

        database
          .prepare(
            `SELECT v.id AS versionId, c.id AS chapterId, c.title AS chapterTitle,
                    v.title AS versionTitle, v.word_count AS wordCount,
                    v.created_at AS createdAt,
                    CASE WHEN c.final_version_id = v.id THEN 1 ELSE 0 END AS finalized
               FROM versions v
               JOIN chapters c ON c.id = v.chapter_id
               JOIN volumes vo ON vo.id = c.volume_id
              WHERE vo.project_id = ?
              ORDER BY v.created_at DESC, v.id DESC`,
          )
          .all(projectId)
          .forEach((row) =>
            RecoveryVersionSummarySchema.parse({
              versionId: String(row.versionId),
              chapterId: String(row.chapterId),
              chapterTitle: String(row.chapterTitle),
              title: String(row.versionTitle),
              wordCount: Number(row.wordCount),
              createdAt: String(row.createdAt),
              finalized: Number(row.finalized) === 1,
            }),
          );

        this.#parsePersistedPolicy(
          projectId,
          database
            .prepare(
              `SELECT project_id AS projectId, policy_version AS policyVersion,
                      daily_retention_count AS dailyRetentionCount,
                      major_retention_count AS majorRetentionCount,
                      major_retention_days AS majorRetentionDays,
                      quota_bytes AS quotaBytes, updated_at AS updatedAt
                 FROM backup_policies WHERE project_id = ?`,
            )
            .get(projectId),
        );
      });
    }
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
    return this.#share('apply-cleanup', requestId, input, 'BACKUP_CLEANUP_STALE', () =>
      this.#cleanup.applyCleanup(requestId, input),
    );
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
      () => this.#restore.restoreCheckpoint(requestId, raw, targetParentDirectory),
    );
  }

  exportVersion(raw: RecoveryExportInput, targetDirectory: string): Promise<RecoveryVersionExport> {
    return this.#versionExport.exportVersion(raw, targetDirectory);
  }

  #assertCleanupPolicyReadable(projectId: string): void {
    this.#workspace.assertActiveProject(projectId, true);
    try {
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
