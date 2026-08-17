import { randomUUID } from 'node:crypto';

import {
  CandidateApplyInputSchema,
  DraftDocumentSchema,
  ProseCandidateDocumentSchema,
  type CandidateSelection,
  type DraftBlock,
  type ProseCandidateDocument,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  buildCandidatePreview,
  buildCandidatePreviewProgressively,
  buildCandidateTarget,
  candidateConflict,
  collectApplyConflicts,
} from '../../packages/core-service/src/candidate-apply-plan-core.js';
import type { MutableDraftBlock } from '../../packages/core-service/src/candidate-state.js';

const hash = (char: string) => char.repeat(64);
const projectId = randomUUID();
const chapterId = randomUUID();
const draftId = randomUUID();

function draftBlock(
  logicalBlockId: string,
  text: string,
  options: Partial<Pick<DraftBlock, 'source' | 'locked' | 'contentHash'>> = {},
): DraftBlock {
  return {
    logicalBlockId,
    orderKey: '1024',
    blockType: 'paragraph',
    text,
    attributes: {},
    source: options.source ?? 'manual',
    locked: options.locked ?? false,
    contentHash: options.contentHash ?? hash('a'),
  };
}

function draftDocument(blocks: readonly DraftBlock[]) {
  return DraftDocumentSchema.parse({
    projectId,
    chapterId,
    draftId,
    status: 'active',
    revision: 4,
    blocks,
  });
}

interface CandidateBlockSpec {
  readonly logicalBlockId: string;
  readonly text: string;
  readonly sourceLogicalBlockIds?: readonly string[];
  readonly beatId?: string | null;
  readonly sourceBlockHash?: string | null;
  readonly contentHash?: string;
}

function candidateDocument(
  specs: readonly CandidateBlockSpec[],
  overrides: Partial<ProseCandidateDocument> = {},
): ProseCandidateDocument {
  return ProseCandidateDocumentSchema.parse({
    candidateId: randomUUID(),
    projectId,
    chapterId,
    generationRunId: null,
    candidateType: 'rewrite',
    baseDraftId: draftId,
    baseDraftRevision: 4,
    completeness: 'complete',
    status: 'pending',
    title: '候选',
    sourceVersionId: null,
    contentHash: hash('f'),
    createdAt: '2026-08-17T00:00:00.000Z',
    resolvedAt: null,
    blockCount: specs.length,
    blocks: specs.map((spec, index) => ({
      candidateBlockId: randomUUID(),
      logicalBlockId: spec.logicalBlockId,
      sourceLogicalBlockIds: [...(spec.sourceLogicalBlockIds ?? [])],
      orderKey: String((index + 1) * 1024),
      blockType: 'paragraph',
      text: spec.text,
      attributes: {},
      beatId: spec.beatId ?? null,
      sourceBlockHash: spec.sourceBlockHash ?? null,
      contentHash: spec.contentHash ?? hash(String((index % 6) + 1)),
    })),
    ...overrides,
  });
}

function mutable(block: DraftBlock, index: number, revision = 4): MutableDraftBlock {
  return {
    ...block,
    recordId: randomUUID(),
    contentHash: block.contentHash ?? hash('a'),
    orderKey: String((index + 1) * 1024),
    revision,
  };
}

function applyInput(
  candidate: ProseCandidateDocument,
  selection: CandidateSelection,
  baseRevision = 4,
) {
  return CandidateApplyInputSchema.parse({
    projectId,
    chapterId,
    candidateId: candidate.candidateId,
    draftId,
    baseRevision,
    selection,
  });
}

describe('candidate apply plan core edge coverage', () => {
  it('normalizes an unchanged block and preserves a manual partial replacement as mixed', () => {
    const logicalId = randomUUID();
    const draft = draftDocument([draftBlock(logicalId, '原文')]);
    const unchanged = candidateDocument([{ logicalBlockId: logicalId, text: '原文' }]);
    expect(buildCandidatePreview(unchanged, draft).structure).toContainEqual(
      expect.objectContaining({ kind: 'unchanged', contentChanged: false }),
    );

    const current = [mutable(draftBlock(logicalId, '原文', { source: 'manual' }), 0)];
    const replacement = candidateDocument([
      { logicalBlockId: logicalId, sourceLogicalBlockIds: [logicalId], text: '改文' },
    ]);
    const target = buildCandidateTarget(
      current,
      replacement,
      {
        mode: 'blocks',
        candidateBlockIds: [replacement.blocks[0]!.candidateBlockId],
        deleteLogicalBlockIds: [],
      },
      5,
      randomUUID,
    );
    expect(target[0]).toMatchObject({ source: 'mixed', recordId: current[0]!.recordId });
  });

  it('normalizes every structural diff kind and progressive preview route', async () => {
    const ids = Array.from({ length: 6 }, () => randomUUID());
    const draft = draftDocument([
      draftBlock(ids[0]!, '甲乙'),
      draftBlock(ids[1]!, '旧段'),
      draftBlock(ids[2]!, '合并上'),
      draftBlock(ids[3]!, '移动段'),
      draftBlock(ids[4]!, '合并下'),
      draftBlock(ids[5]!, '删除段'),
    ]);
    const candidate = candidateDocument([
      { logicalBlockId: ids[3]!, text: '移动段' },
      { logicalBlockId: ids[0]!, sourceLogicalBlockIds: [ids[0]!], text: '甲' },
      { logicalBlockId: randomUUID(), sourceLogicalBlockIds: [ids[0]!], text: '乙' },
      { logicalBlockId: randomUUID(), sourceLogicalBlockIds: [ids[1]!], text: '新段' },
      {
        logicalBlockId: randomUUID(),
        sourceLogicalBlockIds: [ids[2]!, ids[4]!],
        text: '合并上合并下',
      },
      { logicalBlockId: randomUUID(), text: '新增段' },
    ]);

    const preview = buildCandidatePreview(candidate, draft);
    expect(preview.structure.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['added', 'deleted', 'moved', 'split', 'merged', 'modified']),
    );
    expect(preview.structure.find((entry) => entry.kind === 'merged')?.currentIndexes.length).toBe(
      2,
    );
    expect(preview.structure.find((entry) => entry.kind === 'split')?.currentIndexes).toEqual([0]);

    const progressiveWithoutSignal = await buildCandidatePreviewProgressively(candidate, draft);
    expect(progressiveWithoutSignal.structure.map((item) => item.kind)).toEqual(
      preview.structure.map((item) => item.kind),
    );
    const controller = new AbortController();
    const progressiveWithSignal = await buildCandidatePreviewProgressively(
      candidate,
      draft,
      controller.signal,
    );
    expect(progressiveWithSignal.execution.strategy).toBeTruthy();
  });

  it('builds whole-draft targets for existing manual/ai blocks and new blocks', () => {
    const existingManualId = randomUUID();
    const existingAiId = randomUUID();
    const addedId = randomUUID();
    const current = [
      mutable(draftBlock(existingManualId, '人工', { source: 'manual', locked: true }), 0),
      mutable(draftBlock(existingAiId, 'AI', { source: 'ai' }), 1),
    ];
    const candidate = candidateDocument([
      { logicalBlockId: existingManualId, text: '人工改写' },
      { logicalBlockId: existingAiId, text: 'AI改写' },
      { logicalBlockId: addedId, text: '新增' },
    ]);
    let ids = 0;
    const target = buildCandidateTarget(current, candidate, { mode: 'all' }, 5, () => {
      ids += 1;
      return randomUUID();
    });

    expect(target.map((block) => block.source)).toEqual(['mixed', 'ai', 'ai']);
    expect(target[0]).toMatchObject({ recordId: current[0]!.recordId, locked: true, revision: 5 });
    expect(target[1]!.recordId).toBe(current[1]!.recordId);
    expect(ids).toBe(1);
  });

  it('builds partial block and scene-beat targets using both forward/backward anchors and source fallback', () => {
    const left = randomUUID();
    const middle = randomUUID();
    const right = randomUUID();
    const before = randomUUID();
    const after = randomUUID();
    const beatId = randomUUID();
    const current = [
      mutable(draftBlock(left, '左'), 0),
      mutable(draftBlock(middle, '中', { source: 'ai' }), 1),
      mutable(draftBlock(right, '右'), 2),
    ];
    const candidate = candidateDocument([
      { logicalBlockId: before, text: '前插' },
      { logicalBlockId: left, text: '左' },
      { logicalBlockId: middle, text: '中改', beatId },
      { logicalBlockId: right, text: '右' },
      { logicalBlockId: after, text: '后插' },
    ]);
    const selected = buildCandidateTarget(
      current,
      candidate,
      {
        mode: 'blocks',
        candidateBlockIds: [
          candidate.blocks[4]!.candidateBlockId,
          candidate.blocks[0]!.candidateBlockId,
        ],
        deleteLogicalBlockIds: [],
      },
      5,
      randomUUID,
    );
    expect(selected.map((block) => block.logicalBlockId)).toEqual([
      before,
      left,
      middle,
      right,
      after,
    ]);

    const byBeat = buildCandidateTarget(
      current,
      candidate,
      { mode: 'scene-beats', beatIds: [beatId], deleteLogicalBlockIds: [right] },
      6,
      randomUUID,
    );
    expect(byBeat.map((block) => block.logicalBlockId)).toEqual([left, middle]);
    expect(byBeat[1]).toMatchObject({ recordId: current[1]!.recordId, source: 'ai' });
  });

  it('creates conflict values with defaults and explicit metadata', () => {
    expect(candidateConflict('structure', '默认')).toEqual({
      kind: 'structure',
      logicalBlockId: null,
      candidateBlockId: null,
      expectedHash: null,
      actualHash: null,
      message: '默认',
    });
    const logicalBlockId = randomUUID();
    const candidateBlockId = randomUUID();
    expect(
      candidateConflict('hash', '显式', {
        logicalBlockId,
        candidateBlockId,
        expectedHash: hash('a'),
        actualHash: hash('b'),
      }),
    ).toMatchObject({
      logicalBlockId,
      candidateBlockId,
      expectedHash: hash('a'),
      actualHash: hash('b'),
    });
  });

  it('collects duplicate/status/partial/revision/hash/missing/locked/empty structure conflicts', () => {
    const existingId = randomUUID();
    const missingId = randomUUID();
    const current = [
      mutable(draftBlock(existingId, '锁定原文', { locked: true, contentHash: hash('a') }), 0),
    ];
    const candidate = candidateDocument(
      [
        {
          logicalBlockId: existingId,
          sourceLogicalBlockIds: [existingId],
          sourceBlockHash: hash('b'),
          text: '锁定改文',
        },
        {
          logicalBlockId: randomUUID(),
          sourceLogicalBlockIds: [missingId],
          sourceBlockHash: hash('c'),
          text: '来源消失',
        },
      ],
      { status: 'accepted', completeness: 'partial', baseDraftRevision: 3 },
    );
    const input = applyInput(candidate, { mode: 'all' }, 2);
    const conflicts = collectApplyConflicts(candidate, current, [], input, 1, true);
    const kinds = conflicts.map((item) => item.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'duplicate-apply',
        'candidate-status',
        'partial-restricted',
        'revision',
        'hash',
        'missing-block',
        'locked',
        'structure',
      ]),
    );
  });

  it('collects malformed block/deletion selections including unknown and duplicate ids', () => {
    const logicalId = randomUUID();
    const current = [mutable(draftBlock(logicalId, '正文'), 0)];
    const candidate = candidateDocument([
      { logicalBlockId: logicalId, sourceLogicalBlockIds: [logicalId], text: '正文' },
    ]);
    const unknownCandidateId = randomUUID();
    const missingDelete = randomUUID();
    const blockConflicts = collectApplyConflicts(
      candidate,
      current,
      current,
      applyInput(candidate, {
        mode: 'blocks',
        candidateBlockIds: [unknownCandidateId, unknownCandidateId],
        deleteLogicalBlockIds: [missingDelete, missingDelete],
      }),
      4,
      false,
    );
    expect(blockConflicts.filter((item) => item.kind === 'structure')).toHaveLength(2);
    expect(blockConflicts).toContainEqual(
      expect.objectContaining({ kind: 'missing-block', logicalBlockId: missingDelete }),
    );

    const duplicateKnown = collectApplyConflicts(
      candidate,
      current,
      current,
      applyInput(candidate, {
        mode: 'blocks',
        candidateBlockIds: [
          candidate.blocks[0]!.candidateBlockId,
          candidate.blocks[0]!.candidateBlockId,
        ],
        deleteLogicalBlockIds: [],
      }),
      4,
      false,
    );
    expect(duplicateKnown).toContainEqual(expect.objectContaining({ kind: 'structure' }));
  });

  it('collects unknown and duplicate scene-beat selections while accepting a valid beat', () => {
    const logicalId = randomUUID();
    const beatId = randomUUID();
    const current = [mutable(draftBlock(logicalId, '正文'), 0)];
    const candidate = candidateDocument([
      { logicalBlockId: logicalId, text: '正文', beatId },
      { logicalBlockId: randomUUID(), text: '无节拍', beatId: null },
    ]);

    const unknown = randomUUID();
    const invalid = collectApplyConflicts(
      candidate,
      current,
      current,
      applyInput(candidate, {
        mode: 'scene-beats',
        beatIds: [unknown, unknown],
        deleteLogicalBlockIds: [],
      }),
      4,
      false,
    );
    expect(invalid).toContainEqual(expect.objectContaining({ kind: 'structure' }));

    const duplicateValid = collectApplyConflicts(
      candidate,
      current,
      current,
      applyInput(candidate, {
        mode: 'scene-beats',
        beatIds: [beatId, beatId],
        deleteLogicalBlockIds: [],
      }),
      4,
      false,
    );
    expect(duplicateValid).toContainEqual(expect.objectContaining({ kind: 'structure' }));

    const valid = collectApplyConflicts(
      candidate,
      current,
      current,
      applyInput(candidate, { mode: 'scene-beats', beatIds: [beatId], deleteLogicalBlockIds: [] }),
      4,
      false,
    );
    expect(valid.filter((item) => item.kind === 'structure')).toHaveLength(0);
  });

  it('detects duplicate logical ids in a non-empty target and locked deletion metadata fallback', () => {
    const logicalId = randomUUID();
    const current = [
      mutable(draftBlock(logicalId, '锁定', { locked: true, contentHash: hash('d') }), 0),
    ];
    const modifyingCandidate = candidateDocument([
      { logicalBlockId: logicalId, sourceLogicalBlockIds: [logicalId], text: '锁定改写' },
    ]);
    const modifiedTarget = [{ ...current[0]!, text: '锁定改写', contentHash: hash('e') }];
    const modifiedConflicts = collectApplyConflicts(
      modifyingCandidate,
      current,
      modifiedTarget,
      applyInput(modifyingCandidate, {
        mode: 'blocks',
        candidateBlockIds: [modifyingCandidate.blocks[0]!.candidateBlockId],
        deleteLogicalBlockIds: [],
      }),
      4,
      false,
    );
    expect(modifiedConflicts).toContainEqual(
      expect.objectContaining({ kind: 'locked', expectedHash: hash('d'), actualHash: hash('e') }),
    );

    const candidate = candidateDocument([{ logicalBlockId: randomUUID(), text: '候选' }]);
    const target = [
      mutable(draftBlock(randomUUID(), '甲'), 0),
      mutable(draftBlock(randomUUID(), '乙'), 1),
    ];
    target[1] = { ...target[1]!, logicalBlockId: target[0]!.logicalBlockId };
    const conflicts = collectApplyConflicts(
      candidate,
      current,
      target,
      applyInput(candidate, {
        mode: 'blocks',
        candidateBlockIds: [candidate.blocks[0]!.candidateBlockId],
        deleteLogicalBlockIds: [logicalId],
      }),
      4,
      false,
    );
    expect(conflicts).toContainEqual(expect.objectContaining({ kind: 'structure' }));
    expect(conflicts).toContainEqual(
      expect.objectContaining({ kind: 'locked', expectedHash: hash('d'), actualHash: hash('d') }),
    );
  });
});
