import { createHash, randomUUID } from 'node:crypto';
import {
  access,
  constants,
  copyFile,
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
  BackupPolicySchema,
  BackupRecordSchema,
  type BackupPolicy,
  type BackupRecord,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { stableJson } from '../stable-json.js';
import type { FileLeaseTiming } from './file-lease-types.js';

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
  readonly dailyBackupLeaseTiming?: FileLeaseTiming;
}

export interface RecoveryRuntime {
  readonly workspace: ProjectWorkspaceService;
  readonly backupRootDirectory: string;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
  readonly freeBytes: (directory: string) => Promise<bigint>;
  readonly onlineBackup: (sourceDatabasePath: string, targetDatabasePath: string) => Promise<void>;
  readonly copyBackup: (source: string, target: string) => Promise<void>;
  readonly afterBackupCreated: ((backupPath: string) => Promise<void> | void) | undefined;
  readonly afterRestoreCopied: ((databasePath: string) => Promise<void> | void) | undefined;
  readonly dailyBackupLeaseTiming: FileLeaseTiming | undefined;
}

export interface BackupMetadata extends BackupRecord {
  readonly sourceWorkspaceName: string;
}

const DEFAULT_DAILY_RETENTION_COUNT = 14;
const DEFAULT_MAJOR_RETENTION_COUNT = 30;
const DEFAULT_MAJOR_RETENTION_DAYS = 90;
const DEFAULT_BACKUP_QUOTA_BYTES = 5 * 1024 * 1024 * 1024;
const CURRENT_BACKUP_METADATA_FIELDS = [
  'track',
  'displayName',
  'note',
  'authorProtected',
  'migrationProtected',
  'schemaVersion',
  'protectionReasons',
  'sourceWorkspaceName',
] as const;

export function createRecoveryRuntime(
  workspace: ProjectWorkspaceService,
  options: RecoveryServiceOptions,
): RecoveryRuntime {
  return {
    workspace,
    backupRootDirectory: options.backupRootDirectory,
    clock: options.clock ?? systemClock,
    idFactory: options.idFactory ?? randomUUID,
    freeBytes: options.freeBytes ?? defaultFreeBytes,
    onlineBackup: options.onlineBackup ?? defaultOnlineBackup,
    copyBackup: options.copyBackup ?? copyFile,
    afterBackupCreated: options.afterBackupCreated,
    afterRestoreCopied: options.afterRestoreCopied,
    dailyBackupLeaseTiming: options.dailyBackupLeaseTiming,
  };
}

export function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

export function safeName(value: string): string {
  const forbidden = new Set(['<', '>', ':', '"', '/', String.fromCharCode(92), '|', '?', '*']);
  const normalized = Array.from(value.trim(), (character) =>
    (character.codePointAt(0) ?? 0) < 32 || forbidden.has(character) ? '-' : character,
  ).join('');
  const cleaned = normalized.replace(/[. ]+$/u, '').slice(0, 180);
  return cleaned || 'WorldForge';
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

export async function hashFile(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}

function stable(value: unknown): string {
  return stableJson(value);
}

export function planHash(value: unknown): string {
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

export function protectionReasons(
  record: BackupRecord,
  lastVerifiedBackupId: string | undefined,
): BackupRecord['protectionReasons'] {
  return [
    ...(record.authorProtected ? (['author-protected'] as const) : []),
    ...(record.migrationProtected ? (['migration-protected'] as const) : []),
    ...(record.backupId === lastVerifiedBackupId ? (['last-verified'] as const) : []),
  ];
}

export async function existingWritableDirectory(directory: string): Promise<string> {
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
    await access(canonical, constants.W_OK);
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

export function verifyDatabase(databasePath: string, expectedProjectId: string): void {
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

export function readBackupPolicy(runtime: RecoveryRuntime, projectId: string): BackupPolicy {
  const updatedAt = runtime.clock.now().toISOString();
  try {
    return runtime.workspace.readProject(projectId, (database) => {
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

export async function rewriteBackupMetadata(
  runtime: RecoveryRuntime,
  record: BackupRecord,
): Promise<void> {
  const directory = path.join(runtime.backupRootDirectory, record.projectId);
  const metadataPath = path.join(directory, `${record.backupId}.json`);
  const temporaryPath = `${metadataPath}.partial-${runtime.idFactory()}`;
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

function metadataRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

function legacyBackupCandidate(raw: Record<string, unknown>): Record<string, unknown> {
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
      values.displayName ?? (operation === 'manual-protection' ? '历史手动恢复点' : null),
    note: values.note ?? null,
    authorProtected: values.authorProtected ?? operation === 'manual-protection',
    migrationProtected: values.migrationProtected ?? operation === 'migration',
    schemaVersion: values.schemaVersion ?? 0,
    protectionReasons: values.protectionReasons ?? [],
  };
}

function metadataNeedsNormalization(raw: Record<string, unknown>): boolean {
  return CURRENT_BACKUP_METADATA_FIELDS.some(
    (field) => !Object.prototype.hasOwnProperty.call(raw, field),
  );
}

async function normalizeBackupMetadata(
  runtime: RecoveryRuntime,
  metadataPath: string,
  metadata: BackupMetadata,
): Promise<void> {
  const temporaryPath = `${metadataPath}.normalize-${runtime.idFactory()}`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    await rename(temporaryPath, metadataPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function readBackupMetadata(
  runtime: RecoveryRuntime,
  projectId: string,
): Promise<BackupRecord[]> {
  const directory = path.join(runtime.backupRootDirectory, projectId);
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch (error) {
    if (isMissing(error)) return [];
    throw error;
  }
  const records: BackupRecord[] = [];
  for (const name of entries.filter((entry) => entry.endsWith('.json')).sort()) {
    const metadataPath = path.join(directory, name);
    try {
      const raw = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown;
      const values = metadataRecord(raw);
      if (!values) continue;
      const parsed = BackupRecordSchema.safeParse(legacyBackupCandidate(values));
      if (!parsed.success || parsed.data.projectId !== projectId) continue;
      records.push(parsed.data);

      if (metadataNeedsNormalization(values)) {
        const sourceWorkspaceName =
          typeof values.sourceWorkspaceName === 'string' && values.sourceWorkspaceName.length > 0
            ? values.sourceWorkspaceName
            : 'WorldForge';
        try {
          await normalizeBackupMetadata(runtime, metadataPath, {
            ...parsed.data,
            sourceWorkspaceName,
          });
        } catch {
          // The parsed legacy record remains usable when normalization cannot replace the file.
        }
      }
    } catch {
      // Invalid metadata is ignored and cannot be selected for restore.
    }
  }
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
