import type {
  DraftSnapshotEditorBlock,
  PersistedEditorBlock,
  WorldforgeBlockAttributes,
  WorldforgeBlockType,
} from './draft-document.js';

export interface DraftPatchNewBlock {
  readonly blockType: WorldforgeBlockType;
  readonly content: string;
  readonly attributes: WorldforgeBlockAttributes;
}

export type DraftEditorPatchOperation =
  | {
      readonly type: 'insert';
      readonly afterLogicalBlockId: string | null;
      readonly block: DraftPatchNewBlock;
    }
  | {
      readonly type: 'update';
      readonly logicalBlockId: string;
      readonly expectedHash: string;
      readonly blockType?: WorldforgeBlockType | undefined;
      readonly content: string;
      readonly attributes?: WorldforgeBlockAttributes | undefined;
    }
  | {
      readonly type: 'delete';
      readonly logicalBlockId: string;
      readonly expectedHash: string;
    }
  | {
      readonly type: 'move';
      readonly logicalBlockId: string;
      readonly expectedHash: string;
      readonly afterLogicalBlockId: string | null;
    }
  | {
      readonly type: 'set-lock';
      readonly logicalBlockId: string;
      readonly expectedHash: string;
      readonly locked: boolean;
    };

function normalizedAttributes(
  blockType: WorldforgeBlockType,
  attributes: WorldforgeBlockAttributes,
): WorldforgeBlockAttributes {
  return blockType === 'heading' ? { headingLevel: attributes.headingLevel ?? 2 } : {};
}

function attributesEqual(
  blockType: WorldforgeBlockType,
  left: WorldforgeBlockAttributes,
  right: WorldforgeBlockAttributes,
): boolean {
  if (blockType !== 'heading') return true;
  return (left.headingLevel ?? 2) === (right.headingLevel ?? 2);
}

function requiredHash(block: PersistedEditorBlock): string {
  if (!block.contentHash) {
    throw new RangeError(`DraftBlock ${block.logicalBlockId} is missing its content hash.`);
  }
  return block.contentHash;
}

function assertUniquePersistedIds(blocks: readonly PersistedEditorBlock[]): void {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (ids.has(block.logicalBlockId)) {
      throw new RangeError(`Duplicate persisted logicalBlockId: ${block.logicalBlockId}`);
    }
    ids.add(block.logicalBlockId);
  }
}

function assertUniqueCurrentIds(blocks: readonly DraftSnapshotEditorBlock[]): void {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (!block.logicalBlockId) continue;
    if (ids.has(block.logicalBlockId)) {
      throw new RangeError(`Duplicate current logicalBlockId: ${block.logicalBlockId}`);
    }
    ids.add(block.logicalBlockId);
  }
}

/**
 * Builds a DEC-004 compatible Patch from the last persisted Draft and current editor state.
 * Unlocks must run before destructive operations; new locks run after content and structure
 * changes so one autosave can safely persist an unlock-edit or edit-lock sequence.
 */
export function buildDraftPatchOperations(
  persisted: readonly PersistedEditorBlock[],
  current: readonly DraftSnapshotEditorBlock[],
): DraftEditorPatchOperation[] {
  if (persisted.length === 0 || current.length === 0) {
    throw new RangeError('A Draft must contain at least one block before and after editing.');
  }
  assertUniquePersistedIds(persisted);
  assertUniqueCurrentIds(current);

  const persistedById = new Map(persisted.map((block) => [block.logicalBlockId, block]));
  const currentById = new Map(
    current
      .filter((block): block is DraftSnapshotEditorBlock & { logicalBlockId: string } =>
        Boolean(block.logicalBlockId),
      )
      .map((block) => [block.logicalBlockId, block]),
  );
  const retainedIds = new Set(
    current
      .filter((block) => {
        const previous = block.logicalBlockId ? persistedById.get(block.logicalBlockId) : undefined;
        return previous !== undefined;
      })
      .map((block) => block.logicalBlockId as string),
  );

  const unlocks: DraftEditorPatchOperation[] = persisted
    .filter((block) => block.locked && currentById.get(block.logicalBlockId)?.locked === false)
    .map((block) => ({
      type: 'set-lock' as const,
      logicalBlockId: block.logicalBlockId,
      expectedHash: requiredHash(block),
      locked: false,
    }));

  const deletions: DraftEditorPatchOperation[] = persisted
    .filter((block) => !retainedIds.has(block.logicalBlockId))
    .map((block) => ({
      type: 'delete' as const,
      logicalBlockId: block.logicalBlockId,
      expectedHash: requiredHash(block),
    }));

  const retainedOrder = persisted
    .filter((block) => retainedIds.has(block.logicalBlockId))
    .map((block) => block.logicalBlockId);
  const desiredRetainedOrder = current
    .map((block) => block.logicalBlockId)
    .filter(
      (logicalBlockId): logicalBlockId is string =>
        logicalBlockId !== null && retainedIds.has(logicalBlockId),
    );
  const moves: DraftEditorPatchOperation[] = [];
  for (const [targetIndex, logicalBlockId] of desiredRetainedOrder.entries()) {
    const sourceIndex = retainedOrder.indexOf(logicalBlockId);
    if (sourceIndex < 0) {
      throw new RangeError(`Retained DraftBlock disappeared: ${logicalBlockId}`);
    }
    if (sourceIndex === targetIndex) continue;
    retainedOrder.splice(sourceIndex, 1);
    retainedOrder.splice(targetIndex, 0, logicalBlockId);
    const previous = persistedById.get(logicalBlockId);
    if (!previous) throw new RangeError(`Unknown persisted DraftBlock: ${logicalBlockId}`);
    moves.push({
      type: 'move',
      logicalBlockId,
      expectedHash: requiredHash(previous),
      afterLogicalBlockId: targetIndex === 0 ? null : desiredRetainedOrder[targetIndex - 1]!,
    });
  }

  const inserts: DraftEditorPatchOperation[] = [];
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const block = current[index]!;
    if (block.logicalBlockId && retainedIds.has(block.logicalBlockId)) continue;
    let afterLogicalBlockId: string | null = null;
    for (let anchorIndex = index - 1; anchorIndex >= 0; anchorIndex -= 1) {
      const candidate = current[anchorIndex]?.logicalBlockId;
      if (candidate && retainedIds.has(candidate)) {
        afterLogicalBlockId = candidate;
        break;
      }
    }
    inserts.push({
      type: 'insert',
      afterLogicalBlockId,
      block: {
        blockType: block.blockType,
        content: block.text,
        attributes: normalizedAttributes(block.blockType, block.attributes),
      },
    });
  }

  const updates: DraftEditorPatchOperation[] = [];
  for (const block of current) {
    if (!block.logicalBlockId || !retainedIds.has(block.logicalBlockId)) continue;
    const previous = persistedById.get(block.logicalBlockId);
    if (!previous) throw new RangeError(`Unknown persisted DraftBlock: ${block.logicalBlockId}`);
    const blockTypeChanged = previous.blockType !== block.blockType;
    const attributesChanged =
      blockTypeChanged || !attributesEqual(block.blockType, previous.attributes, block.attributes);
    if (previous.text === block.text && !attributesChanged && !blockTypeChanged) continue;
    updates.push({
      type: 'update',
      logicalBlockId: block.logicalBlockId,
      expectedHash: requiredHash(previous),
      ...(blockTypeChanged ? { blockType: block.blockType } : {}),
      content: block.text,
      ...(attributesChanged
        ? { attributes: normalizedAttributes(block.blockType, block.attributes) }
        : {}),
    });
  }

  const locks: DraftEditorPatchOperation[] = persisted
    .filter((block) => !block.locked && currentById.get(block.logicalBlockId)?.locked === true)
    .map((block) => ({
      type: 'set-lock' as const,
      logicalBlockId: block.logicalBlockId,
      expectedHash: requiredHash(block),
      locked: true,
    }));

  return [...unlocks, ...deletions, ...moves, ...inserts, ...updates, ...locks];
}
