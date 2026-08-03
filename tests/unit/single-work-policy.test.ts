import { describe, expect, it } from 'vitest';

import {
  taskIdFromBody,
  validateAuthorization,
  validatePullRequestShape,
} from '../../.github/governance/single-work-policy.mjs';

describe('唯一work合并请求策略', () => {
  const authorization = {
    schemaVersion: 2,
    mode: 'single-work-pr',
    baseBranch: 'main',
    workBranch: 'work',
    allowDirectMainCommits: false,
    allowAdditionalBranches: false,
    maxOpenWorkPullRequests: 1,
    mainWriteMode: 'serialized',
    mergeMethod: 'squash',
    verificationClosure: 'main-status',
    workSynchronization: 'verified-reset',
  };

  it('接受Schema 2唯一work授权', () => {
    expect(validateAuthorization(authorization)).toEqual([]);
  });

  it.each(['parallel-pr', 'implementation-pr', 'continuous-mainline'])(
    '拒绝旧授权模式%s',
    (mode) => {
      expect(validateAuthorization({ ...authorization, mode })).not.toEqual([]);
    },
  );

  it('只接受work到main', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
    expect(
      validatePullRequestShape({ head: 'work/task', base: 'main' }),
    ).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'fix/task', base: 'main' })).not.toEqual(
      [],
    );
    expect(validatePullRequestShape({ head: 'work', base: 'release' })).not.toEqual(
      [],
    );
    expect(
      validatePullRequestShape({ head: 'work', base: 'main', sameRepository: false }),
    ).not.toEqual([]);
  });

  it('解析任务标记但不以分支名路由', () => {
    expect(taskIdFromBody('<!-- worldforge-task: M10-03 -->')).toBe('M10-03');
    expect(taskIdFromBody('无任务')).toBeNull();
  });
});
