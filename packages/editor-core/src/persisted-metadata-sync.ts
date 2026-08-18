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

function requestMapping(
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): ReadonlyMap<string, PersistedEditorBlock> | null {
  const responseByClientId = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    const clientBlockId = optionalString(block.clientBlockId);
    if (!clientBlockId) continue;
    if (responseByClientId.has(clientBlockId)) return null;
    responseByClientId.set(clientBlockId, block);
  }

  const mapped = new Map<string, PersistedEditorBlock>();
  for (const savedBlock of requestSnapshot) {
    if (savedBlock.logicalBlockId) continue;
    const persisted = responseByClientId.get(savedBlock.clientBlockId);
    if (!persisted || !snapshotMatchesPersisted(savedBlock, persisted)) return null;
    mapped.set(savedBlock.clientBlockId, persisted);
  }
  return mapped;
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
 * Synchronizes persisted metadata through the immutable snapshot owned by the exact save request.
 * Current text, structure, selection and history are never replaced by an asynchronous response.
 */
export function synchronizePersistedBlockMetadata(
  editor: Editor,
  blocks: readonly PersistedEditorBlock[],
  requestSnapshot: readonly DraftSnapshotEditorBlock[],
): boolean {
  const persistedById = new Map<string, PersistedEditorBlock>();
  for (const block of blocks) {
    if (persistedById.has(block.logicalBlockId)) return false;
    persistedById.set(block.logicalBlockId, block);
  }

  const persistedByClientId = requestMapping(blocks, requestSnapshot);
  const savedByClientId = new Map(requestSnapshot.map((block) => [block.clientBlockId, block]));
  const transaction = editor.state.tr;
  const usedPersistedIds = new Set<string>();
  let synchronized = 0;

  editor.state.doc.forEach((node, offset) => {
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    const logicalBlockId = optionalString(node.attrs.logicalBlockId);
    const clientMatch = clientBlockId ? persistedByClientId?.get(clientBlockId) : undefined;
    const stableMatch = logicalBlockId ? persistedById.get(logicalBlockId) : undefined;
    if (clientMatch && stableMatch && clientMatch.logicalBlockId !== stableMatch.logicalBlockId)
      return;
    const block = clientMatch ?? stableMatch;
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

  if (synchronized === 0) return false;
  transaction.setMeta('addToHistory', false);
  transaction.setMeta(LOCK_COMMAND_META, true);
  editor.view.dispatch(transaction);
  return true;
}
