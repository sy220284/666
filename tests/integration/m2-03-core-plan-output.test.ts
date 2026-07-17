import { describe, expect, it } from 'vitest';

import { computeCandidateDiff } from '../../packages/core-service/src/candidate-apply-diff.js';

describe('M2-03 Core-local Candidate Diff', () => {
  it('computes modified blocks without importing the editor layer', () => {
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
