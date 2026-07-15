import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  DiffCancelledError,
  computeCandidateDiff,
  diffCandidateProgressively,
  diffChineseCharacters,
  planDiffExecution,
  type CandidateDiffBlock,
  type DraftDiffBlock,
} from '../../packages/editor-core/src/index.js';
import { createChineseLongParagraphFixture } from '../../packages/testkit/src/index.js';

const draft = (logicalBlockId: string, content: string): DraftDiffBlock => ({
  logicalBlockId,
  content,
});
const candidate = (
  temporaryId: string,
  content: string,
  options: Partial<CandidateDiffBlock> = {},
): CandidateDiffBlock => ({ temporaryId, content, ...options });

describe('M0-07 logicalBlockId structure diff', () => {
  it('classifies add, delete, move, split, merge, and content modification deterministically', () => {
    const result = computeCandidateDiff(
      [
        draft('b1', '甲乙'),
        draft('b2', '旧段'),
        draft('b3', '合并上'),
        draft('b4', '移动段'),
        draft('b5', '合并下'),
        draft('b6', '删除段'),
      ],
      [
        candidate('c4', '移动段', { logicalBlockId: 'b4' }),
        candidate('c1-left', '甲', {
          logicalBlockId: 'b1',
          sourceLogicalBlockIds: ['b1'],
        }),
        candidate('c1-right', '乙', { sourceLogicalBlockIds: ['b1'] }),
        candidate('c2', '新段', { sourceLogicalBlockIds: ['b2'] }),
        candidate('c-merge', '合并上合并下', { sourceLogicalBlockIds: ['b3', 'b5'] }),
        candidate('c-new', '新增段'),
      ],
    );

    expect(result.structure.map((entry) => entry.kind)).toEqual(
      expect.arrayContaining(['added', 'deleted', 'moved', 'split', 'merged', 'modified']),
    );
    expect(result.structure).toContainEqual(
      expect.objectContaining({ kind: 'moved', logicalBlockId: 'b4' }),
    );
    expect(result.structure).toContainEqual(
      expect.objectContaining({ kind: 'split', sourceLogicalBlockId: 'b1' }),
    );
    expect(result.structure).toContainEqual(
      expect.objectContaining({ kind: 'merged', sourceLogicalBlockIds: ['b3', 'b5'] }),
    );
    expect(result.characterDiffs).toHaveLength(3);
  });

  it('rejects ambiguous or unknown provenance instead of guessing a structure mapping', () => {
    expect(() =>
      computeCandidateDiff(
        [draft('b1', '当前段')],
        [
          candidate('c1', '候选一', { logicalBlockId: 'b1' }),
          candidate('c2', '候选二', { logicalBlockId: 'b1' }),
        ],
      ),
    ).toThrow(/Duplicate candidate logicalBlockId/);
    expect(() =>
      computeCandidateDiff(
        [draft('b1', '当前段')],
        [candidate('c1', '候选段', { sourceLogicalBlockIds: ['missing'] })],
      ),
    ).toThrow(/Unknown source logicalBlockId/);
  });

  it('produces Unicode-safe character segments that reconstruct both Chinese inputs', () => {
    const cases = [
      ['铜铃在雨里响了三声。🙂', '旧铜铃在骤雨里只响两声。🙂'],
      ['', '新增'],
      ['删除', ''],
      ['完全相同', '完全相同'],
      ['甲乙甲乙甲乙', '甲甲乙丙甲乙'],
      ['天地玄黄'.repeat(400), '风雨雷电'.repeat(400)],
    ] as const;
    for (const [before, after] of cases) {
      const result = diffChineseCharacters(before, after);
      expect(
        result.segments
          .filter((segment) => segment.type !== 'insert')
          .map((segment) => segment.text)
          .join(''),
      ).toBe(before);
      expect(
        result.segments
          .filter((segment) => segment.type !== 'delete')
          .map((segment) => segment.text)
          .join(''),
      ).toBe(after);
    }
  });

  it('reconstructs every short deterministic pair over repeated Chinese characters', () => {
    const values = [''];
    for (let length = 1; length <= 5; length += 1) {
      for (let mask = 0; mask < 2 ** length; mask += 1) {
        values.push(
          Array.from({ length }, (_value, index) => ((mask >> index) & 1 ? '甲' : '乙')).join(''),
        );
      }
    }
    for (const before of values) {
      for (const after of values) {
        const segments = diffChineseCharacters(before, after).segments;
        expect(
          segments
            .filter((segment) => segment.type !== 'insert')
            .map((segment) => segment.text)
            .join(''),
        ).toBe(before);
        expect(
          segments
            .filter((segment) => segment.type !== 'delete')
            .map((segment) => segment.text)
            .join(''),
        ).toBe(after);
      }
    }
  });
});

describe('M0-07 diff execution budget', () => {
  it('freezes main-thread, cooperative, and Worker thresholds by chapter size', () => {
    const blocks = (characters: number) => [draft('b1', '文'.repeat(characters))];
    const candidates = (characters: number) => [
      candidate('c1', '字'.repeat(characters), { logicalBlockId: 'b1' }),
    ];
    expect(planDiffExecution(blocks(5_000), candidates(5_000)).strategy).toBe('main-thread');
    expect(planDiffExecution(blocks(20_000), candidates(20_000)).strategy).toBe(
      'cooperative-slices',
    );
    expect(planDiffExecution(blocks(50_000), candidates(50_000)).strategy).toBe('worker');
  });

  it('keeps 5000-character first structure and complete diff P95 inside the frozen budgets', () => {
    const source = createChineseLongParagraphFixture().text;
    const changed = `${source.slice(0, 700)}潮汐${source.slice(702, 2_800)}铜铃${source.slice(2_802)}`;
    const structureSamples: number[] = [];
    const completeSamples: number[] = [];

    for (let sample = 0; sample < 20; sample += 1) {
      const startedAt = performance.now();
      const plan = planDiffExecution(
        [draft('b1', source)],
        [candidate('c1', changed, { logicalBlockId: 'b1' })],
      );
      structureSamples.push(performance.now() - startedAt);
      const completedAt = performance.now();
      const result = computeCandidateDiff(
        [draft('b1', source)],
        [candidate('c1', changed, { logicalBlockId: 'b1' })],
      );
      completeSamples.push(performance.now() - completedAt);
      expect(plan.strategy).toBe('main-thread');
      expect(result.characterDiffs).toHaveLength(1);
    }

    structureSamples.sort((left, right) => left - right);
    completeSamples.sort((left, right) => left - right);
    expect(structureSamples[Math.floor(structureSamples.length * 0.95)]).toBeLessThan(500);
    expect(completeSamples[Math.floor(completeSamples.length * 0.95)]).toBeLessThan(1_200);
  });

  it('returns structure first and cancels a progressive 20000-character diff within 500ms', async () => {
    const current = Array.from({ length: 20 }, (_value, index) =>
      draft(`b${index}`, `第${index}段` + '旧'.repeat(995)),
    );
    const proposed = Array.from({ length: 20 }, (_value, index) =>
      candidate(`c${index}`, `第${index}段` + '新'.repeat(995), { logicalBlockId: `b${index}` }),
    );
    const signal = { aborted: false };
    const progressive = diffCandidateProgressively(current, proposed, {
      signal,
      yieldControl: async () => Promise.resolve(),
    });
    const first = await progressive.next();
    expect(first.value).toMatchObject({ phase: 'structure' });

    const cancelledAt = performance.now();
    signal.aborted = true;
    await expect(progressive.next()).rejects.toBeInstanceOf(DiffCancelledError);
    expect(performance.now() - cancelledAt).toBeLessThan(500);
  });
});
