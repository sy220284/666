import { describe, expect, it } from 'vitest';

import {
  evaluateMemoryBudget,
  summarizeMemorySeries,
} from '../../scripts/memory-leak-policy.mjs';

const mib = 1024 * 1024;

describe('memory leak steady-state policy', () => {
  it('summarizes post-GC growth and per-operation slope deterministically', () => {
    const summary = summarizeMemorySeries([
      { operations: 1_200, heapUsedBytes: 20 * mib },
      { operations: 1_450, heapUsedBytes: 20.5 * mib },
      { operations: 1_700, heapUsedBytes: 20.25 * mib },
      { operations: 1_950, heapUsedBytes: 20.75 * mib },
    ]);

    expect(summary.sampleCount).toBe(4);
    expect(summary.finalGrowthBytes).toBe(0.75 * mib);
    expect(summary.peakGrowthBytes).toBe(0.75 * mib);
    expect(summary.tailSpreadBytes).toBe(0.75 * mib);
    expect(summary.slopeBytesPerOperation).toBeGreaterThan(0);
  });

  it('fails closed while calibration is pending', () => {
    const result = evaluateMemoryBudget(
      summarizeMemorySeries([
        { operations: 1_200, heapUsedBytes: 20 * mib },
        { operations: 1_450, heapUsedBytes: 20 * mib },
      ]),
      null,
    );

    expect(result).toEqual({
      passed: false,
      calibrated: false,
      violations: ['MEMORY_BUDGET_PENDING'],
    });
  });

  it('enforces growth, spread and positive slope independently', () => {
    const summary = summarizeMemorySeries([
      { operations: 1_200, heapUsedBytes: 20 * mib },
      { operations: 1_450, heapUsedBytes: 22 * mib },
      { operations: 1_700, heapUsedBytes: 24 * mib },
    ]);
    const result = evaluateMemoryBudget(summary, {
      maxFinalGrowthBytes: 3 * mib,
      maxPeakGrowthBytes: 3 * mib,
      maxTailSpreadBytes: 3 * mib,
      maxPositiveSlopeBytesPerOperation: 1_000,
    });

    expect(result.passed).toBe(false);
    expect(result.calibrated).toBe(true);
    expect(result.violations).toEqual([
      'FINAL_GROWTH',
      'PEAK_GROWTH',
      'TAIL_SPREAD',
      'POSITIVE_SLOPE',
    ]);
  });

  it('accepts a bounded post-GC plateau', () => {
    const summary = summarizeMemorySeries([
      { operations: 1_200, heapUsedBytes: 20 * mib },
      { operations: 1_450, heapUsedBytes: 20.25 * mib },
      { operations: 1_700, heapUsedBytes: 20.1 * mib },
    ]);
    const result = evaluateMemoryBudget(summary, {
      maxFinalGrowthBytes: 2 * mib,
      maxPeakGrowthBytes: 2 * mib,
      maxTailSpreadBytes: 2 * mib,
      maxPositiveSlopeBytesPerOperation: 2_000,
    });

    expect(result).toEqual({ passed: true, calibrated: true, violations: [] });
  });

  it('rejects non-increasing operation counts', () => {
    expect(() =>
      summarizeMemorySeries([
        { operations: 1_200, heapUsedBytes: 20 * mib },
        { operations: 1_200, heapUsedBytes: 20 * mib },
      ]),
    ).toThrow(/increase strictly/);
  });
});
