import {
  CandidatePreviewSchema,
  type CandidateApplyInput,
  type CandidateBlock,
  type CandidateConflictItem,
  type CandidateDocument,
  type CandidatePreview,
  type CandidateSelection,
  type DraftDocument,
} from '@worldforge/contracts';
import {
  computeCandidateDiff,
  computeCandidateDiffProgressively,
  type CandidateDiffResult,
  type StructureDiffEntry,
} from './candidate-apply-diff.js';
import { collectLockGuardViolations } from './draft-lock-guard.js';

import type { MutableDraftBlock } from './candidate-state.js';

function normalizedStructure(
  entry: StructureDiffEntry,
  candidate: CandidateDocument,
  draft: DraftDocument,
) {
  const candidateBlockId = (index: number): string[] => {
    const block = candidate.blocks[index];
    return block ? [block.candidateBlockId] : [];
  };
  const currentIndex = (logicalBlockId: string): number[] => {
    const index = draft.blocks.findIndex((block) => block.logicalBlockId === logicalBlockId);
    return index < 0 ? [] : [index];
  };
  switch (entry.kind) {
    case 'unchanged':
    case 'modified':
      return {
        kind: entry.kind,
        logicalBlockId: entry.logicalBlockId,
        candidateBlockIds: candidateBlockId(entry.candidateIndex),
        sourceLogicalBlockIds: [entry.logicalBlockId],
        currentIndexes: [entry.currentIndex],
        candidateIndexes: [entry.candidateIndex],
        contentChanged: entry.kind === 'modified',
      };
    case 'moved':
      return {
        kind: entry.kind,
        logicalBlockId: entry.logicalBlockId,
        candidateBlockIds: candidateBlockId(entry.candidateIndex),
        sourceLogicalBlockIds: [entry.logicalBlockId],
        currentIndexes: [entry.currentIndex],
        candidateIndexes: [entry.candidateIndex],
        contentChanged: entry.contentChanged,
      };
    case 'added':
      return {
        kind: entry.kind,
        logicalBlockId: null,
        candidateBlockIds: [entry.temporaryId],
        sourceLogicalBlockIds: [],
        currentIndexes: [],
        candidateIndexes: [entry.candidateIndex],
        contentChanged: true,
      };
    case 'deleted':
      return {
        kind: entry.kind,
        logicalBlockId: entry.logicalBlockId,
        candidateBlockIds: [],
        sourceLogicalBlockIds: [entry.logicalBlockId],
        currentIndexes: [entry.currentIndex],
        candidateIndexes: [],
        contentChanged: true,
      };
    case 'split':
      return {
        kind: entry.kind,
        logicalBlockId: entry.sourceLogicalBlockId,
        candidateBlockIds: [...entry.candidateBlockIds],
        sourceLogicalBlockIds: [entry.sourceLogicalBlockId],
        currentIndexes: currentIndex(entry.sourceLogicalBlockId),
        candidateIndexes: [...entry.candidateIndexes],
        contentChanged: true,
      };
    case 'merged':
      return {
        kind: entry.kind,
        logicalBlockId: null,
        candidateBlockIds: [entry.candidateBlockId],
        sourceLogicalBlockIds: [...entry.sourceLogicalBlockIds],
        currentIndexes: entry.sourceLogicalBlockIds.flatMap(currentIndex),
        candidateIndexes: [entry.candidateIndex],
        contentChanged: true,
      };
  }
}

export function buildCandidatePreview(
  candidate: CandidateDocument,
  draft: DraftDocument,
): CandidatePreview {
  return candidatePreviewFromDiff(candidate, draft, computeCandidatePreviewDiff(candidate, draft));
}

function computeCandidatePreviewDiff(candidate: CandidateDocument, draft: DraftDocument) {
  return computeCandidateDiff(
    draft.blocks.map((block) => ({
      logicalBlockId: block.logicalBlockId,
      content: block.text,
    })),
    candidate.blocks.map((block) => ({
      temporaryId: block.candidateBlockId,
      logicalBlockId: block.logicalBlockId,
      sourceLogicalBlockIds: block.sourceLogicalBlockIds,
      content: block.text,
    })),
  );
}

function candidatePreviewFromDiff(
  candidate: CandidateDocument,
  draft: DraftDocument,
  diff: CandidateDiffResult,
): CandidatePreview {
  return CandidatePreviewSchema.parse({
    candidate,
    draft,
    structure: diff.structure.map((entry) => normalizedStructure(entry, candidate, draft)),
    characterDiffs: diff.characterDiffs.map((item) => ({
      key: item.key,
      before: item.before,
      after: item.after,
      segments: item.diff.segments,
      coarse: item.diff.coarse,
    })),
    execution: diff.execution,
  });
}

export async function buildCandidatePreviewProgressively(
  candidate: CandidateDocument,
  draft: DraftDocument,
  signal?: AbortSignal,
): Promise<CandidatePreview> {
  const diff = await computeCandidateDiffProgressively(
    draft.blocks.map((block) => ({
      logicalBlockId: block.logicalBlockId,
      content: block.text,
    })),
    candidate.blocks.map((block) => ({
      temporaryId: block.candidateBlockId,
      logicalBlockId: block.logicalBlockId,
      sourceLogicalBlockIds: block.sourceLogicalBlockIds,
      content: block.text,
    })),
    signal ? { signal } : {},
  );
  return candidatePreviewFromDiff(candidate, draft, diff);
}

function selectedBlocks(
  candidate: CandidateDocument,
  selection: CandidateSelection,
): CandidateBlock[] {
  if (selection.mode === 'all') return [...candidate.blocks];
  if (selection.mode === 'blocks') {
    const ids = new Set(selection.candidateBlockIds);
    return candidate.blocks.filter((block) => ids.has(block.candidateBlockId));
  }
  const beats = new Set(selection.beatIds);
  return candidate.blocks.filter((block) => block.beatId && beats.has(block.beatId));
}

function deleteIds(selection: CandidateSelection): readonly string[] {
  return selection.mode === 'all' ? [] : selection.deleteLogicalBlockIds;
}

function sourcesFor(
  block: CandidateBlock,
  existing: ReadonlyMap<string, MutableDraftBlock>,
): string[] {
  if (block.sourceLogicalBlockIds.length > 0) return [...block.sourceLogicalBlockIds];
  return existing.has(block.logicalBlockId) ? [block.logicalBlockId] : [];
}

export function buildCandidateTarget(
  current: readonly MutableDraftBlock[],
  candidate: CandidateDocument,
  selection: CandidateSelection,
  committedRevision: number,
  idFactory: () => string,
): MutableDraftBlock[] {
  if (selection.mode === 'all') {
    const existing = new Map(current.map((block) => [block.logicalBlockId, block]));
    return candidate.blocks.map((block, index) => {
      const previous = existing.get(block.logicalBlockId);
      return {
        recordId: previous?.recordId ?? idFactory(),
        logicalBlockId: block.logicalBlockId,
        orderKey: String((index + 1) * 1024),
        blockType: block.blockType,
        text: block.text,
        attributes: block.attributes,
        source: previous ? (previous.source === 'ai' ? 'ai' : 'mixed') : 'ai',
        locked: previous?.locked ?? false,
        contentHash: block.contentHash,
        revision: committedRevision,
      };
    });
  }

  const existing = new Map(current.map((block) => [block.logicalBlockId, block]));
  const chosen = selectedBlocks(candidate, selection);
  const removed = new Set(deleteIds(selection));
  for (const block of chosen) {
    for (const source of sourcesFor(block, existing)) removed.add(source);
  }
  const result = current
    .filter((block) => !removed.has(block.logicalBlockId))
    .map((block) => ({ ...block }));
  const resultIndex = () => new Map(result.map((block, index) => [block.logicalBlockId, index]));
  const candidateOrder = new Map(
    candidate.blocks.map((block, index) => [block.candidateBlockId, index]),
  );

  for (const block of chosen.sort(
    (left, right) =>
      (candidateOrder.get(left.candidateBlockId) ?? 0) -
      (candidateOrder.get(right.candidateBlockId) ?? 0),
  )) {
    const fullIndex = candidate.blocks.findIndex(
      (candidateBlock) => candidateBlock.candidateBlockId === block.candidateBlockId,
    );
    const indexes = resultIndex();
    let insertion = result.length;
    for (let index = fullIndex - 1; index >= 0; index -= 1) {
      const anchor = candidate.blocks[index];
      if (!anchor) continue;
      const found = indexes.get(anchor.logicalBlockId);
      if (found !== undefined) {
        insertion = found + 1;
        break;
      }
    }
    if (insertion === result.length) {
      for (let index = fullIndex + 1; index < candidate.blocks.length; index += 1) {
        const anchor = candidate.blocks[index];
        if (!anchor) continue;
        const found = indexes.get(anchor.logicalBlockId);
        if (found !== undefined) {
          insertion = found;
          break;
        }
      }
    }
    const previous = existing.get(block.logicalBlockId);
    result.splice(insertion, 0, {
      recordId: previous?.recordId ?? idFactory(),
      logicalBlockId: block.logicalBlockId,
      orderKey: '0',
      blockType: block.blockType,
      text: block.text,
      attributes: block.attributes,
      source: previous ? (previous.source === 'ai' ? 'ai' : 'mixed') : 'ai',
      locked: previous?.locked ?? false,
      contentHash: block.contentHash,
      revision: committedRevision,
    });
  }
  return result.map((block, index) => ({ ...block, orderKey: String((index + 1) * 1024) }));
}

export function candidateConflict(
  kind: CandidateConflictItem['kind'],
  message: string,
  options: Partial<Omit<CandidateConflictItem, 'kind' | 'message'>> = {},
): CandidateConflictItem {
  return {
    kind,
    logicalBlockId: options.logicalBlockId ?? null,
    candidateBlockId: options.candidateBlockId ?? null,
    expectedHash: options.expectedHash ?? null,
    actualHash: options.actualHash ?? null,
    message,
  };
}

export function collectApplyConflicts(
  candidate: CandidateDocument,
  current: readonly MutableDraftBlock[],
  target: readonly MutableDraftBlock[],
  input: CandidateApplyInput,
  currentRevision: number,
  duplicate: boolean,
): CandidateConflictItem[] {
  const conflicts: CandidateConflictItem[] = [];
  if (duplicate) {
    conflicts.push(
      candidateConflict('duplicate-apply', 'This Candidate already has an ApplyRecord.'),
    );
  }
  if (candidate.status !== 'pending') {
    conflicts.push(
      candidateConflict('candidate-status', `Candidate status is ${candidate.status}.`),
    );
  }
  if (candidate.completeness === 'partial' && input.selection.mode === 'all') {
    conflicts.push(
      candidateConflict(
        'partial-restricted',
        'An incomplete Candidate cannot replace the whole Draft.',
      ),
    );
  }
  if (input.selection.mode === 'blocks') {
    const candidateBlockIds = new Set(candidate.blocks.map((block) => block.candidateBlockId));
    const unknownCandidateBlockId = input.selection.candidateBlockIds.find(
      (candidateBlockId) => !candidateBlockIds.has(candidateBlockId),
    );
    if (
      unknownCandidateBlockId ||
      new Set(input.selection.candidateBlockIds).size !== input.selection.candidateBlockIds.length
    ) {
      conflicts.push(
        candidateConflict('structure', 'The block selection does not match this Candidate.', {
          candidateBlockId: unknownCandidateBlockId ?? input.selection.candidateBlockIds[0] ?? null,
        }),
      );
    }
  }
  if (input.selection.mode === 'scene-beats') {
    const candidateBeatIds = new Set(
      candidate.blocks.flatMap((block) => (block.beatId ? [block.beatId] : [])),
    );
    if (
      input.selection.beatIds.some((beatId) => !candidateBeatIds.has(beatId)) ||
      new Set(input.selection.beatIds).size !== input.selection.beatIds.length
    ) {
      conflicts.push(
        candidateConflict('structure', 'The SceneBeat selection does not match this Candidate.'),
      );
    }
  }
  if (
    input.selection.mode !== 'all' &&
    new Set(input.selection.deleteLogicalBlockIds).size !==
      input.selection.deleteLogicalBlockIds.length
  ) {
    conflicts.push(
      candidateConflict('structure', 'The deletion selection contains duplicate DraftBlocks.'),
    );
  }
  if (
    candidate.baseDraftId !== input.draftId ||
    candidate.baseDraftRevision !== input.baseRevision ||
    currentRevision !== input.baseRevision
  ) {
    conflicts.push(
      candidateConflict(
        'revision',
        `Candidate base ${candidate.baseDraftRevision}, request ${input.baseRevision}, current ${currentRevision}.`,
      ),
    );
  }
  const currentById = new Map(current.map((block) => [block.logicalBlockId, block]));
  for (const block of selectedBlocks(candidate, input.selection)) {
    for (const sourceId of sourcesFor(block, currentById)) {
      const source = currentById.get(sourceId);
      if (!source) {
        conflicts.push(
          candidateConflict('missing-block', 'A Candidate source block no longer exists.', {
            logicalBlockId: sourceId,
            candidateBlockId: block.candidateBlockId,
            expectedHash: block.sourceBlockHash,
          }),
        );
        continue;
      }
      if (block.sourceBlockHash && source.contentHash !== block.sourceBlockHash) {
        conflicts.push(
          candidateConflict('hash', 'A Candidate source block changed after generation.', {
            logicalBlockId: sourceId,
            candidateBlockId: block.candidateBlockId,
            expectedHash: block.sourceBlockHash,
            actualHash: source.contentHash,
          }),
        );
      }
    }
  }
  if (input.selection.mode !== 'all') {
    for (const logicalBlockId of input.selection.deleteLogicalBlockIds) {
      if (!currentById.has(logicalBlockId)) {
        conflicts.push(
          candidateConflict('missing-block', 'A selected deletion target no longer exists.', {
            logicalBlockId,
          }),
        );
      }
    }
  }
  const targetById = new Map(target.map((block) => [block.logicalBlockId, block]));
  for (const violation of collectLockGuardViolations(current, target)) {
    const before = currentById.get(violation.logicalBlockId);
    const after = targetById.get(violation.logicalBlockId);
    conflicts.push(
      candidateConflict(
        'locked',
        `A locked DraftBlock cannot be ${violation.kind} by Candidate apply.`,
        {
          logicalBlockId: violation.logicalBlockId,
          expectedHash: before?.contentHash ?? null,
          actualHash: after?.contentHash ?? before?.contentHash ?? null,
        },
      ),
    );
  }
  if (
    target.length === 0 ||
    new Set(target.map((block) => block.logicalBlockId)).size !== target.length
  ) {
    conflicts.push(
      candidateConflict('structure', 'Candidate selection produced an invalid Draft structure.'),
    );
  }
  return conflicts;
}
