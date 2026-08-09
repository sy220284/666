import { describe, expect, it } from 'vitest';

import { validatePullRequestShape } from '../../.github/governance/single-work-policy.mjs';

describe('唯一work合并请求策略', () => {
  it('只接受work到main', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
    expect(validatePullRequestShape({ head: 'work/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'fix/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'work', base: 'release' })).not.toEqual([]);
    expect(
      validatePullRequestShape({ head: 'work', base: 'main', sameRepository: false }),
    ).not.toEqual([]);
  });

  it('不再要求任务授权、Runtime权限范围或任务标记', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
  });
});
