import { describe, expect, it } from 'vitest';

import {
  CandidateDiffCancelledError,
  computeCandidateDiff,
  computeCandidateDiffProgressively,
} from '../../packages/core-service/src/candidate-apply-diff.js';

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

  it('cancels the cooperative 20000-character calculation at a slice boundary', async () => {
    const controller = new AbortController();
    let yields = 0;
    const result = computeCandidateDiffProgressively(
      [{ logicalBlockId: 'block-1', content: '甲'.repeat(20_000) }],
      [
        {
          temporaryId: 'candidate-block-1',
          logicalBlockId: 'block-1',
          sourceLogicalBlockIds: ['block-1'],
          content: `${'甲'.repeat(19_999)}乙`,
        },
      ],
      {
        signal: controller.signal,
        yieldControl: async () => {
          yields += 1;
          controller.abort();
        },
      },
    );

    await expect(result).rejects.toBeInstanceOf(CandidateDiffCancelledError);
    expect(yields).toBe(1);
  });

  it('executes an over-20000-character calculation in the Worker implementation', async () => {
    const result = await computeCandidateDiffProgressively(
      [{ logicalBlockId: 'block-1', content: '甲'.repeat(20_001) }],
      [
        {
          temporaryId: 'candidate-block-1',
          logicalBlockId: 'block-1',
          sourceLogicalBlockIds: ['block-1'],
          content: `${'甲'.repeat(20_000)}乙`,
        },
      ],
    );

    expect(result.execution.strategy).toBe('worker');
    expect(result.characterDiffs).toHaveLength(1);
    expect(result.characterDiffs[0]?.diff.segments.at(-1)).toEqual({
      type: 'insert',
      text: '乙',
    });
  });
});
