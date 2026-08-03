import { describe, expect, it } from 'vitest';

import {
  branchInventoryErrors,
  invalidBranches,
  missingBranches,
} from '../../.github/governance/branch-inventory-policy.mjs';

describe('仓库分支清单策略', () => {
  it('要求main和work同时存在', () => {
    expect(branchInventoryErrors(['main', 'work'])).toEqual([]);
    expect(missingBranches(['main'])).toEqual(['work']);
    expect(branchInventoryErrors(['main'])).toEqual(['Missing required repository branches: work']);
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
    ).toEqual(['fix/runtime', 'policy/governance', 'release/v1', 'validate/e2e', 'work/m10-03']);
  });
});
