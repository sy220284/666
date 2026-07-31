import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { DraftSnapshotEditorBlock, Editor, PersistedEditorBlock } from './draft-document.js';

const LOCK_COMMAND_META = 'worldforgeLockCommand';
const MAX_PENDING_SNAPSHOTS = 8;

let pendingSnapshots: DraftSnapshotEditorBlock[][] = [];

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

function cloneSnapshot(blocks: readonly DraftSnapshotEditorBlock[]): DraftSnapshotEditorBlock[] {
  return blocks.map((block) => ({
    ...block,
    attributes: { ...block.attributes },
  }));
}

export function rememberPendingDraftSnapshot(blocks: readonly DraftSnapshotEditorBlock[]): void {
  pendingSnapshots.push(cloneSnapshot(blocks));
  if (pendingSnapshots.length > MAX_PENDING_SNAPSHOTS) pendingSnapshots.shift();
}

export function resetPendingDraftSnapshotsForTests(): void {
  pendingSnapshots = [];
}

function currentClientBlockIds(editor: Editor): ReadonlySet<string> {
  const clientBlockIds = new Set<string>();
  editor.state.doc.forEach((node) => {
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    if (clientBlockId) clientBlockIds.add(clientBlockId);
  });
  return clientBlockIds;
}

function takeMatchingSnapshot(
  blocks: readonly PersistedEditorBlock[],
  currentClientIds: ReadonlySet<string>,
): readonly DraftSnapshotEditorBlock[] | null {
  let selectedIndex = -1;
  let selectedScore = 0;
  for (let index = pendingSnapshots.length - 1; index >= 0; index -= 1) {
    const snapshot = pendingSnapshots[index];
    if (
      !snapshot ||
      snapshot.length !== blocks.length ||
      !snapshot.every((savedBlock, blockIndex) => {
        const persisted = blocks[blockIndex];
        return Boolean(persisted && snapshotMatchesPersisted(savedBlock, persisted));
      })
    ) {
      continue;
    }
    const score = snapshot.reduce(
      (total, savedBlock) => total + Number(currentClientIds.has(savedBlock.clientBlockId)),
      0,
    );
    if (score <= selectedScore) continue;
    selectedIndex = index;
    selectedScore = score;
  }
  if (selectedIndex < 0) return null;
  return pendingSnapshots.splice(selectedIndex, 1)[0] ?? null;
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
 * A candidate save snapshot must match the persisted response and overlap the current editor's
 * stable clientBlockIds. Newer snapshots win ties, so a delayed response from another chapter or
 * an older same-content request cannot bind metadata into the active editor. Current nodes are
 * then matched by logicalBlockId or clientBlockId. Without a safe snapshot, only already-persisted
 * logical identities are synchronized.
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

  const snapshot = takeMatchingSnapshot(blocks, currentClientBlockIds(editor));
  const savedByClientId = new Map<string, DraftSnapshotEditorBlock>();
  const persistedByClientId = new Map<string, PersistedEditorBlock>();
  if (snapshot) {
    for (const [index, savedBlock] of snapshot.entries()) {
      const persisted = blocks[index];
      if (!persisted || savedByClientId.has(savedBlock.clientBlockId)) continue;
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
