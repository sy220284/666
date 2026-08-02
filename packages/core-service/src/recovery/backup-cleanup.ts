import { rename, rm } from 'node:fs/promises';
import path from 'node:path';

import {
  BackupCleanupPreviewSchema,
  BackupFailureRecordSchema,
  BackupPolicySchema,
  BackupRecordSchema,
  RecoveryCleanupApplyInputSchema,
  RecoveryCleanupResultSchema,
  RecoveryDailyBackupInputSchema,
  RecoveryOverviewSchema,
  RecoveryPolicyUpdateInputSchema,
  RecoveryProtectionInputSchema,
  type BackupCleanupItem,
  type BackupCleanupPreview,
  type BackupFailureRecord,
  type BackupPolicy,
  type BackupRecord,
  type RecoveryCleanupApplyInput,
  type RecoveryCleanupResult,
  type RecoveryOverview,
  type RecoveryPolicyUpdateInput,
  type RecoveryProtectionInput,
} from '@worldforge/contracts';

import {
  RecoveryServiceError,
  planHash,
  protectionReasons,
  readBackupMetadata,
  readBackupPolicy,
  rewriteBackupMetadata,
  type RecoveryRuntime,
} from './backup-manifest.js';

export class BackupCleanupOperations {
  readonly #runtime: RecoveryRuntime;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
  }

  async getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#runtime.workspace.assertActiveProject(projectId);
    const rawCheckpoints = await readBackupMetadata(this.#runtime, projectId);
    const lastVerifiedBackupId = rawCheckpoints[0]?.backupId;
    const checkpoints = rawCheckpoints.map((record) =>
      BackupRecordSchema.parse({
        ...record,
        protectionReasons: protectionReasons(record, lastVerifiedBackupId),
      }),
    );
    const backupFailures: BackupFailureRecord[] = (() => {
      try {
        return this.#runtime.workspace.readProject(projectId, (database) =>
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
            .map((row) => BackupFailureRecordSchema.parse(row)),
        );
      } catch {
        return [];
      }
    })();
    const policy = readBackupPolicy(this.#runtime, projectId);
    const space = {
      totalBytes: checkpoints.reduce((total, record) => total + record.sizeBytes, 0),
      dailyBytes: checkpoints
        .filter((record) => record.track === 'daily')
        .reduce((total, record) => total + record.sizeBytes, 0),
      majorBytes: checkpoints
        .filter((record) => record.track === 'major')
        .reduce((total, record) => total + record.sizeBytes, 0),
      namedBytes: checkpoints
        .filter((record) => record.track === 'named')
        .reduce((total, record) => total + record.sizeBytes, 0),
      quotaBytes: policy.quotaBytes,
    };
    let exportableVersions: RecoveryOverview['exportableVersions'];
    try {
      exportableVersions = this.#runtime.workspace.readProject(projectId, (database) =>
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
          .map((row) => ({
            versionId: String(row.versionId),
            chapterId: String(row.chapterId),
            chapterTitle: String(row.chapterTitle),
            title: String(row.versionTitle),
            wordCount: Number(row.wordCount),
            createdAt: String(row.createdAt),
            finalized: Number(row.finalized) === 1,
          })),
      );
    } catch {
      exportableVersions = [];
    }
    return RecoveryOverviewSchema.parse({
      projectId,
      databaseMode: project.databaseMode,
      readOnlyReason: project.readOnlyReason,
      checkpoints,
      backupFailures,
      policy,
      space,
      exportableVersions,
    });
  }

  updatePolicy(requestId: string, raw: RecoveryPolicyUpdateInput): Promise<BackupPolicy> {
    const input = RecoveryPolicyUpdateInputSchema.parse(raw);
    const updatedAt = this.#runtime.clock.now().toISOString();
    return this.#runtime.workspace.writeProject(requestId, input.projectId, (database) => {
      const previous = database
        .prepare(
          `SELECT policy_version AS policyVersion
               FROM backup_policies WHERE project_id = ?`,
        )
        .get(input.projectId) as { policyVersion: number | bigint } | undefined;
      const policyVersion = Number(previous?.policyVersion ?? 0) + 1;
      database
        .prepare(
          `INSERT INTO backup_policies(
               project_id, policy_version, daily_retention_count, major_retention_count,
               major_retention_days, quota_bytes, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(project_id) DO UPDATE SET
               policy_version = excluded.policy_version,
               daily_retention_count = excluded.daily_retention_count,
               major_retention_count = excluded.major_retention_count,
               major_retention_days = excluded.major_retention_days,
               quota_bytes = excluded.quota_bytes,
               updated_at = excluded.updated_at`,
        )
        .run(
          input.projectId,
          policyVersion,
          input.dailyRetentionCount,
          input.majorRetentionCount,
          input.majorRetentionDays,
          input.quotaBytes,
          updatedAt,
        );
      return BackupPolicySchema.parse({
        projectId: input.projectId,
        policyVersion,
        dailyRetentionCount: input.dailyRetentionCount,
        majorRetentionCount: input.majorRetentionCount,
        majorRetentionDays: input.majorRetentionDays,
        quotaBytes: input.quotaBytes,
        updatedAt,
      });
    });
  }

  async setProtection(requestId: string, raw: RecoveryProtectionInput): Promise<BackupRecord> {
    const input = RecoveryProtectionInputSchema.parse(raw);
    if (!input.protected && input.confirmationBackupId !== input.backupId) {
      throw new RecoveryServiceError(
        'BACKUP_PROTECTED',
        'Unprotecting a backup requires explicit backup-id confirmation.',
      );
    }
    const records = await readBackupMetadata(this.#runtime, input.projectId);
    const record = records.find((candidate) => candidate.backupId === input.backupId);
    if (!record) throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The backup was not found.');
    const updated = BackupRecordSchema.parse({
      ...record,
      authorProtected: input.protected,
      protectionReasons: protectionReasons(
        { ...record, authorProtected: input.protected },
        records[0]?.backupId,
      ),
    });
    await this.#runtime.workspace.writeProject(requestId, input.projectId, (database) => {
      const result = database
        .prepare(
          `UPDATE backup_records SET author_protected = ?
              WHERE id = ? AND project_id = ?`,
        )
        .run(input.protected ? 1 : 0, input.backupId, input.projectId);
      if (Number(result.changes) !== 1) {
        throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The backup was not found.');
      }
    });
    try {
      await rewriteBackupMetadata(this.#runtime, updated);
    } catch (error) {
      await this.#runtime.workspace.writeProject(
        this.#runtime.idFactory(),
        input.projectId,
        (database) => {
          database
            .prepare(
              `UPDATE backup_records SET author_protected = ?
                WHERE id = ? AND project_id = ?`,
            )
            .run(record.authorProtected ? 1 : 0, input.backupId, input.projectId);
        },
      );
      throw new RecoveryServiceError(
        'BACKUP_CREATE_FAILED',
        'The backup protection metadata could not be updated atomically.',
        { cause: error },
      );
    }
    return updated;
  }

  async previewCleanup(projectId: string): Promise<BackupCleanupPreview> {
    const input = RecoveryDailyBackupInputSchema.parse({ projectId });
    return this.#buildCleanupPreview(input.projectId);
  }

  async applyCleanup(
    _requestId: string,
    raw: RecoveryCleanupApplyInput,
  ): Promise<RecoveryCleanupResult> {
    const input = RecoveryCleanupApplyInputSchema.parse(raw);
    const preview = await this.#buildCleanupPreview(input.projectId);
    if (preview.planHash !== input.planHash) {
      throw new RecoveryServiceError(
        'BACKUP_CLEANUP_STALE',
        'The cleanup plan changed and must be previewed again.',
      );
    }
    const records = new Map(
      (await readBackupMetadata(this.#runtime, input.projectId)).map((record) => [
        record.backupId,
        record,
      ]),
    );
    const deletedBackupIds: string[] = [];
    let releasedBytes = 0;
    for (const item of preview.items.filter((candidate) => candidate.action === 'delete')) {
      const record = records.get(item.backupId);
      if (!record) {
        throw new RecoveryServiceError(
          'BACKUP_CLEANUP_STALE',
          'A cleanup target disappeared before deletion.',
        );
      }
      await this.#deleteBackup(this.#runtime.idFactory(), record);
      deletedBackupIds.push(record.backupId);
      releasedBytes += record.sizeBytes;
    }
    return RecoveryCleanupResultSchema.parse({
      projectId: input.projectId,
      deletedBackupIds,
      releasedBytes,
      remainingBytes: preview.totalBytes - releasedBytes,
    });
  }

  async #buildCleanupPreview(projectId: string): Promise<BackupCleanupPreview> {
    this.#runtime.workspace.assertActiveProject(projectId, true);
    const records = await readBackupMetadata(this.#runtime, projectId);
    const policy = readBackupPolicy(this.#runtime, projectId);
    const lastVerifiedBackupId = records[0]?.backupId;
    const now = this.#runtime.clock.now().getTime();
    const majorExpiryMs = policy.majorRetentionDays * 24 * 60 * 60 * 1000;
    let dailyIndex = 0;
    let majorIndex = 0;
    const items: BackupCleanupItem[] = records.map((record) => {
      const reasons = protectionReasons(record, lastVerifiedBackupId);
      if (reasons.length > 0) {
        return {
          backupId: record.backupId,
          track: record.track,
          action: 'protect' as const,
          reason: reasons[0]!,
          sizeBytes: record.sizeBytes,
        };
      }
      if (record.track === 'daily') {
        dailyIndex += 1;
        return {
          backupId: record.backupId,
          track: record.track,
          action:
            dailyIndex <= policy.dailyRetentionCount ? ('retain' as const) : ('delete' as const),
          reason:
            dailyIndex <= policy.dailyRetentionCount
              ? ('daily-retention' as const)
              : ('daily-over-limit' as const),
          sizeBytes: record.sizeBytes,
        };
      }
      if (record.track === 'major') {
        majorIndex += 1;
        const expired = now - Date.parse(record.createdAt) > majorExpiryMs;
        const overCount = majorIndex > policy.majorRetentionCount;
        return {
          backupId: record.backupId,
          track: record.track,
          action: expired || overCount ? ('delete' as const) : ('retain' as const),
          reason: expired
            ? ('major-expired' as const)
            : overCount
              ? ('major-over-limit' as const)
              : ('major-retention' as const),
          sizeBytes: record.sizeBytes,
        };
      }
      return {
        backupId: record.backupId,
        track: record.track,
        action: 'retain' as const,
        reason: 'within-quota' as const,
        sizeBytes: record.sizeBytes,
      };
    });

    let remainingBytes = items
      .filter((item) => item.action !== 'delete')
      .reduce((total, item) => total + item.sizeBytes, 0);
    if (remainingBytes > policy.quotaBytes) {
      const recordsById = new Map(records.map((record) => [record.backupId, record]));
      const candidates = items
        .filter((item) => item.action === 'retain')
        .sort((left, right) => {
          const trackOrder = (track: BackupRecord['track']): number =>
            track === 'daily' ? 0 : track === 'major' ? 1 : 2;
          return (
            trackOrder(left.track) - trackOrder(right.track) ||
            (recordsById.get(left.backupId)?.createdAt ?? '').localeCompare(
              recordsById.get(right.backupId)?.createdAt ?? '',
            )
          );
        });
      for (const candidate of candidates) {
        if (remainingBytes <= policy.quotaBytes) break;
        const index = items.findIndex((item) => item.backupId === candidate.backupId);
        items[index] = { ...candidate, action: 'delete', reason: 'quota-pressure' };
        remainingBytes -= candidate.sizeBytes;
      }
    }
    const totalBytes = records.reduce((total, record) => total + record.sizeBytes, 0);
    const normalized = {
      projectId,
      totalBytes,
      reclaimableBytes: totalBytes - remainingBytes,
      remainingBytes,
      items,
    };
    return BackupCleanupPreviewSchema.parse({
      ...normalized,
      planHash: planHash({
        policy,
        records: records.map((record) => ({
          backupId: record.backupId,
          sha256: record.sha256,
          sizeBytes: record.sizeBytes,
          authorProtected: record.authorProtected,
          migrationProtected: record.migrationProtected,
        })),
        items,
      }),
    });
  }

  async #deleteBackup(requestId: string, record: BackupRecord): Promise<void> {
    if (path.basename(record.backupFileName) !== record.backupFileName) {
      throw new RecoveryServiceError('BACKUP_DELETE_FAILED', 'The backup file name is unsafe.');
    }
    const directory = path.join(this.#runtime.backupRootDirectory, record.projectId);
    const backupPath = path.join(directory, record.backupFileName);
    const metadataPath = path.join(directory, `${record.backupId}.json`);
    const suffix = `.deleting-${this.#runtime.idFactory()}`;
    const stagedBackupPath = `${backupPath}${suffix}`;
    const stagedMetadataPath = `${metadataPath}${suffix}`;
    let backupStaged = false;
    let metadataStaged = false;
    let databaseDeleted = false;
    try {
      await rename(backupPath, stagedBackupPath);
      backupStaged = true;
      await rename(metadataPath, stagedMetadataPath);
      metadataStaged = true;
      await this.#runtime.workspace.writeProject(requestId, record.projectId, (database) => {
        const deleted = database
          .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
          .run(record.backupId, record.projectId);
        if (Number(deleted.changes) !== 1) {
          throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The backup record changed.');
        }
      });
      databaseDeleted = true;
      await Promise.all([
        rm(stagedBackupPath, { force: true }),
        rm(stagedMetadataPath, { force: true }),
      ]);
    } catch (error) {
      if (databaseDeleted) {
        await this.#runtime.workspace
          .writeProject(this.#runtime.idFactory(), record.projectId, (database) => {
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
          })
          .catch(() => undefined);
      }
      if (backupStaged) await rename(stagedBackupPath, backupPath).catch(() => undefined);
      if (metadataStaged) await rename(stagedMetadataPath, metadataPath).catch(() => undefined);
      throw new RecoveryServiceError(
        'BACKUP_DELETE_FAILED',
        'The backup could not be deleted without leaving inconsistent state.',
        { cause: error },
      );
    }
  }
}
