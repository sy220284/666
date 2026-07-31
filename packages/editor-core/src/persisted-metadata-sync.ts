import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { DraftSnapshotEditorBlock, Editor, PersistedEditorBlock } from './draft-document.js';

const LOCK_COMMAND_META = 'worldforgeLockCommand';

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function headingLevel(node: ProseMirrorNode): number {
  const value = Number(node.attrs.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function snapshotHeadingLevel(block: DraftSnapshotEditorBlock): number {
  const value = Number(block.attributes.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function persistedHeadingLevel(block: PersistedEditorBlock): number {
  const value = Number(block.attributes.headingLevel);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : 2;
}

function snapshotMatchesPersisted(
  snapshot: DraftSnapshotEditorBlock,
  block: PersistedEditorBlock,
): boolean {
  if (snapshot.blockType !== block.blockType || snapshot.text !== block.text) return false;
  if (snapshot.logicalBlockId && snapshot.logicalBlockId !== block.logicalBlockId) return false;
  return (
    snapshot.blockType !== 'heading' ||
    snapshotHeadingLevel(snapshot) === persistedHeadingLevel(block)
  );
}

function nodeMatchesSnapshot(node: ProseMirrorNode, snapshot: DraftSnapshotEditorBlock): boolean {
  if (node.type.name !== snapshot.blockType || node.textContent !== snapshot.text) return false;
  return snapshot.blockType !== 'heading' || headingLevel(node) === snapshotHeadingLevel(snapshot);
}

function nodeMatchesPersisted(node: ProseMirrorNode, block: PersistedEditorBlock): boolean {
  if (node.type.name !== block.blockType || node.textContent !== block.text) return false;
  return block.blockType !== 'heading' || headingLevel(node) === persistedHeadingLevel(block);
}

function requestSnapshotMatchesResponse(
  snapshot: readonly DraftSnapshotEditorBlock[],
  blocks: readonly PersistedEditorBlock[],
): boolean {
  if (snapshot.length !== blocks.length) return false;
  const clientBlockIds = new Set<string>();
  return snapshot.every((savedBlock, index) => {
    const persisted = blocks[index];
    if (
      !persisted ||
      clientBlockIds.has(savedBlock.clientBlockId) ||
      !snapshotMatchesPersisted(savedBlock, persisted)
    ) {
      return false;
    }
    clientBlockIds.add(savedBlock.clientBlockId);
    return true;
  });
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
 * Synchronizes persisted metadata without replacing current editor content.
 *
 * The save caller passes the exact immutable snapshot used to build this request. The persisted
 * response is mapped back through that snapshot's clientBlockIds, so same-content requests,
 * chapter switches and delayed responses cannot borrow identity from another save. Current nodes
 * are matched by logicalBlockId or by the request's clientBlockId. Later user content, type, source
 * and lock changes remain untouched and will be persisted by the next autosave.
 */
export function synchronizePersistedBlockMetadata(
  editor: Editor,
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): boolean {
  const persistedById = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    if (persistedById.has(block.logicalBlockId)) return true;
    persistedById.set(block.logicalBlockId, block);
  }

  const savedByClientId = new Map<string, DraftSnapshotEditorBlock>();
  const persistedByClientId = new Map<string, PersistedEditorBlock>();
  if (requestSnapshotMatchesResponse(requestSnapshot, blocks)) {
    for (const [index, savedBlock] of requestSnapshot.entries()) {
      const persisted = blocks[index];
      if (!persisted) continue;
      savedByClientId.set(savedBlock.clientBlockId, savedBlock);
      persistedByClientId.set(savedBlock.clientBlockId, persisted);
    }
  }

  const transaction = editor.state.tr;
  const usedPersistedIds = new Set<string>();
  let synchronized = 0;
  editor.state.doc.forEach((node, offset) => {
    const logicalBlockId = optionalString(node.attrs.logicalBlockId);
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    const stableMatch = logicalBlockId ? persistedById.get(logicalBlockId) : undefined;
    const clientMatch = clientBlockId ? persistedByClientId.get(clientBlockId) : undefined;
    const block = stableMatch ?? clientMatch;
    if (!block || usedPersistedIds.has(block.logicalBlockId)) return;

    const savedBlock = clientBlockId ? savedByClientId.get(clientBlockId) : undefined;
    const savedSnapshotStillCurrent = savedBlock
      ? nodeMatchesSnapshot(node, savedBlock)
      : nodeMatchesPersisted(node, block);
    transaction.setNodeMarkup(
      offset,
      undefined,
      metadataForCurrentNode(node, block, savedSnapshotStillCurrent),
    );
    usedPersistedIds.add(block.logicalBlockId);
    synchronized += 1;
  });

  if (synchronized === 0) return true;
  transaction.setMeta('addToHistory', false);
  transaction.setMeta(LOCK_COMMAND_META, true);
  editor.view.dispatch(transaction);
  return true;
}
