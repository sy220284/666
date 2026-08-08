import { createHash } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  BackupFailureRecordSchema,
  BackupRecordSchema,
  RecoveryCleanupApplyInputSchema,
  RecoveryCleanupResultSchema,
  RecoveryOverviewSchema,
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

import { BackupCleanupOperations } from './backup-cleanup.js';
import {
  RecoveryServiceError,
  protectionReasons,
  readBackupMetadata,
  readBackupPolicy,
  type RecoveryRuntime,
} from './backup-manifest.js';

interface CleanupJournal {
  readonly schemaVersion: 1;
  readonly requestId: string;
  readonly projectId: string;
  readonly authority: RecoveryCleanupApplyInput['authority'];
  readonly planHash: string;
  readonly totalBytes: number;
  readonly targets: readonly BackupRecord[];
  readonly deletedBackupIds: readonly string[];
  readonly completed: boolean;
}

function derivedRequestId(requestId: string, backupId: string): string {
  const bytes = Buffer.from(
    createHash('sha256').update(`${requestId}:${backupId}`).digest().subarray(0, 16),
  );
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const value = bytes.toString('hex');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

function parseJournal(raw: unknown): CleanupJournal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  if (
    value.schemaVersion !== 1 ||
    typeof value.requestId !== 'string' ||
    typeof value.projectId !== 'string' ||
    value.authority !== 'author' ||
    typeof value.planHash !== 'string' ||
    typeof value.totalBytes !== 'number' ||
    !Array.isArray(value.targets) ||
    !Array.isArray(value.deletedBackupIds) ||
    typeof value.completed !== 'boolean'
  ) {
    return null;
  }
  const targets = value.targets.map((record) => BackupRecordSchema.parse(record));
  if (!value.deletedBackupIds.every((backupId) => typeof backupId === 'string')) return null;
  return {
    schemaVersion: 1,
    requestId: value.requestId,
    projectId: value.projectId,
    authority: value.authority,
    planHash: value.planHash,
    totalBytes: value.totalBytes,
    targets,
    deletedBackupIds: value.deletedBackupIds as string[],
    completed: value.completed,
  };
}

export class IdempotentBackupCleanupOperations {
  readonly #runtime: RecoveryRuntime;
  readonly #base: BackupCleanupOperations;

  constructor(runtime: RecoveryRuntime) {
    this.#runtime = runtime;
    this.#base = new BackupCleanupOperations(runtime);
  }

  async getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#runtime.workspace.assertActiveProject(projectId);
    const recoveryOnly = project.readOnlyReason === 'integrity-failed';
    const rawCheckpoints = await readBackupMetadata(this.#runtime, projectId);
    const lastVerifiedBackupId = rawCheckpoints[0]?.backupId;
    const checkpoints = rawCheckpoints.map((record) =>
      BackupRecordSchema.parse({
        ...record,
        protectionReasons: protectionReasons(record, lastVerifiedBackupId),
      }),
    );
    const backupFailures: BackupFailureRecord[] = recoveryOnly
      ? []
      : this.#runtime.workspace.readProject(projectId, (database) =>
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
    const exportableVersions: RecoveryOverview['exportableVersions'] = recoveryOnly
      ? []
      : this.#runtime.workspace.readProject(projectId, (database) =>
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
    return this.#base.updatePolicy(requestId, raw);
  }

  setProtection(requestId: string, raw: RecoveryProtectionInput): Promise<BackupRecord> {
    return this.#base.setProtection(requestId, raw);
  }

  previewCleanup(projectId: string): Promise<BackupCleanupPreview> {
    return this.#base.previewCleanup(projectId);
  }

  async applyCleanup(
    requestId: string,
    raw: RecoveryCleanupApplyInput,
  ): Promise<RecoveryCleanupResult> {
    const input = RecoveryCleanupApplyInputSchema.parse(raw);
    this.#runtime.workspace.assertActiveProject(input.projectId, true);
    const journalPath = await this.#journalPath(input.projectId, requestId);
    let journal = await this.#readJournal(journalPath);
    if (journal) {
      if (
        journal.requestId !== requestId ||
        journal.projectId !== input.projectId ||
        journal.authority !== input.authority ||
        journal.planHash !== input.planHash
      ) {
        throw new RecoveryServiceError(
          'BACKUP_CLEANUP_STALE',
          'The requestId belongs to a different cleanup plan.',
        );
      }
    } else {
      const preview = await this.#base.previewCleanup(input.projectId);
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
      const targets = preview.items
        .filter((item) => item.action === 'delete')
        .map((item) => records.get(item.backupId))
        .filter((record): record is BackupRecord => Boolean(record));
      if (targets.length !== preview.items.filter((item) => item.action === 'delete').length) {
        throw new RecoveryServiceError(
          'BACKUP_CLEANUP_STALE',
          'A cleanup target disappeared before the operation journal was created.',
        );
      }
      journal = {
        schemaVersion: 1,
        requestId,
        projectId: input.projectId,
        authority: input.authority,
        planHash: input.planHash,
        totalBytes: preview.totalBytes,
        targets,
        deletedBackupIds: [],
        completed: false,
      };
      await this.#writeJournal(journalPath, journal);
    }

    if (!journal.completed) {
      const deleted = new Set(journal.deletedBackupIds);
      for (const record of journal.targets) {
        if (deleted.has(record.backupId)) continue;
        await this.#deleteBackup(requestId, record);
        deleted.add(record.backupId);
        journal = { ...journal, deletedBackupIds: [...deleted] };
        await this.#writeJournal(journalPath, journal);
      }
      journal = { ...journal, completed: true };
      await this.#writeJournal(journalPath, journal);
    }

    const releasedBytes = journal.targets.reduce((total, record) => total + record.sizeBytes, 0);
    return RecoveryCleanupResultSchema.parse({
      projectId: input.projectId,
      deletedBackupIds: journal.targets.map((record) => record.backupId),
      releasedBytes,
      remainingBytes: Math.max(0, journal.totalBytes - releasedBytes),
    });
  }

  async #journalPath(projectId: string, requestId: string): Promise<string> {
    const directory = path.join(this.#runtime.backupRootDirectory, projectId, '.operations');
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    return path.join(directory, `cleanup-${requestId}.json`);
  }

  async #readJournal(journalPath: string): Promise<CleanupJournal | null> {
    try {
      const parsed = parseJournal(JSON.parse(await readFile(journalPath, 'utf8')) as unknown);
      if (!parsed) {
        throw new RecoveryServiceError(
          'BACKUP_CLEANUP_STALE',
          'The cleanup operation journal is invalid.',
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError(
        'BACKUP_CLEANUP_STALE',
        'The cleanup operation journal could not be read safely.',
        { cause: error },
      );
    }
  }

  async #writeJournal(journalPath: string, journal: CleanupJournal): Promise<void> {
    const temporaryPath = `${journalPath}.partial-${this.#runtime.idFactory()}`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(journal, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
        flag: 'wx',
      });
      await rename(temporaryPath, journalPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  #databaseContains(record: BackupRecord): boolean {
    return this.#runtime.workspace.readProject(record.projectId, (database) =>
      Boolean(
        database
          .prepare('SELECT id FROM backup_records WHERE id = ? AND project_id = ?')
          .get(record.backupId, record.projectId),
      ),
    );
  }

  async #deleteBackup(requestId: string, record: BackupRecord): Promise<void> {
    if (path.basename(record.backupFileName) !== record.backupFileName) {
      throw new RecoveryServiceError('BACKUP_DELETE_FAILED', 'The backup file name is unsafe.');
    }
    const directory = path.join(this.#runtime.backupRootDirectory, record.projectId);
    const backupPath = path.join(directory, record.backupFileName);
    const metadataPath = path.join(directory, `${record.backupId}.json`);
    const suffix = `.deleting-${derivedRequestId(requestId, record.backupId)}`;
    const stagedBackupPath = `${backupPath}${suffix}`;
    const stagedMetadataPath = `${metadataPath}${suffix}`;
    let databaseDeleted = !this.#databaseContains(record);

    try {
      if (!databaseDeleted) {
        if (!(await exists(stagedBackupPath))) {
          if (!(await exists(backupPath))) {
            throw new RecoveryServiceError(
              'BACKUP_DELETE_FAILED',
              'The backup file disappeared before deletion.',
            );
          }
          await rename(backupPath, stagedBackupPath);
        }
        if (!(await exists(stagedMetadataPath))) {
          if (!(await exists(metadataPath))) {
            await rename(stagedBackupPath, backupPath).catch(() => undefined);
            throw new RecoveryServiceError(
              'BACKUP_DELETE_FAILED',
              'The backup metadata disappeared before deletion.',
            );
          }
          await rename(metadataPath, stagedMetadataPath);
        }
        await this.#runtime.workspace.writeProject(
          derivedRequestId(requestId, record.backupId),
          record.projectId,
          (database) => {
            const deleted = database
              .prepare('DELETE FROM backup_records WHERE id = ? AND project_id = ?')
              .run(record.backupId, record.projectId);
            if (Number(deleted.changes) !== 1) {
              throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The backup record changed.');
            }
          },
        );
        databaseDeleted = true;
      }
      await Promise.all([
        rm(backupPath, { force: true }),
        rm(metadataPath, { force: true }),
        rm(stagedBackupPath, { force: true }),
        rm(stagedMetadataPath, { force: true }),
      ]);
    } catch (error) {
      if (!databaseDeleted) {
        if (await exists(stagedBackupPath)) {
          await rename(stagedBackupPath, backupPath).catch(() => undefined);
        }
        if (await exists(stagedMetadataPath)) {
          await rename(stagedMetadataPath, metadataPath).catch(() => undefined);
        }
      }
      throw new RecoveryServiceError(
        'BACKUP_DELETE_FAILED',
        'The backup could not be deleted without leaving inconsistent state.',
        { cause: error },
      );
    }
  }
}
