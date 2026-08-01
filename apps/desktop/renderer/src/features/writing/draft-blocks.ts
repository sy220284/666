import type { DraftDocument } from '@worldforge/contracts';
import type { PersistedEditorBlock } from '@worldforge/editor-core';

export function persistedEditorBlocks(document: DraftDocument): readonly PersistedEditorBlock[] {
  return document.blocks.map((block) => ({
    logicalBlockId: block.logicalBlockId,
    clientBlockId: block.clientBlockId ?? null,
    blockType: block.blockType,
    text: block.text,
    attributes: block.attributes,
    source: block.source,
    locked: block.locked,
    contentHash: block.contentHash,
  }));
}
