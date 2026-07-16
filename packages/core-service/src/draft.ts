import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  DraftBlockAttributesSchema,
  DraftDocumentSchema,
  DraftOpenInputSchema,
  DraftSaveSnapshotInputSchema,
  type DraftBlock,
  type DraftDocument,
  type DraftOpenInput,
  type DraftSaveSnapshotInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type DraftServiceErrorCode =
  'DRAFT_NOT_FOUND' | 'DRAFT_BLOCK_NOT_FOUND' | 'DRAFT_INVARIANT_FAILED';

export class DraftServiceError extends Error {
  readonly code: DraftServiceErrorCode;

  constructor(code: DraftServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DraftServiceError';
    this.code = code;
  }
}

export interface DraftServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (stage: 'after-block-delete') => void;
}

interface DraftRow {
  readonly id: string;
  readonly chapterId: string;
  readonly status: 'active' | 'archived';
  readonly revision: number;
}

interface StoredBlockRow {
  readonly id: string;
  readonly logicalBlockId: string;
  readonly source: DraftBlock['source'];
  readonly locked: boolean;
  readonly revision: number;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Expected SQLite text.');
  return value;
}

function nonnegativeInteger(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'Draft revision exceeded the supported safe integer range.',
    );
  }
  return Number(parsed);
}

function orderKey(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block order key is invalid.');
}

function draftRow(row: Record<string, unknown>): DraftRow {
  const status = text(row.status);
  if (status !== 'active' && status !== 'archived') {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft status is invalid.');
  }
  return {
    id: text(row.id),
    chapterId: text(row.chapter_id),
    status,
    revision: nonnegativeInteger(row.revision),
  };
}

function activeChapter(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): { readonly activeDraftId: string | null } {
  const row = connection
    .prepare(
      `SELECT c.active_draft_id
         FROM chapters c
         JOIN volumes v ON v.id = c.volume_id
        WHERE c.id = ? AND v.project_id = ?
          AND c.deleted_at IS NULL AND v.deleted_at IS NULL`,
    )
    .get(chapterId, projectId);
  if (!row) {
    throw new DraftServiceError('DRAFT_NOT_FOUND', 'The active chapter was not found.');
  }
  return {
    activeDraftId:
      row.active_draft_id === null || row.active_draft_id === undefined
        ? null
        : text(row.active_draft_id),
  };
}

function activeDraft(connection: DatabaseSync, chapterId: string): DraftRow | null {
  const row = connection
    .prepare(
      `SELECT id, chapter_id, status, revision
         FROM drafts
        WHERE chapter_id = ? AND status = 'active'`,
    )
    .get(chapterId);
  return row ? draftRow(row) : null;
}

function parseAttributes(raw: unknown): DraftBlock['attributes'] {
  try {
    return DraftBlockAttributesSchema.parse(JSON.parse(text(raw)));
  } catch (error) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block attributes are invalid.', {
      cause: error,
    });
  }
}

function readDocument(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  draft: DraftRow,
): DraftDocument {
  const blocks = connection
    .prepare(
      `SELECT logical_block_id, order_key, block_type, text, attributes_json,
              source, locked, content_hash
         FROM draft_blocks
        WHERE draft_id = ?
        ORDER BY order_key, id`,
    )
    .all(draft.id)
    .map((row) => ({
      logicalBlockId: text(row.logical_block_id),
      orderKey: orderKey(row.order_key),
      blockType: text(row.block_type),
      text: text(row.text),
      attributes: parseAttributes(row.attributes_json),
      source: text(row.source),
      locked: row.locked === 1n || row.locked === 1,
      contentHash:
        row.content_hash === null || row.content_hash === undefined ? null : text(row.content_hash),
    }));
  if (blocks.length === 0) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'An active Draft must contain at least one DraftBlock.',
    );
  }
  return DraftDocumentSchema.parse({
    projectId,
    chapterId,
    draftId: draft.id,
    status: draft.status,
    revision: draft.revision,
    blocks,
  });
}

function readExistingDocument(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): DraftDocument | null {
  const chapter = activeChapter(connection, projectId, chapterId);
  const draft = activeDraft(connection, chapterId);
  if (!draft && chapter.activeDraftId) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'The chapter active Draft pointer is dangling.',
    );
  }
  if (!draft) return null;
  if (chapter.activeDraftId !== draft.id) {
    throw new DraftServiceError(
      'DRAFT_INVARIANT_FAILED',
      'The chapter active Draft pointer does not match the active Draft.',
    );
  }
  return readDocument(connection, projectId, chapterId, draft);
}

export function draftTablesAvailable(connection: DatabaseSync): boolean {
  return Boolean(
    connection.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='drafts'").get(),
  );
}

export function initializeChapterDraft(
  connection: DatabaseSync,
  chapterId: string,
  timestamp: string,
  idFactory: () => string = randomUUID,
): string {
  const existing = activeDraft(connection, chapterId);
  if (existing) return existing.id;
  const draftId = idFactory();
  const blockId = idFactory();
  const logicalBlockId = idFactory();
  connection
    .prepare(
      `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
       VALUES(?, ?, 'active', 0, ?, ?)`,
    )
    .run(draftId, chapterId, timestamp, timestamp);
  connection
    .prepare(
      `INSERT INTO draft_blocks(
         id, draft_id, logical_block_id, order_key, block_type, text, attributes_json,
         source, locked, content_hash, revision
       ) VALUES(?, ?, ?, 1024, 'paragraph', '', '{}', 'manual', 0, NULL, 0)`,
    )
    .run(blockId, draftId, logicalBlockId);
  connection
    .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
    .run(draftId, chapterId);
  return draftId;
}

export class DraftService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: ((stage: 'after-block-delete') => void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  async open(requestId: string, input: DraftOpenInput): Promise<DraftDocument> {
    const valid = DraftOpenInputSchema.parse(input);
    const existing = this.#workspace.readProject(valid.projectId, (connection) =>
      readExistingDocument(connection, valid.projectId, valid.chapterId),
    );
    if (existing) return existing;
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const rechecked = readExistingDocument(connection, valid.projectId, valid.chapterId);
      if (rechecked) return rechecked;
      const timestamp = this.#clock.now().toISOString();
      initializeChapterDraft(connection, valid.chapterId, timestamp, this.#idFactory);
      const created = readExistingDocument(connection, valid.projectId, valid.chapterId);
      if (!created) {
        throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'The active Draft was not created.');
      }
      return created;
    });
  }

  saveSnapshot(requestId: string, input: DraftSaveSnapshotInput): Promise<DraftDocument> {
    const valid = DraftSaveSnapshotInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const chapter = activeChapter(connection, valid.projectId, valid.chapterId);
      const draft = activeDraft(connection, valid.chapterId);
      if (!draft || chapter.activeDraftId !== draft.id || draft.id !== valid.draftId) {
        throw new DraftServiceError('DRAFT_NOT_FOUND', 'The requested active Draft was not found.');
      }
      const existingRows = connection
        .prepare(
          `SELECT id, logical_block_id, source, locked, revision
             FROM draft_blocks
            WHERE draft_id = ?`,
        )
        .all(draft.id);
      const existing = new Map<string, StoredBlockRow>();
      for (const row of existingRows) {
        const source = text(row.source);
        if (!['manual', 'ai', 'mixed', 'imported'].includes(source)) {
          throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block source is invalid.');
        }
        const parsed: StoredBlockRow = {
          id: text(row.id),
          logicalBlockId: text(row.logical_block_id),
          source: source as StoredBlockRow['source'],
          locked: row.locked === 1n || row.locked === 1,
          revision: nonnegativeInteger(row.revision),
        };
        existing.set(parsed.logicalBlockId, parsed);
      }
      for (const block of valid.blocks) {
        if (block.logicalBlockId && !existing.has(block.logicalBlockId)) {
          throw new DraftServiceError(
            'DRAFT_BLOCK_NOT_FOUND',
            'A snapshot logicalBlockId does not belong to the active Draft.',
          );
        }
      }

      connection.prepare('DELETE FROM draft_blocks WHERE draft_id = ?').run(draft.id);
      this.#faultInjector?.('after-block-delete');
      const insert = connection.prepare(
        `INSERT INTO draft_blocks(
           id, draft_id, logical_block_id, order_key, block_type, text, attributes_json,
           source, locked, content_hash, revision
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      );
      for (const [index, block] of valid.blocks.entries()) {
        const previous = block.logicalBlockId ? existing.get(block.logicalBlockId) : undefined;
        insert.run(
          previous?.id ?? this.#idFactory(),
          draft.id,
          previous?.logicalBlockId ?? this.#idFactory(),
          BigInt(index + 1) * 1024n,
          block.blockType,
          block.text,
          JSON.stringify(block.attributes),
          previous?.source ?? 'manual',
          previous?.locked ? 1 : 0,
          previous?.revision ?? 0,
        );
      }
      connection
        .prepare('UPDATE drafts SET updated_at = ? WHERE id = ?')
        .run(this.#clock.now().toISOString(), draft.id);
      return readDocument(connection, valid.projectId, valid.chapterId, draft);
    });
  }
}
