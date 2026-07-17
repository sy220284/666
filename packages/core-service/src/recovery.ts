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
  RecoveryCreateInputSchema,
  RecoveryExportInputSchema,
  RecoveryOverviewSchema,
  RecoveryRestoreInputSchema,
  RecoveryRestoredProjectSchema,
  RecoveryVersionExportSchema,
  type BackupRecord,
  type RecoveryCreateInput,
  type RecoveryExportInput,
  type RecoveryOverview,
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

function remapProjectIdentity(
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
    database.exec('COMMIT; PRAGMA foreign_keys = ON');
    if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
      throw new Error('PROJECT_ID_REMAP_FOREIGN_KEY_FAILED');
    }
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
                 id, project_id, operation, backup_file_name, size_bytes, sha256, created_at, verified_at
               ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
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
            );
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
    const checkpoints = await this.#readMetadata(projectId);
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
      exportableVersions,
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
            ? Object.fromEntries(
                Object.entries(raw).filter(([key]) => key !== 'sourceWorkspaceName'),
              )
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
