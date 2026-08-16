import { describe, expect, it } from 'vitest';
import type { CandidateSummary, SceneBeat } from '@worldforge/contracts';

import {
  candidateCompletenessLabel,
  candidateStatusLabel,
  candidateTypeLabel,
  changedReviewLineIndexes,
  createReviewDiff,
  groupCandidatesForReview,
  sceneBeatReviewLabel,
} from '../../apps/desktop/renderer/src/features/writing/review-diff.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function summary(overrides: Partial<CandidateSummary>): CandidateSummary {
  return contractInput<CandidateSummary>({
    candidateId: 'candidate-1',
    candidateType: 'full',
    completeness: 'complete',
    status: 'pending',
    title: '建议稿',
    ...overrides,
  });
}

describe('review diff edge coverage', () => {
  it('normalizes line endings and covers empty, add-only and remove-only documents', () => {
    expect(createReviewDiff('', '')).toEqual([]);
    expect(createReviewDiff('第一行\r\n第二行\r第三行', '第一行\n第二行\n第三行')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unchanged', currentText: '第一行' }),
        expect.objectContaining({ kind: 'unchanged', currentText: '第三行' }),
      ]),
    );

    expect(createReviewDiff('', '新增一\n新增二').map((line) => line.kind)).toEqual([
      'added',
      'added',
    ]);
    expect(createReviewDiff('删除一\n删除二', '').map((line) => line.kind)).toEqual([
      'removed',
      'removed',
    ]);
    expect(createReviewDiff('保留', '保留\n').at(-1)).toMatchObject({
      kind: 'added',
      comparisonText: '',
      comparisonSegments: [],
    });
    expect(createReviewDiff('保留\n', '保留').at(-1)).toMatchObject({
      kind: 'removed',
      currentText: '',
      currentSegments: [],
    });
  });

  it('builds inline segments for prefix, suffix and one-sided middle changes', () => {
    const changed = createReviewDiff('abc旧内容xyz', 'abc新内容xyz')[0]!;
    expect(changed).toMatchObject({ kind: 'changed' });
    expect(changed.currentSegments).toEqual([
      { kind: 'unchanged', text: 'abc' },
      { kind: 'removed', text: '旧' },
      { kind: 'unchanged', text: '内容xyz' },
    ]);
    expect(changed.comparisonSegments).toEqual([
      { kind: 'unchanged', text: 'abc' },
      { kind: 'added', text: '新' },
      { kind: 'unchanged', text: '内容xyz' },
    ]);

    const noShared = createReviewDiff('旧', '新')[0]!;
    expect(noShared.currentSegments).toEqual([{ kind: 'removed', text: '旧' }]);
    expect(noShared.comparisonSegments).toEqual([{ kind: 'added', text: '新' }]);

    const addMiddle = createReviewDiff('首行\n\n尾行', '首行\n插入\n尾行')[1]!;
    expect(addMiddle.currentSegments).toEqual([]);
    expect(addMiddle.comparisonSegments).toEqual([{ kind: 'added', text: '插入' }]);

    const removeMiddle = createReviewDiff('首行\n删除\n尾行', '首行\n\n尾行')[1]!;
    expect(removeMiddle.currentSegments).toEqual([{ kind: 'removed', text: '删除' }]);
    expect(removeMiddle.comparisonSegments).toEqual([]);
  });

  it('covers LCS tie-breaking, residual removals/additions and changed-index extraction', () => {
    const diff = createReviewDiff('A\nB\nC\nD', 'B\nX\nC\nE\nF');
    expect(diff.some((line) => line.kind === 'removed')).toBe(true);
    expect(diff.some((line) => line.kind === 'added')).toBe(true);
    expect(diff.some((line) => line.kind === 'changed')).toBe(true);
    expect(changedReviewLineIndexes(diff)).toEqual(
      diff.flatMap((line, index) => (line.kind === 'unchanged' ? [] : [index])),
    );
  });

  it('uses a unique middle anchor when a large diff exceeds the LCS cell budget', () => {
    const current = Array.from({ length: 650 }, (_, index) => `当前-${index}`);
    const comparison = Array.from({ length: 650 }, (_, index) => `候选-${index}`);
    current[290] = '唯一锚点';
    comparison[360] = '唯一锚点';

    const diff = createReviewDiff(current.join('\n'), comparison.join('\n'));
    const anchor = diff.find((line) => line.currentText === '唯一锚点');
    expect(anchor).toMatchObject({
      kind: 'unchanged',
      currentLineNumber: 291,
      comparisonLineNumber: 361,
    });
    expect(diff.some((line) => line.kind === 'changed')).toBe(true);
  });

  it('falls back to aligned large-line comparison when there is no unique anchor', () => {
    const current = Array.from({ length: 601 }, (_, index) => `旧-${index % 2}`);
    const comparison = Array.from({ length: 602 }, (_, index) => `新-${index % 2}`);
    const diff = createReviewDiff(current.join('\n'), comparison.join('\n'));

    expect(diff[0]).toMatchObject({
      kind: 'changed',
      currentLineNumber: 1,
      comparisonLineNumber: 1,
    });
    expect(diff.at(-1)).toMatchObject({ kind: 'added', comparisonLineNumber: 602 });
  });

  it('chooses the closest unique anchor and preserves repeated aligned lines in large fallback diffs', () => {
    const current = Array.from({ length: 620 }, (_, index) =>
      index % 2 === 0 ? `旧-${index}` : '重复公共行',
    );
    const comparison = Array.from({ length: 619 }, (_, index) =>
      index % 2 === 0 ? `新-${index}` : '重复公共行',
    );
    current[80] = '远端锚点';
    comparison[100] = '远端锚点';
    current[300] = '中心锚点';
    comparison[310] = '中心锚点';
    current[520] = '远端锚点二';
    comparison[500] = '远端锚点二';

    const diff = createReviewDiff(current.join('\n'), comparison.join('\n'));
    expect(diff.some((line) => line.kind === 'unchanged' && line.currentText === '中心锚点')).toBe(
      true,
    );
    expect(
      diff.some((line) => line.kind === 'unchanged' && line.currentText === '重复公共行'),
    ).toBe(true);
  });

  it('keeps repeated aligned lines and handles a current-only tail in large no-anchor fallback', () => {
    const current = Array.from({ length: 602 }, (_, index) =>
      index % 2 === 0 ? `旧-${index}` : '重复行',
    );
    const comparison = Array.from({ length: 601 }, (_, index) =>
      index % 2 === 0 ? `新-${index}` : '重复行',
    );
    const diff = createReviewDiff(current.join('\n'), comparison.join('\n'));

    expect(diff.some((line) => line.kind === 'unchanged' && line.currentText === '重复行')).toBe(
      true,
    );
    expect(diff.at(-1)).toMatchObject({
      kind: 'removed',
      currentLineNumber: 602,
      comparisonLineNumber: null,
    });
  });

  it('covers large fallback deletion and empty unchanged-line rendering', () => {
    const shared = Array.from({ length: 600 }, (_, index) => `共享-${index}`);
    const removal = createReviewDiff(['额外旧行', ...shared].join('\n'), shared.join('\n'));
    expect(removal[0]).toMatchObject({ kind: 'removed', currentText: '额外旧行' });

    const unchangedEmpty = createReviewDiff('首行\n\n尾行', '首行\n\n尾行');
    expect(unchangedEmpty[1]).toMatchObject({
      kind: 'unchanged',
      currentText: '',
      currentSegments: [],
      comparisonSegments: [],
    });
  });

  it('covers candidate labels, empty grouping and scene-beat fallback labels', () => {
    expect(groupCandidatesForReview([])).toEqual([]);
    expect(candidateTypeLabel('skeleton')).toBe('情节骨架');
    expect(candidateTypeLabel('full')).toBe('完整正文');
    expect(candidateTypeLabel('rewrite')).toBe('改写内容');
    expect(candidateTypeLabel('merge')).toBe('融合内容');
    expect(candidateStatusLabel('pending')).toBe('待审阅');
    expect(candidateStatusLabel('accepted')).toBe('已采用');
    expect(candidateStatusLabel('discarded')).toBe('已丢弃');
    expect(candidateCompletenessLabel('complete')).toBe('内容完整');
    expect(candidateCompletenessLabel('partial')).toBe('内容未完成');

    const beat = contractInput<SceneBeat>({ id: 'beat-1', title: '雨夜', goal: '' });
    expect(sceneBeatReviewLabel([beat], 'beat-1')).toBe('雨夜');
    expect(sceneBeatReviewLabel([beat], 'missing')).toBe('场景已变化');

    const groups = groupCandidatesForReview([
      summary({ status: 'accepted' }),
      summary({ status: 'discarded' }),
      summary({ candidateType: 'skeleton' }),
      summary({ completeness: 'partial' }),
      summary({}),
    ]);
    expect(groups.map((group) => group.id)).toEqual([
      'pending',
      'partial',
      'skeleton',
      'accepted',
      'discarded',
    ]);
  });
});
