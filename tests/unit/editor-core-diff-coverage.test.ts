import { describe, expect, it, vi } from 'vitest';

import {
  DiffCancelledError,
  diffChineseCharacters,
} from '../../packages/editor-core/src/character-diff.js';
import {
  computeCandidateDiff,
  diffCandidateProgressively,
  planDiffExecution,
  type CandidateDiffBlock,
  type DraftDiffBlock,
} from '../../packages/editor-core/src/candidate-diff.js';

const draft = (logicalBlockId: string, content = logicalBlockId): DraftDiffBlock => ({
  logicalBlockId,
  content,
});
const candidate = (
  temporaryId: string,
  content = temporaryId,
  options: Pick<CandidateDiffBlock, 'logicalBlockId' | 'sourceLogicalBlockIds'> = {},
): CandidateDiffBlock => ({ temporaryId, content, ...options });

describe('Editor Core character diff regression coverage', () => {
  it('handles equality, insertion, deletion, replacement, emoji and shared prefix/suffix', () => {
    expect(diffChineseCharacters('甲乙', '甲乙')).toEqual({
      segments: [{ type: 'equal', text: '甲乙' }],
      coarse: false,
    });
    expect(diffChineseCharacters('天地', '天玄地')).toEqual({
      segments: [
        { type: 'equal', text: '天' },
        { type: 'insert', text: '玄' },
        { type: 'equal', text: '地' },
      ],
      coarse: false,
    });
    expect(diffChineseCharacters('天玄地', '天地').segments).toContainEqual({
      type: 'delete',
      text: '玄',
    });
    expect(diffChineseCharacters('甲😀乙', '甲🌙乙').segments).toEqual([
      { type: 'equal', text: '甲' },
      { type: 'delete', text: '😀' },
      { type: 'insert', text: '🌙' },
      { type: 'equal', text: '乙' },
    ]);
    expect(diffChineseCharacters('', '新章').segments).toEqual([{ type: 'insert', text: '新章' }]);
    expect(diffChineseCharacters('旧章', '').segments).toEqual([{ type: 'delete', text: '旧章' }]);
  });

  it('falls back to coarse replacement for bounded work and unrelated large text', () => {
    expect(
      diffChineseCharacters('甲', '乙', {
        maximumEditDistance: 0,
      }),
    ).toEqual({
      segments: [
        { type: 'delete', text: '甲' },
        { type: 'insert', text: '乙' },
      ],
      coarse: true,
    });
    expect(diffChineseCharacters('甲乙', '丙丁', { maximumWorkUnits: 0 }).coarse).toBe(true);
    const large = diffChineseCharacters('甲'.repeat(500), '乙'.repeat(500));
    expect(large.coarse).toBe(true);
    expect(large.segments).toHaveLength(2);
  });

  it('cancels before and during bounded diff work', () => {
    expect(() => diffChineseCharacters('甲', '乙', { signal: { aborted: true } })).toThrow(
      DiffCancelledError,
    );
    let probes = 0;
    const signal = {
      get aborted() {
        probes += 1;
        return probes >= 2;
      },
    };
    expect(() => diffChineseCharacters('甲乙丙', '甲丁丙', { signal })).toThrow(
      DiffCancelledError,
    );
  });
});

describe('Editor Core candidate diff regression coverage', () => {
  it('classifies moved, modified, unchanged, split, merged, added and deleted blocks', () => {
    const current = [
      draft('a', '甲'),
      draft('b', '乙'),
      draft('c', '丙'),
      draft('d', '丁戊'),
      draft('e', '己'),
      draft('f', '庚'),
      draft('gone', '辛'),
    ];
    const proposed = [
      candidate('tc', '丙', { logicalBlockId: 'c' }),
      candidate('ta', '甲改', { logicalBlockId: 'a' }),
      candidate('tb', '乙', { logicalBlockId: 'b' }),
      candidate('td1', '丁', { sourceLogicalBlockIds: ['d'] }),
      candidate('td2', '戊改', { sourceLogicalBlockIds: ['d'] }),
      candidate('tef', '己庚合', { sourceLogicalBlockIds: ['e', 'f'] }),
      candidate('new', '新增'),
    ];

    const result = computeCandidateDiff(current, proposed);
    expect(result.structure.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining([
        'moved',
        'modified',
        'unchanged',
        'split',
        'merged',
        'added',
        'deleted',
      ]),
    );
    expect(result.characterDiffs.map((entry) => entry.key)).toEqual(
      expect.arrayContaining(['block:a', 'split:d', 'merge:e+f']),
    );
    expect(result.execution.strategy).toBe('main-thread');
  });

  it('selects all three execution strategies at exact boundaries', () => {
    expect(planDiffExecution([draft('a', '甲'.repeat(5_000))], []).strategy).toBe('main-thread');
    expect(planDiffExecution([draft('a', '甲'.repeat(5_001))], []).strategy).toBe(
      'cooperative-slices',
    );
    expect(planDiffExecution([], [candidate('a', '甲'.repeat(20_001))]).strategy).toBe('worker');
  });

  it.each([
    {
      name: 'duplicate current id',
      current: [draft('a'), draft('a')],
      proposed: [],
      message: 'Duplicate current logicalBlockId',
    },
    {
      name: 'duplicate temporary id',
      current: [draft('a')],
      proposed: [candidate('x'), candidate('x')],
      message: 'Duplicate candidate temporaryId',
    },
    {
      name: 'duplicate candidate logical id',
      current: [draft('a')],
      proposed: [
        candidate('x', '一', { logicalBlockId: 'a' }),
        candidate('y', '二', { logicalBlockId: 'a' }),
      ],
      message: 'Duplicate candidate logicalBlockId',
    },
    {
      name: 'duplicate provenance',
      current: [draft('a')],
      proposed: [candidate('x', '一', { sourceLogicalBlockIds: ['a', 'a'] })],
      message: 'Duplicate source logicalBlockId',
    },
    {
      name: 'unknown provenance',
      current: [draft('a')],
      proposed: [candidate('x', '一', { sourceLogicalBlockIds: ['missing'] })],
      message: 'Unknown source logicalBlockId',
    },
    {
      name: 'conflicting provenance',
      current: [draft('a'), draft('b')],
      proposed: [candidate('x', '一', { logicalBlockId: 'a', sourceLogicalBlockIds: ['b'] })],
      message: 'Conflicting logicalBlockId provenance',
    },
  ])('rejects $name', ({ current, proposed, message }) => {
    expect(() => computeCandidateDiff(current, proposed)).toThrow(message);
  });

  it('rejects one source participating in multiple structural groups', () => {
    const current = [draft('a'), draft('b')];
    const proposed = [
      candidate('merge', '甲乙', { sourceLogicalBlockIds: ['a', 'b'] }),
      candidate('split-1', '甲', { sourceLogicalBlockIds: ['a'] }),
      candidate('split-2', '乙', { sourceLogicalBlockIds: ['a'] }),
    ];
    expect(() => computeCandidateDiff(current, proposed)).toThrow(
      'Source logicalBlockId participates in multiple structural groups',
    );
  });

  it('streams structure and character chunks, yielding between jobs', async () => {
    const yieldControl = vi.fn(async () => undefined);
    const generator = diffCandidateProgressively(
      [draft('a', '甲'), draft('b', '乙')],
      [
        candidate('a-next', '甲改', { logicalBlockId: 'a' }),
        candidate('b-next', '乙改', { logicalBlockId: 'b' }),
      ],
      { yieldControl },
    );
    const chunks = [];
    let completed;
    while (true) {
      const next = await generator.next();
      if (next.done) {
        completed = next.value;
        break;
      }
      chunks.push(next.value);
    }
    expect(chunks[0]).toMatchObject({ phase: 'structure' });
    expect(chunks.filter((chunk) => chunk.phase === 'characters')).toHaveLength(2);
    expect(completed.characterDiffs).toHaveLength(2);
    expect(yieldControl).toHaveBeenCalledTimes(2);
  });

  it('cancels progressive work after the structure phase', async () => {
    const signal = { aborted: false };
    const generator = diffCandidateProgressively(
      [draft('a', '甲')],
      [candidate('a-next', '乙', { logicalBlockId: 'a' })],
      { signal },
    );
    expect((await generator.next()).value).toMatchObject({ phase: 'structure' });
    signal.aborted = true;
    await expect(generator.next()).rejects.toBeInstanceOf(DiffCancelledError);
  });
});
