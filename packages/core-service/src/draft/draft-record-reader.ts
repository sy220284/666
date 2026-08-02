import type { DatabaseSync } from 'node:sqlite';

import { DraftDocumentSchema, type DraftDocument } from '@worldforge/contracts';

import {
  DraftServiceError,
  draftRow,
  nonnegativeInteger,
  normalizeBlock,
  orderKey,
  parseAttributes,
  parseBlockType,
  parseSource,
  text,
  type DraftRow,
  type WorkingBlock,
} from './draft-model.js';

export function activeChapter(
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

export function activeDraft(connection: DatabaseSync, chapterId: string): DraftRow | null {
  const row = connection
    .prepare(
      `SELECT id, chapter_id, status, revision
         FROM drafts
        WHERE chapter_id = ? AND status = 'active'`,
    )
    .get(chapterId);
  return row ? draftRow(row) : null;
}

export function readWorkingBlocks(connection: DatabaseSync, draftId: string): WorkingBlock[] {
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

export function ensureStoredHashes(connection: DatabaseSync, draftId: string): void {
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

export function readDocument(
  connection: DatabaseSync,
  projectId: string,
  chapterId: string,
  draft: DraftRow,
): DraftDocument {
  const blocks = readWorkingBlocks(connection, draft.id).map((block, index) => ({
    logicalBlockId: block.logicalBlockId,
    ...(block.clientBlockId ? { clientBlockId: block.clientBlockId } : {}),
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

export function readExistingDraft(
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

export function hasMissingHashes(connection: DatabaseSync, draftId: string): boolean {
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
