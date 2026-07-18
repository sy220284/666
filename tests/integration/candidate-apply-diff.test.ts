import { describe, expect, it } from 'vitest';

import { computeCandidateDiff } from '../../packages/core-service/src/candidate-apply-diff.js';

describe('M2-03 Core-local Candidate Diff', () => {
  it('classifies add, delete, move, split, merge and modification by logical identity', () => {
    const result = computeCandidateDiff(
      [
        { logicalBlockId: 'b1', content: '甲乙' },
        { logicalBlockId: 'b2', content: '旧段' },
        { logicalBlockId: 'b3', content: '合并上' },
        { logicalBlockId: 'b4', content: '移动段' },
        { logicalBlockId: 'b5', content: '合并下' },
        { logicalBlockId: 'b6', content: '删除段' },
      ],
      [
        { temporaryId: 'c4', logicalBlockId: 'b4', content: '移动段' },
        {
          temporaryId: 'c1-left',
          logicalBlockId: 'b1',
          sourceLogicalBlockIds: ['b1'],
          content: '甲',
        },
        { temporaryId: 'c1-right', sourceLogicalBlockIds: ['b1'], content: '乙' },
        {
          temporaryId: 'c2',
          logicalBlockId: 'b2-rewrite',
          sourceLogicalBlockIds: ['b2'],
          content: '新段',
        },
        {
          temporaryId: 'c-merge',
          sourceLogicalBlockIds: ['b3', 'b5'],
          content: '合并上合并下',
        },
        { temporaryId: 'c-new', content: '新增段' },
      ],
    );

    expect(result.structure.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['added', 'deleted', 'moved', 'split', 'merged', 'modified']),
    );
  });

  it('computes deterministic character segments for a modified block', () => {
    const result = computeCandidateDiff(
      [{ logicalBlockId: 'block-a', content: '旧文本' }],
      [
        {
          temporaryId: 'candidate-a',
          logicalBlockId: 'block-a',
          sourceLogicalBlockIds: ['block-a'],
          content: '新文本',
        },
      ],
    );

    expect(result.structure).toEqual([
      { kind: 'modified', logicalBlockId: 'block-a', currentIndex: 0, candidateIndex: 0 },
    ]);
    expect(result.characterDiffs[0]?.diff.segments).toEqual([
      { type: 'delete', text: '旧' },
      { type: 'insert', text: '新' },
      { type: 'equal', text: '文本' },
    ]);
  });
});
