import { describe, expect, it } from 'vitest';

import { invalidBranches } from '../../.github/governance/branch-inventory-policy.mjs';

describe('仓库分支清单策略', () => {
  it('只允许main和work', () => {
    expect(invalidBranches(['main', 'work'])).toEqual([]);
  });

  it('拒绝任务、治理、验证和发布分支', () => {
    expect(
      invalidBranches([
        'main',
        'work',
        'work/m10-03',
        'fix/runtime',
        'policy/governance',
        'validate/e2e',
        'release/v1',
      ]),
    ).toEqual([
      'fix/runtime',
      'policy/governance',
      'release/v1',
      'validate/e2e',
      'work/m10-03',
    ]);
  });
});
