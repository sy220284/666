import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import {
  ResearchAttachmentDeleteInputSchema,
  ResearchAttachmentImportInputSchema,
  ResearchAttachmentSchema,
  ResearchCatalogSchema,
  ResearchLinkAddInputSchema,
  ResearchLinkRemoveInputSchema,
  ResearchLinkSchema,
  ResearchListInputSchema,
  ResearchNoteCreateInputSchema,
  ResearchNoteSchema,
  ResearchNoteStatusInputSchema,
  ResearchNoteUpdateInputSchema,
  type ResearchAttachmentDeleteInput,
  type ResearchAttachmentImportInput,
  type ResearchCatalog,
  type ResearchLinkAddInput,
  type ResearchLinkRemoveInput,
  type ResearchListInput,
  type ResearchNote,
  type ResearchNoteCreateInput,
  type ResearchNoteStatusInput,
  type ResearchNoteUpdateInput,
  type ResearchSourceType,
  type ResearchTargetType,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const MAX_ATTACHMENT_BYTES = 268_435_456;
const MANAGED_RESEARCH_DIRECTORY = 'artifacts/research';
const systemClock: DatabaseClock = { now: () => new Date() };
type ProjectDatabase = Parameters<Parameters<ProjectWorkspaceService['readProject']>[1]>[0];

export type ResearchServiceErrorCode =
  | 'RESEARCH_NOT_FOUND'
  | 'RESEARCH_INVALID'
  | 'RESEARCH_CONFLICT'
  | 'RESEARCH_ATTACHMENT_FAILED';

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
  readonly sourceUri: string | null;
  readonly tagsJson: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

function parseTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) return parsed;
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
  return (
    {
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as Readonly<Record<string, string>>
  )[extension] ?? 'application/octet-stream';
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).toLocaleLowerCase('en-US');
  return /^\.[a-z0-9]{1,16}$/u.test(extension) ? extension : '';
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

function sourceExists(
  database: ProjectDatabase,
  projectId: string,
  sourceType: ResearchSourceType,
  sourceId: string,
): boolean {
  const table = sourceType === 'note' ? 'research_notes' : 'research_attachments';
  return database.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND project_id = ?`).get(sourceId, projectId) !== undefined;
}

function targetExists(
  database: ProjectDatabase,
  projectId: string,
  targetType: ResearchTargetType,
  targetId: string,
): boolean {
  const queries: Record<ResearchTargetType, string> = {
    chapter:
      'SELECT 1 FROM chapters c JOIN volumes v ON v.id = c.volume_id WHERE c.id = ? AND v.project_id = ?',
    entity: 'SELECT 1 FROM entities WHERE id = ? AND project_id = ?',
    relationship: 'SELECT 1 FROM character_relationships WHERE id = ? AND project_id = ?',
    timeline: 'SELECT 1 FROM timeline_events WHERE id = ? AND project_id = ?',
    foreshadowing: 'SELECT 1 FROM foreshadowings WHERE id = ? AND project_id = ?',
    arc: 'SELECT 1 FROM character_arcs WHERE id = ? AND project_id = ?',
    idea: 'SELECT 1 FROM idea_cards WHERE id = ? AND project_id = ?',
  };
  return database.prepare(queries[targetType]).get(targetId, projectId) !== undefined;
}

function refreshResearchFts(database: ProjectDatabase, projectId: string, noteId: string): void {
  database.prepare('DELETE FROM fts_research_notes WHERE note_id = ?').run(noteId);
  const row = database
    .prepare(
      `SELECT id, title, body, source_uri AS sourceUri, tags_json AS tagsJson, status
         FROM research_notes WHERE id = ? AND project_id = ?`,
    )
    .get(noteId, projectId) as
    | { id: string; title: string; body: string; sourceUri: string | null; tagsJson: string; status: string }
    | undefined;
  if (!row) return;
  database
    .prepare(
      `INSERT INTO fts_research_notes(project_id, note_id, status, title, body, tags, source_uri)
       VALUES(?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(projectId, row.id, row.status, row.title, row.body, parseTags(row.tagsJson).join(' '), row.sourceUri ?? '');
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
    return this.#workspace.readProject(input.projectId, (database) => this.#catalog(database, input));
  }

  createNote(requestId: string, raw: ResearchNoteCreateInput): Promise<ResearchCatalog> {
    const input = ResearchNoteCreateInputSchema.parse(raw);
    const noteId = this.#idFactory();
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      database
        .prepare(
          `INSERT INTO research_notes(
             id, project_id, title, body, source_uri, tags_json, status, created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        )
        .run(noteId, input.projectId, input.title, input.body, input.sourceUri, JSON.stringify(input.tags), now, now);
      refreshResearchFts(database, input.projectId, noteId);
      return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
    });
  }

  updateNote(requestId: string, raw: ResearchNoteUpdateInput): Promise<ResearchCatalog> {
    const input = ResearchNoteUpdateInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const changed = database
        .prepare(
          `UPDATE research_notes
              SET title = ?, body = ?, source_uri = ?, tags_json = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND updated_at = ?`,
        )
        .run(
          input.title,
          input.body,
          input.sourceUri,
          JSON.stringify(input.tags),
          now,
          input.noteId,
          input.projectId,
          input.expectedUpdatedAt,
        );
      if (Number(changed.changes) !== 1) this.#throwWriteConflict(database, input.projectId, input.noteId);
      refreshResearchFts(database, input.projectId, input.noteId);
      return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
    });
  }

  setNoteStatus(requestId: string, raw: ResearchNoteStatusInput): Promise<ResearchCatalog> {
    const input = ResearchNoteStatusInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const changed = database
        .prepare(
          `UPDATE research_notes SET status = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND updated_at = ?`,
        )
        .run(input.status, now, input.noteId, input.projectId, input.expectedUpdatedAt);
      if (Number(changed.changes) !== 1) this.#throwWriteConflict(database, input.projectId, input.noteId);
      refreshResearchFts(database, input.projectId, input.noteId);
      return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
    });
  }

  async importAttachment(
    requestId: string,
    raw: ResearchAttachmentImportInput,
    sourcePath: string,
  ): Promise<ResearchCatalog> {
    const input = ResearchAttachmentImportInputSchema.parse(raw);
    if (!path.isAbsolute(sourcePath)) {
      throw new ResearchServiceError('RESEARCH_INVALID', 'Attachment source path must be absolute.');
    }
    const details = await lstat(sourcePath).catch((error: unknown) => {
      throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment cannot be read.', { cause: error });
    });
    if (!details.isFile() || details.isSymbolicLink() || details.size > MAX_ATTACHMENT_BYTES) {
      throw new ResearchServiceError('RESEARCH_INVALID', 'Attachment must be a regular file no larger than 256 MiB.');
    }
    if (input.noteId && !this.#noteExists(input.projectId, input.noteId)) {
      throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Research note not found.');
    }

    const attachmentId = this.#idFactory();
    const relativePath = `${MANAGED_RESEARCH_DIRECTORY}/${attachmentId}${safeExtension(sourcePath)}`;
    const targetPath = await this.#workspace.resolveProjectPath(input.projectId, relativePath);
    await mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
    const partialPath = `${targetPath}.partial-${this.#idFactory()}`;
    let targetCreated = false;
    try {
      await copyFile(sourcePath, partialPath);
      const copied = await stat(partialPath);
      if (!copied.isFile() || copied.size !== details.size || copied.size > MAX_ATTACHMENT_BYTES) {
        throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment copy was incomplete.');
      }
      const contentHash = await hashFile(partialPath);
      await rename(partialPath, targetPath);
      targetCreated = true;
      const now = this.#clock.now().toISOString();
      const displayName = path.basename(sourcePath).slice(0, 240) || '资料附件';
      return await this.#workspace.writeProject(requestId, input.projectId, (database) => {
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
            mediaType(sourcePath),
            copied.size,
            contentHash,
            relativePath,
            now,
          );
        return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
      });
    } catch (error) {
      if (targetCreated) await rm(targetPath, { force: true });
      if (error instanceof ResearchServiceError) throw error;
      throw new ResearchServiceError('RESEARCH_ATTACHMENT_FAILED', 'Attachment import failed.', { cause: error });
    } finally {
      await rm(partialPath, { force: true });
    }
  }

  async deleteAttachment(
    requestId: string,
    raw: ResearchAttachmentDeleteInput,
  ): Promise<ResearchCatalog> {
    const input = ResearchAttachmentDeleteInputSchema.parse(raw);
    const attachment = this.#workspace.readProject(input.projectId, (database) =>
      database
        .prepare(
          `SELECT managed_relative_path AS managedRelativePath
             FROM research_attachments WHERE id = ? AND project_id = ?`,
        )
        .get(input.attachmentId, input.projectId) as { managedRelativePath: string } | undefined,
    );
    if (!attachment) throw new ResearchServiceError('RESEARCH_NOT_FOUND', 'Attachment not found.');
    const targetPath = await this.#workspace.resolveProjectPath(input.projectId, attachment.managedRelativePath);
    const stagedPath = `${targetPath}.deleting-${this.#idFactory()}`;
    let staged = false;
    try {
      try {
        await rename(targetPath, stagedPath);
        staged = true;
      } catch (error) {
        const missing = error instanceof Error && 'code' in error && error.code === 'ENOENT';
        if (!missing) throw error;
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
          throw new ResearchServiceError('RESEARCH_CONFLICT', 'Attachment changed before deletion.');
        }
        return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
      });
      if (staged) await rm(stagedPath, { force: true });
      return catalog;
    } catch (error) {
      if (staged) await rename(stagedPath, targetPath).catch(() => undefined);
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
      return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
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
      return this.#catalog(database, { projectId: input.projectId, includeArchived: true });
    });
  }

  #noteExists(projectId: string, noteId: string): boolean {
    return this.#workspace.readProject(
      projectId,
      (database) =>
        database.prepare('SELECT 1 FROM research_notes WHERE id = ? AND project_id = ?').get(noteId, projectId) !==
        undefined,
    );
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
    const notes = (database
      .prepare(
        `SELECT id, project_id AS projectId, title, body, source_uri AS sourceUri,
                tags_json AS tagsJson, status, created_at AS createdAt, updated_at AS updatedAt
           FROM research_notes WHERE project_id = ?
          ORDER BY status = 'archived', updated_at DESC, id`,
      )
      .all(input.projectId) as unknown as NoteRow[])
      .map(noteFromRow)
      .filter((note) => input.includeArchived || note.status === 'active')
      .filter((note) => !input.tags?.length || input.tags.every((tag) => note.tags.includes(tag)))
      .filter((note) => {
        if (!input.query) return true;
        const query = normalizeQuery(input.query);
        return normalizeQuery(`${note.title}\n${note.body}\n${note.tags.join(' ')}\n${note.sourceUri ?? ''}`).includes(query);
      });
    const noteIds = new Set(notes.map((note) => note.id));
    const attachments = (database
      .prepare(
        `SELECT id, project_id AS projectId, note_id AS noteId, display_name AS displayName,
                media_type AS mediaType, size_bytes AS sizeBytes, content_hash AS contentHash,
                managed_relative_path AS managedRelativePath, created_at AS createdAt
           FROM research_attachments WHERE project_id = ?
          ORDER BY created_at DESC, id`,
      )
      .all(input.projectId) as unknown as Record<string, unknown>[])
      .map((row) => ResearchAttachmentSchema.parse({ ...row, sizeBytes: Number(row.sizeBytes) }))
      .filter((attachment) => attachment.noteId === null || noteIds.has(attachment.noteId));
    const sourceIds = new Set([...noteIds, ...attachments.map((attachment) => attachment.id)]);
    const links = (database
      .prepare(
        `SELECT id, project_id AS projectId, source_type AS sourceType, source_id AS sourceId,
                target_type AS targetType, target_id AS targetId, created_at AS createdAt
           FROM research_links WHERE project_id = ?
          ORDER BY created_at DESC, id`,
      )
      .all(input.projectId) as unknown as Record<string, unknown>[])
      .map((row) => ResearchLinkSchema.parse(row))
      .filter((link) => sourceIds.has(link.sourceId));
    return ResearchCatalogSchema.parse({ projectId: input.projectId, notes, attachments, links });
  }
}
