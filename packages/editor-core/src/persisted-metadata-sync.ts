import type { Node as ProseMirrorNode } from '@tiptap/pm/model';

import type { DraftSnapshotEditorBlock, Editor, PersistedEditorBlock } from './draft-document.js';

const LOCK_COMMAND_META = 'worldforgeLockCommand';

let pendingSnapshot: DraftSnapshotEditorBlock[] | null = null;

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

function snapshotSemanticKey(block: DraftSnapshotEditorBlock): string {
  return JSON.stringify([
    block.blockType,
    block.text,
    block.blockType === 'heading' ? snapshotHeadingLevel(block) : null,
  ]);
}

function cloneSnapshot(blocks: readonly DraftSnapshotEditorBlock[]): DraftSnapshotEditorBlock[] {
  return blocks.map((block) => ({
    ...block,
    attributes: { ...block.attributes },
  }));
}

/**
 * Registers the immutable snapshot used by the one in-flight autosave request.
 * DraftAutosaveCoordinator serializes saves, so a new request always replaces a failed or
 * abandoned request snapshot before another successful response can be synchronized.
 */
export function rememberPendingDraftSnapshot(blocks: readonly DraftSnapshotEditorBlock[]): void {
  pendingSnapshot = cloneSnapshot(blocks);
}

export function resetPendingDraftSnapshotsForTests(): void {
  pendingSnapshot = null;
}

function currentClientBlockIds(editor: Editor): ReadonlySet<string> {
  const clientBlockIds = new Set<string>();
  editor.state.doc.forEach((node) => {
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    if (clientBlockId) clientBlockIds.add(clientBlockId);
  });
  return clientBlockIds;
}

function consumeRequestSnapshot(
  blocks: readonly PersistedEditorBlock[],
  currentClientIds: ReadonlySet<string>,
): readonly DraftSnapshotEditorBlock[] | null {
  const snapshot = pendingSnapshot;
  if (!snapshot || snapshot.length !== blocks.length) return null;

  const clientBlockIds = new Set<string>();
  let currentIdentityMatches = 0;
  for (const [index, savedBlock] of snapshot.entries()) {
    const persisted = blocks[index];
    if (
      !persisted ||
      clientBlockIds.has(savedBlock.clientBlockId) ||
      !snapshotMatchesPersisted(savedBlock, persisted)
    ) {
      return null;
    }
    clientBlockIds.add(savedBlock.clientBlockId);
    if (currentClientIds.has(savedBlock.clientBlockId)) currentIdentityMatches += 1;
  }
  if (currentIdentityMatches === 0) return null;
  pendingSnapshot = null;
  return snapshot;
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
 * The exact snapshot registered by the serialized save request is consumed once and mapped back
 * through its clientBlockIds. Paste-created nodes can temporarily lack a clientBlockId; those are
 * associated only when the request snapshot entry is semantically unique and the current node at
 * that request position is still identical. Ambiguous duplicate content remains untouched for a
 * later save instead of accepting a positional identity guess.
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

  const snapshot = consumeRequestSnapshot(blocks, currentClientBlockIds(editor));
  const savedByClientId = new Map<string, DraftSnapshotEditorBlock>();
  const persistedByClientId = new Map<string, PersistedEditorBlock>();
  const unsavedSemanticCounts = new Map<string, number>();
  if (snapshot) {
    for (const [index, savedBlock] of snapshot.entries()) {
      const persisted = blocks[index];
      if (!persisted) continue;
      savedByClientId.set(savedBlock.clientBlockId, savedBlock);
      persistedByClientId.set(savedBlock.clientBlockId, persisted);
      if (!savedBlock.logicalBlockId) {
        const key = snapshotSemanticKey(savedBlock);
        unsavedSemanticCounts.set(key, (unsavedSemanticCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const transaction = editor.state.tr;
  const usedPersistedIds = new Set<string>();
  let synchronized = 0;
  editor.state.doc.forEach((node, offset, index) => {
    const logicalBlockId = optionalString(node.attrs.logicalBlockId);
    const clientBlockId = optionalString(node.attrs.clientBlockId);
    const stableMatch = logicalBlockId ? persistedById.get(logicalBlockId) : undefined;
    const clientMatch = clientBlockId ? persistedByClientId.get(clientBlockId) : undefined;
    const positionalSaved = !logicalBlockId && !clientBlockId ? snapshot?.[index] : undefined;
    const positionalPersisted = positionalSaved ? blocks[index] : undefined;
    const uniqueSemanticPositionMatch = Boolean(
      positionalSaved &&
      positionalPersisted &&
      !positionalSaved.logicalBlockId &&
      unsavedSemanticCounts.get(snapshotSemanticKey(positionalSaved)) === 1 &&
      nodeMatchesSnapshot(node, positionalSaved),
    );
    const block =
      stableMatch ?? clientMatch ?? (uniqueSemanticPositionMatch ? positionalPersisted : undefined);
    if (!block || usedPersistedIds.has(block.logicalBlockId)) return;

    const savedBlock =
      (clientBlockId ? savedByClientId.get(clientBlockId) : undefined) ??
      (uniqueSemanticPositionMatch ? positionalSaved : undefined);
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
