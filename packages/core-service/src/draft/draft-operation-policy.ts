import {
  type DraftLockConflict,
  type DraftPatchOperation,
  type DraftSnapshotBlockInput,
} from '@worldforge/contracts';

import { collectLockGuardViolations } from '../draft-lock-guard.js';
import {
  DraftServiceError,
  normalizeBlock,
  type WorkingBlock,
} from './draft-model.js';

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

function assertUnlocked(block: WorkingBlock): void {
  if (block.locked) {
    throw new DraftServiceError(
      'DRAFT_BLOCK_LOCKED',
      `DraftBlock ${block.logicalBlockId} is locked and must be explicitly unlocked first.`,
    );
  }
}

export function lockConflictError(
  conflicts: readonly DraftLockConflict[],
  skippedOperationCount: number,
  message: string,
): DraftServiceError {
  const unique = [
    ...new Map(
      conflicts.map((conflict) => [`${conflict.kind}:${conflict.logicalBlockId}`, conflict]),
    ).values(),
  ];
  return new DraftServiceError('DRAFT_BLOCK_LOCKED', message, {
    lockConflict: { conflicts: unique, skippedOperationCount },
  });
}

export function operationLockConflict(operation: DraftPatchOperation): DraftLockConflict | null {
  if (operation.type === 'update') {
    return { kind: 'modified', logicalBlockId: operation.logicalBlockId };
  }
  if (operation.type === 'delete') {
    return { kind: 'deleted', logicalBlockId: operation.logicalBlockId };
  }
  if (operation.type === 'move') {
    return { kind: 'moved', logicalBlockId: operation.logicalBlockId };
  }
  return null;
}

function insertionIndex(
  blocks: readonly WorkingBlock[],
  afterLogicalBlockId: string | null,
): number {
  return afterLogicalBlockId === null ? 0 : blockIndex(blocks, afterLogicalBlockId) + 1;
}

export function assertSnapshotPreservesLockedBlocks(
  existing: readonly WorkingBlock[],
  incoming: readonly DraftSnapshotBlockInput[],
): void {
  const existingById = new Map(existing.map((block) => [block.logicalBlockId, block]));
  const target = incoming.map((candidate, index) => {
    const normalized = normalizeBlock({
      blockType: candidate.blockType,
      content: candidate.text,
      attributes: candidate.attributes,
    });
    const previous = candidate.logicalBlockId
      ? existingById.get(candidate.logicalBlockId)
      : undefined;
    return {
      logicalBlockId: candidate.logicalBlockId ?? `new:${index}`,
      blockType: normalized.blockType,
      text: normalized.text,
      attributes: normalized.attributes,
      locked: previous?.locked ?? false,
    };
  });
  const violations = collectLockGuardViolations(existing, target);
  if (violations.length > 0) {
    const first = violations[0]!;
    throw lockConflictError(
      violations,
      1,
      `Locked DraftBlock ${first.logicalBlockId} cannot be ${first.kind} by snapshot replacement.`,
    );
  }
}

export function applyOperation(
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
        ...(operation.clientBlockId ? { clientBlockId: operation.clientBlockId } : {}),
        ...normalized,
        source: 'manual',
        locked: false,
        revision: committedRevision,
      });
      return;
    }
    case 'set-lock': {
      const index = blockIndex(blocks, operation.logicalBlockId);
      const current = blocks[index]!;
      const followsSamePatchUpdate = operation.locked && current.revision === committedRevision;
      if (!followsSamePatchUpdate) assertExpectedHash(current, operation.expectedHash);
      blocks[index] = { ...current, locked: operation.locked, revision: committedRevision };
      return;
    }
    case 'update': {
      const index = blockIndex(blocks, operation.logicalBlockId);
      const current = blocks[index]!;
      assertUnlocked(current);
      assertExpectedHash(current, operation.expectedHash);
      const normalized = normalizeBlock({
        blockType: operation.blockType ?? current.blockType,
        content: operation.content,
        attributes: operation.attributes ?? current.attributes,
      });
      blocks[index] = { ...current, ...normalized, revision: committedRevision };
      return;
    }
    case 'delete': {
      const index = blockIndex(blocks, operation.logicalBlockId);
      const current = blocks[index]!;
      assertUnlocked(current);
      assertExpectedHash(current, operation.expectedHash);
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
      assertUnlocked(current);
      assertExpectedHash(current, operation.expectedHash);
      blocks.splice(sourceIndex, 1);
      const targetIndex = insertionIndex(blocks, operation.afterLogicalBlockId);
      blocks.splice(targetIndex, 0, { ...current, revision: committedRevision });
    }
  }
}
