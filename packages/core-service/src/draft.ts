import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  DraftApplyPatchInputSchema,
  DraftBlockAttributesSchema,
  DraftDocumentSchema,
  DraftOpenInputSchema,
  type DraftApplyPatchInput,
  type DraftBlock,
  type DraftDocument,
  type DraftOpenInput,
  type DraftPatchOperation,
} from '@worldforge/contracts';
import {
  normalizeDraftBlockSemantic,
  serializeDraftBlockSemantic,
  type DraftSemanticBlockType,
} from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type DraftServiceErrorCode =
  | 'DRAFT_NOT_FOUND'
  | 'DRAFT_BLOCK_NOT_FOUND'
  | 'DRAFT_INVARIANT_FAILED'
  | 'DRAFT_REVISION_CONFLICT'
  | 'DRAFT_BLOCK_HASH_CONFLICT'
  | 'DRAFT_PATCH_INVALID';

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
  readonly faultInjector?: (stage: 'after-patch-persist') => void;
}

interface DraftRow {
  readonly id: string;
  readonly chapterId: string;
  readonly status: 'active' | 'archived';
  readonly revision: number;
}

interface WorkingBlock {
  readonly recordId: string;
  readonly logicalBlockId: string;
  readonly blockType: DraftBlock['blockType'];
  readonly text: string;
  readonly attributes: DraftBlock['attributes'];
  readonly source: DraftBlock['source'];
  readonly locked: boolean;
  readonly contentHash: string;
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

function parseBlockType(value: unknown): DraftBlock['blockType'] {
  const parsed = text(value);
  if (!['paragraph', 'dialogue', 'heading', 'separator'].includes(parsed)) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block type is invalid.');
  }
  return parsed as DraftBlock['blockType'];
}

function parseSource(value: unknown): DraftBlock['source'] {
  const parsed = text(value);
  if (!['manual', 'ai', 'mixed', 'imported'].includes(parsed)) {
    throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'Draft block source is invalid.');
  }
  return parsed as DraftBlock['source'];
}

export function draftContentHash(input: {
  readonly blockType: DraftSemanticBlockType;
  readonly content: string;
  readonly attributes?: DraftBlock['attributes'];
}): string {
  return createHash('sha256').update(serializeDraftBlockSemantic(input), 'utf8').digest('hex');
}

function normalizeBlock(input: {
  readonly blockType: DraftBlock['blockType'];
  readonly content: string;
  readonly attributes?: DraftBlock['attributes'];
}): Pick<WorkingBlock, 'blockType' | 'text' | 'attributes' | 'contentHash'> {
  try {
    const normalized = normalizeDraftBlockSemantic(input);
    return {
      blockType: normalized.blockType,
      text: normalized.content,
      attributes: normalized.attributes,
      contentHash: draftContentHash(normalized),
    };
  } catch (error) {
    throw new DraftServiceError('DRAFT_PATCH_INVALID', 'Draft block semantics are invalid.', {
      cause: error,
    });
  }
}

function readWorkingBlocks(connection: DatabaseSync, draftId: string): WorkingBlock[] {
  return connection
    .prepare(
      `SELECT id, logical_block_id, order_key, block_type, text, attributes_json,
              source, locked, content_hash, revision
         FROM draft_blocks
        WHERE draft_id = ?
        ORDER BY order_key, id`,
    )
    .all(draftId)
    .map((row) => {
      orderKey(row.order_key);
      const blockType = parseBlockType(row.block_type);
      const storedText = text(row.text);
      const attributes = parseAttributes(row.attributes_json);
      const normalized = normalizeBlock({ blockType, content: storedText, attributes });
      const storedHash =
        row.content_hash === null || row.content_hash === undefined ? null : text(row.content_hash);
      if (storedHash !== null && storedHash !== normalized.contentHash) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'A stored DraftBlock content hash does not match its semantic content.',
        );
      }
      return {
        recordId: text(row.id),
        logicalBlockId: text(row.logical_block_id),
        blockType: normalized.blockType,
        text: normalized.text,
        attributes: normalized.attributes,
        source: parseSource(row.source),
        locked: row.locked === 1n || row.locked === 1,
        contentHash: storedHash ?? normalized.contentHash,
        revision: nonnegativeInteger(row.revision),
      };
    });
}

function ensureStoredHashes(connection: DatabaseSync, draftId: string): void {
  const blocks = readWorkingBlocks(connection, draftId);
  const update = connection.prepare(
    `UPDATE draft_blocks
        SET block_type = ?, text = ?, attributes_json = ?, content_hash = ?
      WHERE id = ? AND draft_id = ?`,
  );
  for (const block of blocks) {
    update.run(
      block.blockType,
      block.text,
      JSON.stringify(block.attributes),
      block.contentHash,
      block.recordId,
      draftId,
    );
  }
}

function readDocument(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  draft: DraftRow,
): DraftDocument {
  const blocks = readWorkingBlocks(connection, draft.id).map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),
    blockType: block.blockType,
    text: block.text,
    attributes: block.attributes,
    source: block.source,
    locked: block.locked,
    contentHash: block.contentHash,
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

function readExistingDraft(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
): DraftRow | null {
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
  return draft;
}

function hasMissingHashes(connection: DatabaseSync, draftId: string): boolean {
  return Boolean(
    connection
      .prepare('SELECT 1 FROM draft_blocks WHERE draft_id = ? AND content_hash IS NULL LIMIT 1')
      .get(draftId),
  );
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
  const initial = normalizeBlock({ blockType: 'paragraph', content: '', attributes: {} });
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
       ) VALUES(?, ?, ?, 1024, ?, ?, ?, 'manual', 0, ?, 0)`,
    )
    .run(
      blockId,
      draftId,
      logicalBlockId,
      initial.blockType,
      initial.text,
      JSON.stringify(initial.attributes),
      initial.contentHash,
    );
  connection.prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?').run(draftId, chapterId);
  return draftId;
}

function blockIndex(blocks: readonly WorkingBlock[], logicalBlockId: string): number {
  const index = blocks.findIndex((block) => block.logicalBlockId === logicalBlockId);
  if (index < 0) {
    throw new DraftServiceError(
      'DRAFT_BLOCK_NOT_FOUND',
      'A Patch logicalBlockId does not belong to the active Draft.',
    );
  }
  return index;
}

function assertExpectedHash(block: WorkingBlock, expectedHash: string): void {
  if (block.contentHash !== expectedHash) {
    throw new DraftServiceError(
      'DRAFT_BLOCK_HASH_CONFLICT',
      'The DraftBlock changed after the Patch was created.',
    );
  }
}

function insertionIndex(blocks: readonly WorkingBlock[], afterLogicalBlockId: string | null): number {
  return afterLogicalBlockId === null ? 0 : blockIndex(blocks, afterLogicalBlockId) + 1;
}

function auditBlocks(blocks: readonly WorkingBlock[]): readonly Record<string, unknown>[] {
  return blocks.map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    orderKey: String((index + 1) * 1024),
    blockType: block.blockType,
    text: block.text,
    attributes: block.attributes,
    source: block.source,
    locked: block.locked,
    contentHash: block.contentHash,
    revision: block.revision,
  }));
}

function applyOperation(
  blocks: WorkingBlock[],
  operation: DraftPatchOperation,
  committedRevision: number,
  idFactory: () => string,
): void {
  switch (operation.type) {
    case 'insert': {
      const normalized = normalizeBlock(operation.block);
      const index = insertionIndex(blocks, operation.afterLogicalBlockId);
      blocks.splice(index, 0, {
        recordId: idFactory(),
        logicalBlockId: idFactory(),
        ...normalized,
        source: 'manual',
        locked: false,
        revision: committedRevision,
      });
      return;
    }
    case 'update': {
      const index = blockIndex(blocks, operation.logicalBlockId);
      const current = blocks[index]!;
      assertExpectedHash(current, operation.expectedHash);
      const normalized = normalizeBlock({
        blockType: current.blockType,
        content: operation.content,
        attributes: operation.attributes ?? current.attributes,
      });
      blocks[index] = { ...current, ...normalized, revision: committedRevision };
      return;
    }
    case 'delete': {
      const index = blockIndex(blocks, operation.logicalBlockId);
      assertExpectedHash(blocks[index]!, operation.expectedHash);
      blocks.splice(index, 1);
      return;
    }
    case 'move': {
      if (operation.afterLogicalBlockId === operation.logicalBlockId) {
        throw new DraftServiceError(
          'DRAFT_PATCH_INVALID',
          'A DraftBlock cannot be moved after itself.',
        );
      }
      const sourceIndex = blockIndex(blocks, operation.logicalBlockId);
      const current = blocks[sourceIndex]!;
      assertExpectedHash(current, operation.expectedHash);
      blocks.splice(sourceIndex, 1);
      const targetIndex = insertionIndex(blocks, operation.afterLogicalBlockId);
      blocks.splice(targetIndex, 0, { ...current, revision: committedRevision });
    }
  }
}

function persistBlocks(
  connection: DatabaseSync,
  draftId: string,
  before: readonly WorkingBlock[],
  after: readonly WorkingBlock[],
): void {
  const retained = new Set(after.map((block) => block.logicalBlockId));
  const remove = connection.prepare(
    'DELETE FROM draft_blocks WHERE draft_id = ? AND logical_block_id = ?',
  );
  for (const block of before) {
    if (!retained.has(block.logicalBlockId)) remove.run(draftId, block.logicalBlockId);
  }

  const existing = new Set(before.map((block) => block.logicalBlockId));
  const insert = connection.prepare(
    `INSERT INTO draft_blocks(
       id, draft_id, logical_block_id, order_key, block_type, text, attributes_json,
       source, locked, content_hash, revision
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = connection.prepare(
    `UPDATE draft_blocks
        SET order_key = ?, block_type = ?, text = ?, attributes_json = ?,
            source = ?, locked = ?, content_hash = ?, revision = ?
      WHERE draft_id = ? AND logical_block_id = ?`,
  );
  for (const [index, block] of after.entries()) {
    const values = [
      BigInt(index + 1) * 1024n,
      block.blockType,
      block.text,
      JSON.stringify(block.attributes),
      block.source,
      block.locked ? 1 : 0,
      block.contentHash,
      block.revision,
    ] as const;
    if (existing.has(block.logicalBlockId)) {
      const result = update.run(...values, draftId, block.logicalBlockId);
      if (Number(result.changes) !== 1) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'A retained DraftBlock could not be updated.',
        );
      }
    } else {
      insert.run(block.recordId, draftId, block.logicalBlockId, ...values);
    }
  }
}

export class DraftService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: ((stage: 'after-patch-persist') => void) | undefined;

  constructor(workspace: ProjectWorkspaceService, options: DraftServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  async open(requestId: string, input: DraftOpenInput): Promise<DraftDocument> {
    const valid = DraftOpenInputSchema.parse(input);
    const existing = this.#workspace.readProject(valid.projectId, (connection) => {
      const draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      return draft
        ? {
            draft,
            document: readDocument(connection, valid.projectId, valid.chapterId, draft),
            missing: hasMissingHashes(connection, draft.id),
          }
        : null;
    });
    if (existing) {
      const project = this.#workspace.assertActiveProject(valid.projectId);
      if (!existing.missing || project.databaseMode === 'read-only') return existing.document;
    }
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      let draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      if (!draft) {
        const timestamp = this.#clock.now().toISOString();
        initializeChapterDraft(connection, valid.chapterId, timestamp, this.#idFactory);
        draft = readExistingDraft(connection, valid.projectId, valid.chapterId);
      }
      if (!draft) {
        throw new DraftServiceError('DRAFT_INVARIANT_FAILED', 'The active Draft was not created.');
      }
      ensureStoredHashes(connection, draft.id);
      return readDocument(connection, valid.projectId, valid.chapterId, draft);
    });
  }

  applyPatch(requestId: string, input: DraftApplyPatchInput): Promise<DraftDocument> {
    const valid = DraftApplyPatchInputSchema.parse(input);
    return this.#workspace.writeProject(requestId, valid.projectId, (connection) => {
      const chapter = activeChapter(connection, valid.projectId, valid.chapterId);
      const draft = activeDraft(connection, valid.chapterId);
      if (!draft || chapter.activeDraftId !== draft.id || draft.id !== valid.draftId) {
        throw new DraftServiceError('DRAFT_NOT_FOUND', 'The requested active Draft was not found.');
      }

      const replay = connection
        .prepare('SELECT draft_id FROM draft_patch_log WHERE request_id = ?')
        .get(requestId);
      if (replay) {
        if (text(replay.draft_id) !== draft.id) {
          throw new DraftServiceError(
            'DRAFT_PATCH_INVALID',
            'The requestId is already bound to a different Draft.',
          );
        }
        return readDocument(connection, valid.projectId, valid.chapterId, draft);
      }

      ensureStoredHashes(connection, draft.id);
      if (draft.revision !== valid.baseRevision) {
        throw new DraftServiceError(
          'DRAFT_REVISION_CONFLICT',
          'The Draft revision changed after the Patch was created.',
        );
      }
      if (draft.revision >= Number.MAX_SAFE_INTEGER) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'The Draft revision exceeded the supported safe integer range.',
        );
      }

      const before = readWorkingBlocks(connection, draft.id);
      const after = before.map((block) => ({ ...block }));
      const committedRevision = draft.revision + 1;
      for (const operation of valid.operations) {
        applyOperation(after, operation, committedRevision, this.#idFactory);
      }
      if (after.length === 0) {
        throw new DraftServiceError(
          'DRAFT_PATCH_INVALID',
          'An active Draft must retain at least one DraftBlock.',
        );
      }
      if (new Set(after.map((block) => block.logicalBlockId)).size !== after.length) {
        throw new DraftServiceError(
          'DRAFT_INVARIANT_FAILED',
          'The Patch produced duplicate logicalBlockId values.',
        );
      }

      persistBlocks(connection, draft.id, before, after);
      const timestamp = this.#clock.now().toISOString();
      connection
        .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ?')
        .run(committedRevision, timestamp, draft.id);
      connection
        .prepare(
          `INSERT INTO draft_patch_log(
             id, draft_id, request_id, base_revision, committed_revision,
             operations_json, before_blocks_json, after_blocks_json, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          draft.id,
          requestId,
          valid.baseRevision,
          committedRevision,
          JSON.stringify(valid.operations),
          JSON.stringify(auditBlocks(before)),
          JSON.stringify(auditBlocks(after)),
          timestamp,
        );
      this.#faultInjector?.('after-patch-persist');
      return readDocument(connection, valid.projectId, valid.chapterId, {
        ...draft,
        revision: committedRevision,
      });
    });
  }
}
