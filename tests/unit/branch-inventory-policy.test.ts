import { describe, expect, it } from 'vitest';

import {
  branchInventoryErrors,
  invalidBranches,
  missingBranches,
} from '../../.github/governance/branch-inventory-policy.mjs';

describe('仓库分支清单策略', () => {
  it('要求main、work和governance同时存在', () => {
    expect(branchInventoryErrors(['main', 'work', 'governance'])).toEqual([]);
    expect(missingBranches(['main'])).toEqual(['work', 'governance']);
    expect(branchInventoryErrors(['main'])).toEqual([
      'Missing required repository branches: work, governance',
    ]);
  });

  it('拒绝未声明的任务、临时治理、验证和发布分支', () => {
    expect(
      invalidBranches([
        'main',
        'work',
        'governance',
        'work/m10-03',
        'governance/task',
        'fix/runtime',
        'policy/governance',
        'validate/e2e',
        'release/v1',
      ]),
    ).toEqual([
      'fix/runtime',
      'governance/task',
      'policy/governance',
      'release/v1',
      'validate/e2e',
      'work/m10-03',
    ]);
  });
});
