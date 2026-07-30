import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { Editor, PersistedEditorBlock } from './draft-document.js';

const LOCK_COMMAND_META = 'worldforgeLockCommand';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function headingLevel(node: ProseMirrorNode): number {
  const value = Number(node.attrs.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function persistedHeadingLevel(block: PersistedEditorBlock): number {
  const value = Number(block.attributes.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function semanticMatch(node: ProseMirrorNode, block: PersistedEditorBlock): boolean {
  if (node.type.name !== block.blockType) return false;
  if (node.textContent !== block.text) return false;
  if (block.blockType === 'heading' && headingLevel(node) !== persistedHeadingLevel(block)) {
    return false;
  }
  return true;
}

function metadataForCurrentNode(
  node: ProseMirrorNode,
  block: PersistedEditorBlock,
  savedSnapshotStillCurrent: boolean,
): Record<string, unknown> {
  return {
    ...node.attrs,
    logicalBlockId: block.logicalBlockId,
    clientBlockId: optionalString(node.attrs.clientBlockId) ?? block.logicalBlockId,
    source: savedSnapshotStillCurrent ? block.source : node.attrs.source,
    locked: savedSnapshotStillCurrent ? block.locked : node.attrs.locked,
    contentHash: block.contentHash,
    ...(node.type.name === 'heading' ? { headingLevel: headingLevel(node) } : {}),
  };
}

/**
 * Synchronizes only metadata that can be associated with the current editor by a stable identity.
 *
 * Persisted logical IDs are preferred. A positional association is allowed only when the current
 * node is semantically identical to the persisted block, which means no later user edit can be
 * overwritten. Unmatched current nodes are intentionally left untouched and remain eligible for
 * the next autosave. The function never replaces editor content.
 */
export function synchronizePersistedBlockMetadata(
  editor: Editor,
  blocks: readonly PersistedEditorBlock[],
): boolean {
  const persistedById = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    if (persistedById.has(block.logicalBlockId)) return true;
    persistedById.set(block.logicalBlockId, block);
  }

  const transaction = editor.state.tr;
  let synchronized = 0;
  editor.state.doc.forEach((node, offset, index) => {
    const logicalBlockId = optionalString(node.attrs.logicalBlockId);
    const stableMatch = logicalBlockId ? persistedById.get(logicalBlockId) : undefined;
    const positionalMatch = blocks[index];
    const positionalSnapshotCurrent = Boolean(
      positionalMatch && semanticMatch(node, positionalMatch),
    );
    const block = stableMatch ?? (positionalSnapshotCurrent ? positionalMatch : undefined);
    if (!block) return;

    transaction.setNodeMarkup(
      offset,
      undefined,
      metadataForCurrentNode(node, block, semanticMatch(node, block)),
    );
    synchronized += 1;
  });

  if (synchronized === 0) return true;
  transaction.setMeta('addToHistory', false);
  transaction.setMeta(LOCK_COMMAND_META, true);
  editor.view.dispatch(transaction);
  return true;
}
