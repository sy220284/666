import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { DraftServiceError, normalizeBlock, type WorkingBlock } from './draft-model.js';
import { activeDraft } from './draft-record-reader.js';

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
  connection
    .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
    .run(draftId, chapterId);
  return draftId;
}

export function persistBlocks(
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
