import { describe, expect, it } from 'vitest';

import { validatePullRequestShape } from '../../.github/governance/single-work-policy.mjs';

describe('main集成分支策略', () => {
  it('接受work和governance到main', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
    expect(validatePullRequestShape({ head: 'governance', base: 'main' })).toEqual([]);
    expect(validatePullRequestShape({ head: 'work/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'governance/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'fix/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'work', base: 'release' })).not.toEqual([]);
    expect(
      validatePullRequestShape({ head: 'governance', base: 'main', sameRepository: false }),
    ).not.toEqual([]);
  });

  it('产品任务仍走work，仓库治理可独立走governance', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
    expect(validatePullRequestShape({ head: 'governance', base: 'main' })).toEqual([]);
  });
});
