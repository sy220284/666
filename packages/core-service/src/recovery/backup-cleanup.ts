import {
  BackupCleanupPreviewSchema,
  BackupPolicySchema,
  BackupRecordSchema,
  RecoveryDailyBackupInputSchema,
  RecoveryPolicyUpdateInputSchema,
  RecoveryProtectionInputSchema,
  type BackupCleanupItem,
  type BackupCleanupPreview,
  type BackupPolicy,
  type BackupRecord,
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
}
