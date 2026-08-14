import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, type Stats } from 'node:fs';
import { lstat, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import {
  ResearchAttachmentDeleteInputSchema,
  ResearchAttachmentImportInputSchema,
  ResearchAttachmentPreviewInputSchema,
  ResearchAttachmentPreviewSchema,
  ResearchAttachmentSchema,
  ResearchCatalogSchema,
  ResearchLinkAddInputSchema,
  ResearchLinkRemoveInputSchema,
  ResearchLinkSchema,
  ResearchListInputSchema,
  ResearchNoteCreateInputSchema,
  ResearchNoteDeleteInputSchema,
  ResearchNoteSchema,
  ResearchNoteStatusInputSchema,
  ResearchNoteUpdateInputSchema,
  type ResearchAttachmentDeleteInput,
  type ResearchAttachmentImportInput,
  type ResearchAttachmentPreview,
  type ResearchAttachmentPreviewInput,
  type ResearchCatalog,
  type ResearchLinkAddInput,
  type ResearchLinkRemoveInput,
  type ResearchListInput,
  type ResearchNote,
  type ResearchNoteCreateInput,
  type ResearchNoteDeleteInput,
  type ResearchNoteStatusInput,
  type ResearchNoteUpdateInput,
  type ResearchSourceType,
  type ResearchTargetType,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import { sqliteResult } from './database/sqlite-result.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

export const MAX_RESEARCH_ATTACHMENT_BYTES = 268_435_456;
export const MAX_RESEARCH_PROJECT_ATTACHMENT_BYTES = 2_147_483_648;
export const MAX_RESEARCH_PREVIEW_BYTES = 262_144;
const MANAGED_RESEARCH_DIRECTORY = 'artifacts/research';
const PREVIEW_MEDIA_TYPES = new Set(['text/plain', 'text/markdown', 'application/json']);
const ATTACHMENT_MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const systemClock: DatabaseClock = { now: () => new Date() };
type ProjectDatabase = Parameters<Parameters<ProjectWorkspaceService['readProject']>[1]>[0];

export type ResearchServiceErrorCode =
  'RESEARCH_NOT_FOUND' | 'RESEARCH_INVALID' | 'RESEARCH_CONFLICT' | 'RESEARCH_ATTACHMENT_FAILED';

export class ResearchServiceError extends Error {
  readonly code: ResearchServiceErrorCode;

  constructor(code: ResearchServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ResearchServiceError';
    this.code = code;
  }
}

export interface ResearchServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface NoteRow {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly body: string;
  readonly sourceType: string | null;
  readonly sourceLabel: string | null;
  readonly sourceUri: string | null;
  readonly tagsJson: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

interface FtsNoteRow {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly sourceType: string | null;
  readonly sourceLabel: string | null;
  readonly sourceUri: string | null;
  readonly tagsJson: string;
  readonly status: string;
}

interface AttachmentPathRow {
  readonly managedRelativePath: string;
}

interface AttachmentPreviewRow extends AttachmentPathRow {
  readonly displayName: string;
  readonly mediaType: string;
  readonly sizeBytes: number | bigint;
  readonly contentHash: string;
}

interface AttachmentTotalRow {
  readonly totalBytes: number | bigint;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) {
      return parsed;
    }
  } catch {
    // handled below
  }
  throw new ResearchServiceError('RESEARCH_INVALID', 'Stored research tags are invalid.');
}

function noteFromRow(row: NoteRow): ResearchNote {
  return ResearchNoteSchema.parse({ ...row, tags: parseTags(row.tagsJson) });
}

function mediaType(fileName: string): string {
  const extension = path.extname(fileName).toLocaleLowerCase('en-US');
  const resolved = ATTACHMENT_MEDIA_TYPES[extension];
  if (!resolved) {
    throw new ResearchServiceError(
      'RESEARCH_INVALID',
      'Attachment type is not in the managed research allowlist.',
    );
  }
  return resolved;
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).toLocaleLowerCase('en-US');
  if (!ATTACHMENT_MEDIA_TYPES[extension]) {
    throw new ResearchServiceError('RESEARCH_INVALID', 'Attachment extension is not allowed.');
  }
  return extension;
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

function normalizeQuery(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

function ftsPhrase(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sameOpenedFile(before: Stats, opened: Stats, after: Stats): boolean {
  return (
    before.isFile() &&
    !before.isSymbolicLink() &&
    opened.isFile() &&
    after.isFile() &&
    !after.isSymbolicLink() &&
    before.dev === opened.dev &&
    before.ino === opened.ino &&
    after.dev === opened.dev &&
    after.ino === opened.ino &&
    before.size === opened.size &&
    after.size === opened.size
  );
}

function sourceExists(
  database: ProjectDatabase,
  projectId: string,
  sourceType: ResearchSourceType,
  sourceId: string,
): boolean {
  const table = sourceType === 'note' ? 'research_notes' : 'research_attachments';
  return (
    database
      .prepare(`SELECT 1 FROM ${table} WHERE id = ? AND project_id = ?`)
      .get(sourceId, projectId) !== undefined
  );
}

function targetExists(
  database: ProjectDatabase,
  projectId: string,
  targetType: ResearchTargetType,
  targetId: string,
): boolean {
  const queries: Record<ResearchTargetType, string> = {
    chapter:
      'SELECT 1 FROM chapters c JOIN volumes v ON v.id = c.volume_id WHERE c.id = ? AND v.project_id = ? AND c.deleted_at IS NULL AND v.deleted_at IS NULL',
    volume: 'SELECT 1 FROM volumes WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
    entity: 'SELECT 1 FROM entities WHERE id = ? AND project_id = ?',
    relationship: 'SELECT 1 FROM character_relationships WHERE id = ? AND project_id = ?',
    timeline: 'SELECT 1 FROM timeline_events WHERE id = ? AND project_id = ?',
    foreshadowing: 'SELECT 1 FROM foreshadowings WHERE id = ? AND project_id = ?',
    arc: 'SELECT 1 FROM character_arcs WHERE id = ? AND project_id = ?',
    milestone: 'SELECT 1 FROM arc_milestones WHERE id = ? AND project_id = ?',
    idea: 'SELECT 1 FROM idea_cards WHERE id = ? AND project_id = ?',
  };
  return database.prepare(queries[targetType]).get(targetId, projectId) !== undefined;
}

function refreshResearchFts(database: ProjectDatabase, projectId: string, noteId: string): void {
  database.prepare('DELETE FROM fts_research_notes WHERE note_id = ?').run(noteId);
  const row = sqliteResult<FtsNoteRow | undefined>(
    database
      .prepare(
        `SELECT id, title, body, source_type AS sourceType, source_label AS sourceLabel,
                source_uri AS sourceUri, tags_json AS tagsJson, status
           FROM research_notes WHERE id = ? AND project_id = ?`,
      )
      .get(noteId, projectId),
  );
  if (!row) return;
  database
    .prepare(
      `INSERT INTO fts_research_notes(
         project_id, note_id, status, title, body, tags, source_type, source_label, source_uri
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      projectId,
      row.id,
      row.status,
      row.title,
      row.body,
      parseTags(row.tagsJson).join(' '),
      row.sourceType ?? '',
      row.sourceLabel ?? '',
      row.sourceUri ?? '',
    );
}

export class ResearchService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: ResearchServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(raw: ResearchListInput): ResearchCatalog {
    const input = ResearchListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) =>
      this.#catalog(database, input),
    );
  }

  createNote(requestId: string, raw: ResearchNoteCreateInput): Promise<ResearchCatalog> {
    const input = ResearchNoteCreateInputSchema.parse(raw);
    const noteId = this.#idFactory();
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      database
        .prepare(
          `INSERT INTO research_notes(
             id, project_id, title, body, source_type, source_label, source_uri, tags_json,
             status, created_at, updated_at, archived_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, NULL)`,
        )
        .run(
          noteId,
          input.projectId,
          input.title,
          input.body,
          input.sourceType,
          input.sourceLabel,
          input.sourceUri,
          JSON.stringify(input.tags),
          now,
          now,
        );
      refreshResearchFts(database, input.projectId, noteId);
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  updateNote(requestId: string, raw: ResearchNoteUpdateInput): Promise<ResearchCatalog> {
    const input = ResearchNoteUpdateInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const changed = database
        .prepare(
          `UPDATE research_notes
              SET title = ?, body = ?, source_type = ?, source_label = ?, source_uri = ?,
                  tags_json = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND updated_at = ?`,
        )
        .run(
          input.title,
          input.body,
          input.sourceType,
          input.sourceLabel,
          input.sourceUri,
          JSON.stringify(input.tags),
          now,
          input.noteId,
          input.projectId,
          input.expectedUpdatedAt,
        );
      if (Number(changed.changes) !== 1) {
        this.#throwWriteConflict(database, input.projectId, input.noteId);
      }
      refreshResearchFts(database, input.projectId, input.noteId);
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  setNoteStatus(requestId: string, raw: ResearchNoteStatusInput): Promise<ResearchCatalog> {
    const input = ResearchNoteStatusInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const changed = database
        .prepare(
          `UPDATE research_notes
              SET status = ?, updated_at = ?, archived_at = ?
            WHERE id = ? AND project_id = ? AND updated_at = ?`,
        )
        .run(
          input.status,
          now,
          input.status === 'archived' ? now : null,
          input.noteId,
          input.projectId,
          input.expectedUpdatedAt,
        );
      if (Number(changed.changes) !== 1) {
        this.#throwWriteConflict(database, input.projectId, input.noteId);
      }
      refreshResearchFts(database, input.projectId, input.noteId);
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  deleteNote(requestId: string, raw: ResearchNoteDeleteInput): Promise<ResearchCatalog> {
    const input = ResearchNoteDeleteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const current = database
        .prepare('SELECT updated_at AS updatedAt FROM research_notes WHERE id = ? AND project_id = ?')
        .get(input.noteId, input.projectId) as { updatedAt?: string } | undefined;
      if (!current) {
        throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research note not found.');
      }
      if (current.updatedAt !== input.expectedUpdatedAt) {
        throw new ResearchServiceError('RESEARCH_CONFLICT', 'Research note changed before deletion.');
      }
      database
        .prepare(
          `DELETE FROM research_links
            WHERE project_id = ? AND source_type = 'note' AND source_id = ?`,
        )
        .run(input.projectId, input.noteId);
      database.prepare('DELETE FROM fts_research_notes WHERE note_id = ?').run(input.noteId);
      const deleted = database
        .prepare('DELETE FROM research_notes WHERE id = ? AND project_id = ? AND updated_at = ?')
        .run(input.noteId, input.projectId, input.expectedUpdatedAt);
      if (Number(deleted.changes) !== 1) {
        throw new ResearchServiceError('RESEARCH_CONFLICT', 'Research note changed before deletion.');
      }
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  async importAttachment(
    requestId: string,
    raw: ResearchAttachmentImportInput,
    sourcePath: string,
  ): Promise<ResearchCatalog> {
    const input = ResearchAttachmentImportInputSchema.parse(raw);
    if (!path.isAbsolute(sourcePath)) {
      throw new ResearchServiceError(
        'RESEARCH_INVALID',
        'Attachment source path must be absolute.',
      );
    }
    const resolvedMediaType = mediaType(sourcePath);
    const extension = safeExtension(sourcePath);
    const before = await lstat(sourcePath).catch((error: unknown) => {
      throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment cannot be read.', {
        cause: error,
      });
    });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size > MAX_RESEARCH_ATTACHMENT_BYTES
    ) {
      throw new ResearchServiceError(
        'RESEARCH_INVALID',
        'Attachment must be a regular file no larger than 256 MiB.',
      );
    }
    if (input.noteId && !this.#noteExists(input.projectId, input.noteId)) {
      throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research note not found.');
    }

    const sourceHandle = await open(sourcePath, 'r').catch((error: unknown) => {
      throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment cannot be opened.', {
        cause: error,
      });
    });
    const attachmentId = this.#idFactory();
    const relativePath = `${MANAGED_RESEARCH_DIRECTORY}/${attachmentId}${extension}`;
    const targetPath = await this.#workspace.resolveProjectPath(input.projectId, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    const partialPath = `${targetPath}.partial-${this.#idFactory()}`;
    let targetCreated = false;
    try {
      const opened = await sourceHandle.stat();
      const after = await lstat(sourcePath);
      if (
        !sameOpenedFile(before, opened, after) ||
        opened.size > MAX_RESEARCH_ATTACHMENT_BYTES
      ) {
        throw new ResearchServiceError(
          'RESEARCH_INVALID',
          'Attachment changed while it was being opened.',
        );
      }
      await pipeline(
        sourceHandle.createReadStream({ autoClose: false }),
        createWriteStream(partialPath, { flags: 'wx', mode: 0o600 }),
      );
      const copied = await stat(partialPath);
      if (
        !copied.isFile() ||
        copied.size !== opened.size ||
        copied.size > MAX_RESEARCH_ATTACHMENT_BYTES
      ) {
        throw new ResearchServiceError(
          'RESEARCH_ATTACHMENT_FAILED',
          'Attachment copy was incomplete.',
        );
      }
      const contentHash = await hashFile(partialPath);
      await rename(partialPath, targetPath);
      targetCreated = true;
      const now = this.#clock.now().toISOString();
      const displayName = path.basename(sourcePath).slice(0, 240) || '资料附件';
      return await this.#workspace.writeProject(requestId, input.projectId, (database) => {
        const duplicate = database
          .prepare('SELECT id FROM research_attachments WHERE project_id = ? AND content_hash = ?')
          .get(input.projectId, contentHash);
        if (duplicate) {
          throw new ResearchServiceError(
            'RESEARCH_CONFLICT',
            'The same attachment content is already managed by this project.',
          );
        }
        const totalRow = sqliteResult<AttachmentTotalRow>(
          database
            .prepare(
              'SELECT COALESCE(SUM(size_bytes), 0) AS totalBytes FROM research_attachments WHERE project_id = ?',
            )
            .get(input.projectId),
        );
        const totalBytes = Number(totalRow.totalBytes);
        if (totalBytes + copied.size > MAX_RESEARCH_PROJECT_ATTACHMENT_BYTES) {
          throw new ResearchServiceError(
            'RESEARCH_INVALID',
            'Project research attachments exceed the 2 GiB managed-storage limit.',
          );
        }
        database
          .prepare(
            `INSERT INTO research_attachments(
               id, project_id, note_id, display_name, media_type, size_bytes,
               content_hash, managed_relative_path, created_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            attachmentId,
            input.projectId,
            input.noteId,
            displayName,
            resolvedMediaType,
            copied.size,
            contentHash,
            relativePath,
            now,
          );
        return this.#catalog(database, {
          projectId: input.projectId,
          includeArchived: true,
        });
      });
    } catch (error) {
      if (targetCreated) await rm(targetPath, { force: true });
      if (error instanceof ResearchServiceError) throw error;
      throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment import failed.', {
        cause: error,
      });
    } finally {
      await sourceHandle.close();
      await rm(partialPath, { force: true });
    }
  }

  async previewAttachment(raw: ResearchAttachmentPreviewInput): Promise<ResearchAttachmentPreview> {
    const input = ResearchAttachmentPreviewInputSchema.parse(raw);
    const attachment = this.#workspace.readProject(input.projectId, (database) =>
      sqliteResult<AttachmentPreviewRow | undefined>(
        database
          .prepare(
            `SELECT display_name AS displayName, media_type AS mediaType, size_bytes AS sizeBytes,
                    content_hash AS contentHash, managed_relative_path AS managedRelativePath
               FROM research_attachments WHERE id = ? AND project_id = ?`,
          )
          .get(input.attachmentId, input.projectId),
      ),
    );
    if (!attachment) {
      throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Attachment not found.');
    }
    if (!PREVIEW_MEDIA_TYPES.has(attachment.mediaType)) {
      throw new ResearchServiceError(
        'RESEARCH_INVALID',
        'This attachment type is stored safely but is not eligible for inline preview.',
      );
    }
    const targetPath = await this.#workspace.resolveProjectPath(
      input.projectId,
      attachment.managedRelativePath,
    );
    const before = await lstat(targetPath).catch((error: unknown) => {
      throw new ResearchServiceError(
        'RESEARCH_ATTACHMENT_FAILED',
        'Managed attachment is missing.',
        { cause: error },
      );
    });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size !== Number(attachment.sizeBytes) ||
      before.size > MAX_RESEARCH_ATTACHMENT_BYTES
    ) {
      throw new ResearchServiceError(
        'RESEARCH_ATTACHMENT_FAILED',
        'Managed attachment metadata no longer matches the stored file.',
      );
    }
    const actualHash = await hashFile(targetPath);
    if (actualHash !== attachment.contentHash) {
      throw new ResearchServiceError(
        'RESEARCH_ATTACHMENT_FAILED',
        'Managed attachment hash verification failed.',
      );
    }
    const handle = await open(targetPath, 'r');
    try {
      const readSize = Math.min(before.size, MAX_RESEARCH_PREVIEW_BYTES + 1);
      const buffer = Buffer.alloc(readSize);
      const { bytesRead } = await handle.read(buffer, 0, readSize, 0);
      const truncated = before.size > MAX_RESEARCH_PREVIEW_BYTES;
      let text: string;
      try {
        text = new TextDecoder('utf-8', { fatal: true }).decode(
          buffer.subarray(0, Math.min(bytesRead, MAX_RESEARCH_PREVIEW_BYTES)),
        );
      } catch (error) {
        throw new ResearchServiceError(
          'RESEARCH_INVALID',
          'Inline preview requires valid UTF-8 text.',
          { cause: error },
        );
      }
      return ResearchAttachmentPreviewSchema.parse({
        projectId: input.projectId,
        attachmentId: input.attachmentId,
        displayName: attachment.displayName,
        mediaType: attachment.mediaType,
        contentHash: attachment.contentHash,
        text,
        truncated,
      });
    } finally {
      await handle.close();
    }
  }

  async deleteAttachment(
    requestId: string,
    raw: ResearchAttachmentDeleteInput,
  ): Promise<ResearchCatalog> {
    const input = ResearchAttachmentDeleteInputSchema.parse(raw);
    const attachment = this.#workspace.readProject(input.projectId, (database) =>
      sqliteResult<AttachmentPathRow | undefined>(
        database
          .prepare(
            `SELECT managed_relative_path AS managedRelativePath
             FROM research_attachments WHERE id = ? AND project_id = ?`,
          )
          .get(input.attachmentId, input.projectId),
      ),
    );
    if (!attachment) {
      if (await this.#completeDetachedAttachmentDelete(input.projectId, input.attachmentId)) {
        return this.list({ projectId: input.projectId, includeArchived: true });
      }
      throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Attachment not found.');
    }
    const targetPath = await this.#workspace.resolveProjectPath(
      input.projectId,
      attachment.managedRelativePath,
    );
    const stagedPath = `${targetPath}.deleting-${input.attachmentId}`;
    let staged = false;
    let databaseCommitted = false;
    try {
      try {
        await rename(targetPath, stagedPath);
        staged = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
        if (!(await fileExists(stagedPath))) {
          throw new ResearchServiceError(
            'RESEARCH_ATTACHMENT_FAILED',
            'Attachment metadata points to a missing managed file.',
            { cause: error },
          );
        }
        staged = true;
      }
      const catalog = await this.#workspace.writeProject(requestId, input.projectId, (database) => {
        database
          .prepare(
            `DELETE FROM research_links
                WHERE project_id = ? AND source_type = 'attachment' AND source_id = ?`,
          )
          .run(input.projectId, input.attachmentId);
        const deleted = database
          .prepare('DELETE FROM research_attachments WHERE id = ? AND project_id = ?')
          .run(input.attachmentId, input.projectId);
        if (Number(deleted.changes) !== 1) {
          throw new ResearchServiceError(
            'RESEARCH_CONFLICT',
            'Attachment changed before deletion.',
          );
        }
        return this.#catalog(database, {
          projectId: input.projectId,
          includeArchived: true,
        });
      });
      databaseCommitted = true;
      try {
        await rm(stagedPath, { force: true });
      } catch (error) {
        throw new ResearchServiceError(
          'RESEARCH_ATTACHMENT_FAILED',
          'Attachment metadata was removed, but staged-file cleanup did not finish.',
          { cause: error },
        );
      }
      return catalog;
    } catch (error) {
      if (staged && !databaseCommitted) {
        try {
          await rename(stagedPath, targetPath);
        } catch (compensationError) {
          throw new ResearchServiceError(
            'RESEARCH_ATTACHMENT_FAILED',
            'Attachment deletion failed and its filesystem rollback also failed.',
            { cause: new AggregateError([error, compensationError]) },
          );
        }
      }
      throw error;
    }
  }

  addLink(requestId: string, raw: ResearchLinkAddInput): Promise<ResearchCatalog> {
    const input = ResearchLinkAddInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      if (!sourceExists(database, input.projectId, input.sourceType, input.sourceId)) {
        throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research source not found.');
      }
      if (!targetExists(database, input.projectId, input.targetType, input.targetId)) {
        throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research link target not found.');
      }
      database
        .prepare(
          `INSERT INTO research_links(
             id, project_id, source_type, source_id, target_type, target_id, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(project_id, source_type, source_id, target_type, target_id) DO NOTHING`,
        )
        .run(
          this.#idFactory(),
          input.projectId,
          input.sourceType,
          input.sourceId,
          input.targetType,
          input.targetId,
          this.#clock.now().toISOString(),
        );
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  removeLink(requestId: string, raw: ResearchLinkRemoveInput): Promise<ResearchCatalog> {
    const input = ResearchLinkRemoveInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const deleted = database
        .prepare('DELETE FROM research_links WHERE id = ? AND project_id = ?')
        .run(input.linkId, input.projectId);
      if (Number(deleted.changes) !== 1) {
        throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research link not found.');
      }
      return this.#catalog(database, {
        projectId: input.projectId,
        includeArchived: true,
      });
    });
  }

  #noteExists(projectId: string, noteId: string): boolean {
    return this.#workspace.readProject(
      projectId,
      (database) =>
        database
          .prepare('SELECT 1 FROM research_notes WHERE id = ? AND project_id = ?')
          .get(noteId, projectId) !== undefined,
    );
  }

  async #completeDetachedAttachmentDelete(
    projectId: string,
    attachmentId: string,
  ): Promise<boolean> {
    const directory = await this.#workspace.resolveProjectPath(
      projectId,
      MANAGED_RESEARCH_DIRECTORY,
    );
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (isMissing(error)) return false;
      throw new ResearchServiceError(
        'RESEARCH_ATTACHMENT_FAILED',
        'Pending attachment deletion could not be inspected.',
        { cause: error },
      );
    }
    const suffix = `.deleting-${attachmentId}`;
    const matches = names.filter((name) => name.endsWith(suffix));
    if (matches.length === 0) return false;
    if (matches.length > 1) {
      throw new ResearchServiceError(
        'RESEARCH_CONFLICT',
        'Multiple staged files exist for the same attachment deletion.',
      );
    }
    try {
      await rm(path.join(directory, matches[0]!), { force: true });
      return true;
    } catch (error) {
      throw new ResearchServiceError(
        'RESEARCH_ATTACHMENT_FAILED',
        'Pending attachment deletion could not be completed.',
        { cause: error },
      );
    }
  }

  #throwWriteConflict(database: ProjectDatabase, projectId: string, noteId: string): never {
    const exists = database
      .prepare('SELECT 1 FROM research_notes WHERE id = ? AND project_id = ?')
      .get(noteId, projectId);
    throw new ResearchServiceError(
      exists ? 'RESEARCH_CONFLICT' : 'RESEARCH_NOT_FOUND',
      exists ? 'The research note changed before this update.' : 'Research note not found.',
    );
  }

  #catalog(database: ProjectDatabase, raw: ResearchListInput): ResearchCatalog {
    const input = ResearchListInputSchema.parse(raw);
    const query = input.query ? normalizeQuery(input.query) : '';
    const noteSql = query
      ? query.length >= 3
        ? `SELECT n.id, n.project_id AS projectId, n.title, n.body,
                  n.source_type AS sourceType, n.source_label AS sourceLabel,
                  n.source_uri AS sourceUri, n.tags_json AS tagsJson, n.status,
                  n.created_at AS createdAt, n.updated_at AS updatedAt, n.archived_at AS archivedAt
             FROM fts_research_notes
             JOIN research_notes n
               ON n.id = fts_research_notes.note_id
              AND n.project_id = fts_research_notes.project_id
            WHERE n.project_id = ?
              AND fts_research_notes MATCH ?
              ${input.includeArchived ? '' : "AND n.status = 'active'"}
            ORDER BY n.status = 'archived', n.updated_at DESC, n.id`
        : `SELECT id, project_id AS projectId, title, body, source_type AS sourceType,
                  source_label AS sourceLabel, source_uri AS sourceUri, tags_json AS tagsJson,
                  status, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt
             FROM research_notes
            WHERE project_id = ?
              ${input.includeArchived ? '' : "AND status = 'active'"}
              AND (
                instr(lower(title), ?) > 0 OR
                instr(lower(body), ?) > 0 OR
                instr(lower(tags_json), ?) > 0 OR
                instr(lower(COALESCE(source_type, '')), ?) > 0 OR
                instr(lower(COALESCE(source_label, '')), ?) > 0 OR
                instr(lower(COALESCE(source_uri, '')), ?) > 0
              )
            ORDER BY status = 'archived', updated_at DESC, id`
      : `SELECT id, project_id AS projectId, title, body, source_type AS sourceType,
                source_label AS sourceLabel, source_uri AS sourceUri, tags_json AS tagsJson,
                status, created_at AS createdAt, updated_at AS updatedAt, archived_at AS archivedAt
           FROM research_notes
          WHERE project_id = ?
            ${input.includeArchived ? '' : "AND status = 'active'"}
          ORDER BY status = 'archived', updated_at DESC, id`;
    const noteParameters = query
      ? query.length >= 3
        ? [input.projectId, ftsPhrase(query)]
        : [input.projectId, query, query, query, query, query, query]
      : [input.projectId];
    let notes = sqliteResult<NoteRow[]>(database.prepare(noteSql).all(...noteParameters))
      .map(noteFromRow)
      .filter((note) => !input.tags?.length || input.tags.every((tag) => note.tags.includes(tag)))
      .filter((note) => input.noteSourceType === undefined || note.sourceType === input.noteSourceType);
    const noteIds = new Set(notes.map((note) => note.id));
    let attachments = sqliteResult<Record<string, unknown>[]>(
      database
        .prepare(
          `SELECT id, project_id AS projectId, note_id AS noteId, display_name AS displayName,
                  media_type AS mediaType, size_bytes AS sizeBytes, content_hash AS contentHash,
                  managed_relative_path AS managedRelativePath, created_at AS createdAt
             FROM research_attachments WHERE project_id = ?
            ORDER BY created_at DESC, id`,
        )
        .all(input.projectId),
    )
      .map((row) =>
        ResearchAttachmentSchema.parse({
          ...row,
          sizeBytes: Number(row.sizeBytes),
        }),
      )
      .filter((attachment) => attachment.noteId === null || noteIds.has(attachment.noteId));
    let sourceIds = new Set([...noteIds, ...attachments.map((attachment) => attachment.id)]);
    let links = sqliteResult<Record<string, unknown>[]>(
      database
        .prepare(
          `SELECT id, project_id AS projectId, source_type AS sourceType, source_id AS sourceId,
                  target_type AS targetType, target_id AS targetId, created_at AS createdAt
             FROM research_links WHERE project_id = ?
            ORDER BY created_at DESC, id`,
        )
        .all(input.projectId),
    )
      .map((row) => ResearchLinkSchema.parse(row))
      .filter((link) => sourceIds.has(link.sourceId));

    if (input.targetType !== undefined || input.targetId !== undefined) {
      links = links.filter(
        (link) =>
          (input.targetType === undefined || link.targetType === input.targetType) &&
          (input.targetId === undefined || link.targetId === input.targetId),
      );
      const linkedSources = new Set(links.map((link) => `${link.sourceType}:${link.sourceId}`));
      notes = notes.filter((note) => linkedSources.has(`note:${note.id}`));
      attachments = attachments.filter((attachment) =>
        linkedSources.has(`attachment:${attachment.id}`),
      );
      sourceIds = new Set([...notes.map((note) => note.id), ...attachments.map((item) => item.id)]);
      links = links.filter((link) => sourceIds.has(link.sourceId));
    }

    return ResearchCatalogSchema.parse({
      projectId: input.projectId,
      notes,
      attachments,
      links,
    });
  }
}
