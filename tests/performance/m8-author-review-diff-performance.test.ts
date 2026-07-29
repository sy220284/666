import { performance } from 'node:perf_hooks';

import { describe, expect, it } from 'vitest';

import {
  changedReviewLineIndexes,
  createReviewDiff,
} from '../../apps/desktop/renderer/src/features/writing/review-diff.js';
import { visibleReviewLines } from '../../apps/desktop/renderer/src/features/writing/review-diff-panel.js';

function percentile95(values: readonly number[]): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.ceil(ordered.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
}

describe('M8-04 长章节差异审阅降级预算', () => {
  it('一万二千行正文保持线性降级并只渲染变化上下文', () => {
    const current = Array.from({ length: 12_000 }, (_, index) => `第${index + 1}行正文`);
    const comparison = [...current];
    comparison.splice(200, 0, '新增的开场线索');
    comparison[6_000] = '第六千行正文（已调整）';
    comparison.splice(10_000, 1);
    const samples: number[] = [];
    let visibleCount = Number.POSITIVE_INFINITY;

    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      const diff = createReviewDiff(current.join('\n'), comparison.join('\n'));
      const changed = changedReviewLineIndexes(diff);
      visibleCount = visibleReviewLines(diff, changed, false).length;
      samples.push(performance.now() - startedAt);
      expect(changed.length).toBeGreaterThanOrEqual(3);
    }

    expect(percentile95(samples)).toBeLessThan(500);
    expect(visibleCount).toBeLessThan(120);
  });
});
