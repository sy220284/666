import { describe, expect, it } from 'vitest';

import {
  ConstraintBudgetError,
  estimateConstraintTokens,
  stableSerialize,
  trimConstraints,
} from '../../packages/domain/src/constraint-package.js';

const item = (
  id: string,
  priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4',
  estimatedTokens: number,
  relevance: number,
  required = priority === 'P0' || priority === 'P1',
) => ({ id, priority, estimatedTokens, relevance, required });

describe('M4-02 constraint package domain', () => {
  it('uses stable serialization and deterministic token estimation', () => {
    expect(stableSerialize({ z: 1, a: { y: 2, x: 3 } })).toBe('{"a":{"x":3,"y":2},"z":1}');
    expect(estimateConstraintTokens('玄烛城 ABC')).toBe(12);
    expect(estimateConstraintTokens('玄烛城 ABC')).toBe(estimateConstraintTokens('玄烛城 ABC'));
  });

  it('trims P4 then P3 then low-relevance P2 without removing P0 or P1', () => {
    const result = trimConstraints(
      [
        item('p0', 'P0', 30, 1),
        item('p1', 'P1', 30, 1),
        item('p2-low', 'P2', 20, 0.2, false),
        item('p2-high', 'P2', 20, 0.9, false),
        item('p3', 'P3', 20, 0.5, false),
        item('p4', 'P4', 20, 0.8, false),
      ],
      90,
    );
    expect(result.kept.map((entry) => entry.id)).toEqual(['p0', 'p1', 'p2-high']);
    expect(result.trimLog.map((entry) => entry.sourceId)).toEqual(['p4', 'p3', 'p2-low']);
    expect(result.estimatedTokens).toBe(80);
  });

  it('fails explicitly when mandatory P0 and P1 exceed the usable budget', () => {
    expect(() =>
      trimConstraints([item('p0', 'P0', 300, 1), item('p1', 'P1', 300, 1)], 512),
    ).toThrow(ConstraintBudgetError);
  });
});
