import { createHash, randomUUID } from 'node:crypto';
import { access, lstat, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  RecoveryExportInputSchema,
  RecoveryOverviewSchema,
  RecoveryVersionExportSchema,
  type BackupRecord,
  type RecoveryExportInput,
  type RecoveryOverview,
  type RecoveryVersionExport,
  type RecoveryVersionSummary,
} from '@worldforge/contracts';

import type { ProjectWorkspaceService } from './project-workspace.js';
import { RecoveryService, RecoveryServiceError, type RecoveryServiceOptions } from './recovery.js';

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
      { cause: error },
    );
  }
}

interface CheckpointReader {
  readonly record: BackupRecord;
  readonly database: DatabaseSync;
}

interface VersionExportData {
  readonly chapterTitle: string;
  readonly versionTitle: string;
  readonly blocks: readonly { readonly blockType: string; readonly text: string }[];
}

export class CheckpointAwareRecoveryService extends RecoveryService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #backupRootDirectory: string;

  constructor(workspace: ProjectWorkspaceService, options: RecoveryServiceOptions) {
    super(workspace, options);
    this.#workspace = workspace;
    this.#backupRootDirectory = path.resolve(options.backupRootDirectory);
  }

  async #openVerifiedCheckpoint(record: BackupRecord): Promise<CheckpointReader | null> {
    if (path.basename(record.backupFileName) !== record.backupFileName) return null;
    const projectDirectory = path.resolve(this.#backupRootDirectory, record.projectId);
    const backupPath = path.resolve(projectDirectory, record.backupFileName);
    if (!backupPath.startsWith(`${projectDirectory}${path.sep}`)) return null;
    let database: DatabaseSync | null = null;
    try {
      const details = await lstat(backupPath);
      if (!details.isFile() || details.isSymbolicLink() || details.size !== record.sizeBytes)
        return null;
      if ((await hashFile(backupPath)) !== record.sha256) return null;
      database = new DatabaseSync(backupPath, {
        readOnly: true,
        allowExtension: false,
        enableForeignKeyConstraints: true,
        readBigInts: true,
      });
      const integrity = database.prepare('PRAGMA integrity_check').all();
      const messages = integrity.map((row) => String(Object.values(row)[0] ?? 'unknown'));
      if (messages.length !== 1 || messages[0] !== 'ok') throw new Error('INTEGRITY_FAILED');
      if (database.prepare('PRAGMA foreign_key_check').all().length > 0) {
        throw new Error('FOREIGN_KEY_FAILED');
      }
      const projects = database.prepare('SELECT id FROM projects LIMIT 2').all();
      if (projects.length !== 1 || String(projects[0]?.id) !== record.projectId) {
        throw new Error('PROJECT_ID_MISMATCH');
      }
      return { record, database };
    } catch {
      database?.close();
      return null;
    }
  }

  #listVersions(reader: CheckpointReader): RecoveryVersionSummary[] {
    return reader.database
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
      .all(reader.record.projectId)
      .map((row) => ({
        versionId: String(row.versionId),
        chapterId: String(row.chapterId),
        chapterTitle: String(row.chapterTitle),
        title: String(row.versionTitle),
        wordCount: Number(row.wordCount),
        createdAt: String(row.createdAt),
        finalized: Number(row.finalized) === 1,
      }));
  }

  override async getOverview(projectId: string): Promise<RecoveryOverview> {
    const overview = await super.getOverview(projectId);
    if (overview.readOnlyReason !== 'integrity-failed' || overview.exportableVersions.length > 0) {
      return overview;
    }
    const versions = new Map<string, RecoveryVersionSummary>();
    for (const record of overview.checkpoints) {
      const reader = await this.#openVerifiedCheckpoint(record);
      if (!reader) continue;
      try {
        for (const version of this.#listVersions(reader)) {
          if (!versions.has(version.versionId)) versions.set(version.versionId, version);
        }
      } finally {
        reader.database.close();
      }
    }
    return RecoveryOverviewSchema.parse({
      ...overview,
      exportableVersions: [...versions.values()].sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.versionId.localeCompare(left.versionId),
      ),
    });
  }

  #readVersion(reader: CheckpointReader, versionId: string): VersionExportData | null {
    const version = reader.database
      .prepare(
        `SELECT c.title AS chapterTitle, v.title AS versionTitle
           FROM versions v
           JOIN chapters c ON c.id = v.chapter_id
           JOIN volumes vo ON vo.id = c.volume_id
          WHERE v.id = ? AND vo.project_id = ?`,
      )
      .get(versionId, reader.record.projectId) as
      { chapterTitle: string; versionTitle: string } | undefined;
    if (!version) return null;
    const blocks = reader.database
      .prepare(
        `SELECT block_type AS blockType, text
           FROM version_blocks
          WHERE version_id = ?
          ORDER BY order_key`,
      )
      .all(versionId)
      .map((row) => ({ blockType: String(row.blockType), text: String(row.text) }));
    return { chapterTitle: version.chapterTitle, versionTitle: version.versionTitle, blocks };
  }

  async #exportCheckpointVersion(
    input: RecoveryExportInput,
    data: VersionExportData,
    targetDirectory: string,
  ): Promise<RecoveryVersionExport> {
    const directory = await existingWritableDirectory(targetDirectory);
    const fileName = `${safeName(data.chapterTitle)}-${safeName(data.versionTitle)}.txt`;
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
    const temporaryPath = `${filePath}.partial-${randomUUID()}`;
    try {
      await writeFile(temporaryPath, `${content}\n`, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, filePath);
      return RecoveryVersionExportSchema.parse({
        projectId: input.projectId,
        versionId: input.versionId,
        fileName,
        filePath,
        sizeBytes: (await stat(filePath)).size,
        sha256: await hashFile(filePath),
      });
    } catch (error) {
      await rm(temporaryPath, { force: true });
      if (error instanceof RecoveryServiceError) throw error;
      throw new RecoveryServiceError('EXPORT_WRITE_FAILED', 'The Version could not be exported.', {
        cause: error,
      });
    }
  }

  override async exportVersion(
    raw: RecoveryExportInput,
    targetDirectory: string,
  ): Promise<RecoveryVersionExport> {
    const input = RecoveryExportInputSchema.parse(raw);
    const project = this.#workspace.assertActiveProject(input.projectId);
    try {
      return await super.exportVersion(input, targetDirectory);
    } catch (error) {
      if (project.readOnlyReason !== 'integrity-failed') throw error;
    }
    const overview = await super.getOverview(input.projectId);
    for (const record of overview.checkpoints) {
      const reader = await this.#openVerifiedCheckpoint(record);
      if (!reader) continue;
      try {
        const data = this.#readVersion(reader, input.versionId);
        if (data) return await this.#exportCheckpointVersion(input, data, targetDirectory);
      } finally {
        reader.database.close();
      }
    }
    throw new RecoveryServiceError(
      'EXPORT_VERSION_REQUIRED',
      'The Version was not found in any verified checkpoint.',
    );
  }
}
