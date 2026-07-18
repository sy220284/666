import { describe, expect, it } from 'vitest';

import { computeCandidateDiff } from '../../packages/core-service/src/candidate-apply-diff.js';

function previewFor(characters: number) {
  const current = [{ logicalBlockId: 'block-1', content: '甲'.repeat(characters) }];
  const candidate = [
    {
      temporaryId: 'candidate-block-1',
      logicalBlockId: 'block-1',
      sourceLogicalBlockIds: ['block-1'],
      content: `${'甲'.repeat(Math.max(0, characters - 1))}乙`,
    },
  ];
  return computeCandidateDiff(current, candidate);
}

describe('M2-03 Candidate Preview execution strategy', () => {
  it.each([
    [5_000, 'main-thread'],
    [5_001, 'cooperative-slices'],
    [20_000, 'cooperative-slices'],
    [20_001, 'worker'],
  ] as const)('selects %s characters as %s', (characters, strategy) => {
    const result = previewFor(characters);
    expect(result.execution).toMatchObject({
      strategy,
      chapterCharacters: characters,
      continuousBlockingBudgetMilliseconds: 100,
    });
    expect(result.characterDiffs).toHaveLength(1);
  });
});
