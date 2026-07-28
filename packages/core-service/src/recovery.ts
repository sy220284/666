import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

import {
  BackupRecordSchema,
  BackupFailureRecordSchema,
  BackupCleanupPreviewSchema,
  BackupPolicySchema,
  RecoveryCleanupApplyInputSchema,
  RecoveryCleanupResultSchema,
  RecoveryCreateInputSchema,
  RecoveryDailyBackupInputSchema,
  RecoveryExportInputSchema,
  RecoveryNamedSnapshotInputSchema,
  RecoveryOverviewSchema,
  RecoveryPolicyUpdateInputSchema,
  RecoveryProtectionInputSchema,
  RecoveryRestoreInputSchema,
  RecoveryRestoredProjectSchema,
  RecoveryVersionExportSchema,
  type BackupRecord,
  type BackupFailureCode,
  type BackupFailureRecord,
  type BackupCleanupItem,
  type BackupCleanupPreview,
  type BackupPolicy,
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

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type RecoveryServiceErrorCode =
  | 'BACKUP_CREATE_FAILED'
  | 'BACKUP_VERIFY_FAILED'
  | 'BACKUP_SPACE_LOW'
  | 'BACKUP_NOT_FOUND'
  | 'BACKUP_PROTECTED'
  | 'BACKUP_CLEANUP_STALE'
  | 'BACKUP_DELETE_FAILED'
  | 'RESTORE_SOURCE_INVALID'
  | 'RESTORE_TARGET_CONFLICT'
  | 'RESTORE_VERIFY_FAILED'
  | 'EXPORT_VERSION_REQUIRED'
  | 'EXPORT_TARGET_EXISTS'
  | 'EXPORT_WRITE_FAILED';

export class RecoveryServiceError extends Error {
  readonly code: RecoveryServiceErrorCode;
  constructor(code: RecoveryServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RecoveryServiceError';
    this.code = code;
  }
}

export interface RecoveryServiceOptions {
  readonly backupRootDirectory: string;
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly freeBytes?: (directory: string) => Promise<bigint>;
  readonly onlineBackup?: (sourceDatabasePath: string, targetDatabasePath: string) => Promise<void>;
  readonly copyBackup?: (source: string, target: string) => Promise<void>;
  readonly afterBackupCreated?: (backupPath: string) => Promise<void> | void;
  readonly afterRestoreCopied?: (databasePath: string) => Promise<void> | void;
}

interface BackupMetadata extends BackupRecord {
  readonly sourceWorkspaceName: string;
}

const DEFAULT_DAILY_RETENTION_COUNT = 14;
const DEFAULT_MAJOR_RETENTION_COUNT = 30;
const DEFAULT_MAJOR_RETENTION_DAYS = 90;
const DEFAULT_BACKUP_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function safeName(value: string): string {
  const forbidden = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*']);
  const normalized = Array.from(value.trim(), (character) =>
    (character.codePointAt(0) ?? 0) < 32 || forbidden.has(character) ? '-' : character,
  ).join('');
  const cleaned = normalized.replace(/[. ]+$/u, '').slice(0, 180);
  return cleaned || 'WorldForge';
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function defaultFreeBytes(directory: string): Promise<bigint> {
  const details = await statfs(directory, { bigint: true });
  return details.bavail * details.bsize;
}

async function defaultOnlineBackup(
  sourceDatabasePath: string,
  targetDatabasePath: string,
): Promise<void> {
  const source = new DatabaseSync(sourceDatabasePath, {
    readOnly: true,
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  try {
    await backup(source, targetDatabasePath);
  } finally {
    source.close();
  }
}

async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function planHash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function defaultPolicy(projectId: string, updatedAt: string): BackupPolicy {
  return BackupPolicySchema.parse({
    projectId,
    policyVersion: 1,
    dailyRetentionCount: DEFAULT_DAILY_RETENTION_COUNT,
    majorRetentionCount: DEFAULT_MAJOR_RETENTION_COUNT,
    majorRetentionDays: DEFAULT_MAJOR_RETENTION_DAYS,
    quotaBytes: DEFAULT_BACKUP_QUOTA_BYTES,
    updatedAt,
  });
}

function protectionReasons(
  record: BackupRecord,
  lastVerifiedBackupId: string | undefined,
): BackupRecord['protectionReasons'] {
  return [
    ...(record.authorProtected ? (['author-protected'] as const) : []),
    ...(record.migrationProtected ? (['migration-protected'] as const) : []),
    ...(record.backupId === lastVerifiedBackupId ? (['last-verified'] as const) : []),
  ];
}

async function existingWritableDirectory(directory: string): Promise<string> {
  if (!path.isAbsolute(directory)) {
    throw new RecoveryServiceError(
      'RESTORE_SOURCE_INVALID',
      'The selected directory must be absolute.',
    );
  }
  try {
    const canonical = await realpath(path.normalize(directory));
    const details = await stat(canonical);
    if (!details.isDirectory() || (details.mode & 0o222) === 0) throw new Error('NOT_WRITABLE');
    await access(canonical);
    return canonical;
  } catch (error) {
    throw new RecoveryServiceError(
      'RESTORE_SOURCE_INVALID',
      'The selected directory is unavailable.',
      {
        cause: error,
      },
    );
  }
}

function verifyDatabase(databasePath: string, expectedProjectId: string): void {
  const database = new DatabaseSync(databasePath, {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all();
    const messages = integrity.map((row) => String(Object.values(row)[0] ?? 'unknown'));
    if (messages.length !== 1 || messages[0] !== 'ok') {
      throw new RecoveryServiceError('BACKUP_VERIFY_FAILED', 'The backup failed integrity_check.');
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'The backup failed foreign_key_check.',
      );
    }
    const row = database.prepare('SELECT id FROM projects LIMIT 2').all();
    if (row.length !== 1 || String(row[0]?.id) !== expectedProjectId) {
      throw new RecoveryServiceError(
        'BACKUP_VERIFY_FAILED',
        'The backup project identity is invalid.',
      );
    }
    database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    database.prepare('PRAGMA journal_mode = DELETE').get();
  } finally {
    database.close();
  }
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

export class RecoveryService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #backupRootDirectory: string;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #freeBytes: (directory: string) => Promise<bigint>;
  readonly #onlineBackup: (sourceDatabasePath: string, targetDatabasePath: string) => Promise<void>;
  readonly #copyBackup: (source: string, target: string) => Promise<void>;
  readonly #afterBackupCreated: ((backupPath: string) => Promise<void> | void) | undefined;
  readonly #afterRestoreCopied: ((databasePath: string) => Promise<void> | void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: RecoveryServiceOptions) {
    this.#workspace = workspace;
    this.#backupRootDirectory = options.backupRootDirectory;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#freeBytes = options.freeBytes ?? defaultFreeBytes;
    this.#onlineBackup = options.onlineBackup ?? defaultOnlineBackup;
    this.#copyBackup = options.copyBackup ?? copyFile;
    this.#afterBackupCreated = options.afterBackupCreated;
    this.#afterRestoreCopied = options.afterRestoreCopied;
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
    const today = this.#clock.now().toISOString().slice(0, 10);
    const existing = (await this.#readMetadata(input.projectId)).find(
      (record) => record.track === 'daily' && record.createdAt.slice(0, 10) === today,
    );
    if (existing) return existing;
    return this.#createTrackedBackup(
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
      failureId: this.#idFactory(),
      projectId: input.projectId,
      operation: input.operation,
      track,
      errorCode,
      occurredAt: this.#clock.now().toISOString(),
      resolvedAt: null,
    });
    try {
      await this.#workspace.writeProject(this.#idFactory(), input.projectId, (database) => {
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
      });
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
    const project = this.#workspace.assertActiveProject(input.projectId, true);
    const sourceDatabasePath = path.join(project.workspacePath, 'project.sqlite');
    const backupDirectory = path.join(this.#backupRootDirectory, input.projectId);
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);
    const sourceBytes = BigInt((await stat(sourceDatabasePath)).size);
    const requiredBytes = sourceBytes * 2n + 1_048_576n;
    if ((await this.#freeBytes(backupDirectory)) < requiredBytes) {
      throw new RecoveryServiceError(
        'BACKUP_SPACE_LOW',
        'There is not enough space for a verified checkpoint.',
      );
    }

    const backupId = this.#idFactory();
    const createdAt = this.#clock.now().toISOString();
    const fileName = `${createdAt.replaceAll(':', '-').replaceAll('.', '-')}-${input.operation}-${backupId}.sqlite`;
    const finalPath = path.join(backupDirectory, fileName);
    const partialPath = `${finalPath}.partial`;
    const metadataPath = path.join(backupDirectory, `${backupId}.json`);
    const metadataPartialPath = `${metadataPath}.partial`;
    try {
      await this.#onlineBackup(sourceDatabasePath, partialPath);
      await this.#afterBackupCreated?.(partialPath);
      verifyDatabase(partialPath, input.projectId);
      const sha256 = await hashFile(partialPath);
      const sizeBytes = (await stat(partialPath)).size;
      const verifiedAt = this.#clock.now().toISOString();
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
      await writeFile(
        metadataPartialPath,
        `${JSON.stringify(metadata, null, 2)}
`,
        {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        },
      );
      await rename(partialPath, finalPath);
      await rename(metadataPartialPath, metadataPath);
      try {
        await this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
        {
          cause: error,
        },
      );
    }
  }

  async getOverview(projectId: string): Promise<RecoveryOverview> {
    const project = this.#workspace.assertActiveProject(projectId);
    const rawCheckpoints = await this.#readMetadata(projectId);
    const lastVerifiedBackupId = rawCheckpoints[0]?.backupId;
    const checkpoints = rawCheckpoints.map((record) =>
      BackupRecordSchema.parse({
        ...record,
        protectionReasons: protectionReasons(record, lastVerifiedBackupId),
      }),
    );
    const backupFailures: BackupFailureRecord[] = (() => {
      try {
        return this.#workspace.readProject(projectId, (database) =>
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
    const policy = this.#readPolicy(projectId);
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
      exportableVersions = this.#workspace.readProject(projectId, (database) =>
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
    const updatedAt = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
    const records = await this.#readMetadata(input.projectId);
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
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
      await this.#rewriteMetadata(updated);
    } catch (error) {
      await this.#workspace.writeProject(this.#idFactory(), input.projectId, (database) => {
        database
          .prepare(
            `UPDATE backup_records SET author_protected = ?
              WHERE id = ? AND project_id = ?`,
          )
          .run(record.authorProtected ? 1 : 0, input.backupId, input.projectId);
      });
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
    requestId: string,
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
      (await this.#readMetadata(input.projectId)).map((record) => [record.backupId, record]),
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
      await this.#deleteBackup(this.#idFactory(), record);
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

  async restoreCheckpoint(
    requestId: string,
    raw: RecoveryRestoreInput,
    targetParentDirectory: string,
  ): Promise<RecoveryRestoredProject> {
    const input = RecoveryRestoreInputSchema.parse(raw);
    const sourceProject = this.#workspace.assertActiveProject(input.projectId);
    const metadata = (await this.#readMetadata(input.projectId)).find(
      (record) => record.backupId === input.backupId,
    );
    if (!metadata)
      throw new RecoveryServiceError('BACKUP_NOT_FOUND', 'The checkpoint was not found.');
    if (path.basename(metadata.backupFileName) !== metadata.backupFileName) {
      throw new RecoveryServiceError(
        'RESTORE_SOURCE_INVALID',
        'The checkpoint file name is invalid.',
      );
    }
    const backupPath = path.join(
      this.#backupRootDirectory,
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
        {
          cause: error,
        },
      );
    }

    const parent = await existingWritableDirectory(targetParentDirectory);
    const nextProjectId = this.#idFactory();
    const restoredAt = this.#clock.now().toISOString();
    const nextName = `${sourceProject.name}（恢复副本）`.slice(0, 240);
    const directoryName = `${safeName(sourceProject.name)}-恢复-${input.backupId.slice(0, 8)}.worldforge`;
    const target = path.join(parent, directoryName);
    const staging = path.join(parent, `.${directoryName}.restore-${this.#idFactory()}`);
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
    if ((await this.#freeBytes(parent)) < requiredBytes) {
      throw new RecoveryServiceError(
        'BACKUP_SPACE_LOW',
        'There is not enough space for the restored copy.',
      );
    }

    let targetCreated = false;
    try {
      await mkdir(staging, { mode: 0o700 });
      const databasePath = path.join(staging, 'project.sqlite');
      await this.#copyBackup(backupPath, databasePath);
      await chmod(databasePath, 0o600);
      await this.#afterRestoreCopied?.(databasePath);
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
        `${JSON.stringify(manifest, null, 2)}
`,
        {
          encoding: 'utf8',
          mode: 0o600,
          flag: 'wx',
        },
      );
      await rename(staging, target);
      targetCreated = true;
      const registered = await this.#workspace.registerRecoveredWorkspace(requestId, target);
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
        {
          cause: error,
        },
      );
    }
  }

  async exportVersion(
    raw: RecoveryExportInput,
    targetDirectory: string,
  ): Promise<RecoveryVersionExport> {
    const input = RecoveryExportInputSchema.parse(raw);
    this.#workspace.assertActiveProject(input.projectId);
    const data = this.#workspace.readProject(input.projectId, (database) => {
      const version = database
        .prepare(
          `SELECT v.id AS versionId, c.title AS chapterTitle, v.title AS versionTitle
             FROM versions v
             JOIN chapters c ON c.id = v.chapter_id
             JOIN volumes vo ON vo.id = c.volume_id
            WHERE v.id = ? AND vo.project_id = ?`,
        )
        .get(input.versionId, input.projectId) as
        { versionId: string; chapterTitle: string; versionTitle: string } | undefined;
      if (!version) {
        throw new RecoveryServiceError('EXPORT_VERSION_REQUIRED', 'The Version was not found.');
      }
      const blocks = database
        .prepare(
          `SELECT block_type AS blockType, text
             FROM version_blocks
            WHERE version_id = ?
            ORDER BY order_key`,
        )
        .all(input.versionId)
        .map((row) => ({ blockType: String(row.blockType), text: String(row.text) }));
      return { version, blocks };
    });
    const directory = await existingWritableDirectory(targetDirectory);
    const fileName = `${safeName(data.version.chapterTitle)}-${safeName(data.version.versionTitle)}.txt`;
    const filePath = path.join(directory, fileName);
    try {
      await lstat(filePath);
      throw new RecoveryServiceError('EXPORT_TARGET_EXISTS', 'The export target already exists.');
    } catch (error) {
      if (error instanceof RecoveryServiceError) throw error;
      if (!isMissing(error)) throw error;
    }
    const content = data.blocks
      .map((block) => (block.blockType === 'separator' ? '---' : block.text))
      .join('\n\n');
    const temporaryPath = `${filePath}.partial-${this.#idFactory()}`;
    try {
      await writeFile(
        temporaryPath,
        `${content}
`,
        { encoding: 'utf8', mode: 0o600, flag: 'wx' },
      );
      await rename(temporaryPath, filePath);
      const sha256 = await hashFile(filePath);
      const sizeBytes = (await stat(filePath)).size;
      return RecoveryVersionExportSchema.parse({
        projectId: input.projectId,
        versionId: input.versionId,
        fileName,
        filePath,
        sizeBytes,
        sha256,
      });
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError('EXPORT_WRITE_FAILED', 'The Version could not be exported.', {
        cause: error,
      });
    }
  }

  #readPolicy(projectId: string): BackupPolicy {
    const updatedAt = this.#clock.now().toISOString();
    try {
      return this.#workspace.readProject(projectId, (database) => {
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
        return row
          ? BackupPolicySchema.parse({
              projectId: String(row.projectId),
              policyVersion: Number(row.policyVersion),
              dailyRetentionCount: Number(row.dailyRetentionCount),
              majorRetentionCount: Number(row.majorRetentionCount),
              majorRetentionDays: Number(row.majorRetentionDays),
              quotaBytes: Number(row.quotaBytes),
              updatedAt: String(row.updatedAt),
            })
          : defaultPolicy(projectId, updatedAt);
      });
    } catch {
      return defaultPolicy(projectId, updatedAt);
    }
  }

  async #buildCleanupPreview(projectId: string): Promise<BackupCleanupPreview> {
    this.#workspace.assertActiveProject(projectId, true);
    const records = await this.#readMetadata(projectId);
    const policy = this.#readPolicy(projectId);
    const lastVerifiedBackupId = records[0]?.backupId;
    const now = this.#clock.now().getTime();
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

  async #rewriteMetadata(record: BackupRecord): Promise<void> {
    const directory = path.join(this.#backupRootDirectory, record.projectId);
    const metadataPath = path.join(directory, `${record.backupId}.json`);
    const temporaryPath = `${metadataPath}.partial-${this.#idFactory()}`;
    let sourceWorkspaceName = 'WorldForge';
    try {
      const raw = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown;
      if (
        raw &&
        typeof raw === 'object' &&
        'sourceWorkspaceName' in raw &&
        typeof raw.sourceWorkspaceName === 'string'
      ) {
        sourceWorkspaceName = raw.sourceWorkspaceName;
      }
      await writeFile(
        temporaryPath,
        `${JSON.stringify({ ...record, sourceWorkspaceName }, null, 2)}\n`,
        { encoding: 'utf8', mode: 0o600, flag: 'wx' },
      );
      await rename(temporaryPath, metadataPath);
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async #deleteBackup(requestId: string, record: BackupRecord): Promise<void> {
    if (path.basename(record.backupFileName) !== record.backupFileName) {
      throw new RecoveryServiceError('BACKUP_DELETE_FAILED', 'The backup file name is unsafe.');
    }
    const directory = path.join(this.#backupRootDirectory, record.projectId);
    const backupPath = path.join(directory, record.backupFileName);
    const metadataPath = path.join(directory, `${record.backupId}.json`);
    const suffix = `.deleting-${this.#idFactory()}`;
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
      await this.#workspace.writeProject(requestId, record.projectId, (database) => {
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
        await this.#workspace
          .writeProject(this.#idFactory(), record.projectId, (database) => {
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

  async #readMetadata(projectId: string): Promise<BackupRecord[]> {
    const directory = path.join(this.#backupRootDirectory, projectId);
    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const records: BackupRecord[] = [];
    for (const name of entries.filter((entry) => entry.endsWith('.json')).sort()) {
      try {
        const raw = JSON.parse(await readFile(path.join(directory, name), 'utf8')) as unknown;
        const candidate =
          raw && typeof raw === 'object'
            ? (() => {
                const values = Object.fromEntries(
                  Object.entries(raw).filter(([key]) => key !== 'sourceWorkspaceName'),
                );
                const operation = values.operation;
                return {
                  ...values,
                  track:
                    values.track ??
                    (operation === 'manual-protection'
                      ? 'named'
                      : operation === 'migration'
                        ? 'major'
                        : 'major'),
                  displayName:
                    values.displayName ??
                    (operation === 'manual-protection' ? '历史手动恢复点' : null),
                  note: values.note ?? null,
                  authorProtected: values.authorProtected ?? operation === 'manual-protection',
                  migrationProtected: values.migrationProtected ?? operation === 'migration',
                  schemaVersion: values.schemaVersion ?? 0,
                  protectionReasons: [],
                };
              })()
            : raw;
        const parsed = BackupRecordSchema.safeParse(candidate);
        if (parsed.success && parsed.data.projectId === projectId) records.push(parsed.data);
      } catch {
        // Invalid metadata is ignored and cannot be selected for restore.
      }
    }
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }
}
