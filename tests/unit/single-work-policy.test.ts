import { describe, expect, it } from 'vitest';

import {
  taskIdFromBody,
  validateAuthorization,
  validatePullRequestShape,
  validateRuntime,
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
    expect(validatePullRequestShape({ head: 'work/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'fix/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'work', base: 'release' })).not.toEqual([]);
    expect(
      validatePullRequestShape({ head: 'work', base: 'main', sameRepository: false }),
    ).not.toEqual([]);
  });

  it('解析任务标记但不以分支名路由', () => {
    expect(taskIdFromBody('<!-- worldforge-task: M10-04 -->')).toBe('M10-04');
    expect(taskIdFromBody('无任务')).toBeNull();
  });

  it('活动任务只接受Schema 2 Runtime', () => {
    const active = {
      id: 'M10-04',
      status: 'IN_PROGRESS',
      executionBranch: 'work',
      allowedPaths: ['apps/'],
      forbiddenPaths: [],
      dependencies: ['M10-03'],
      verification: ['pnpm test'],
    };
    expect(validateRuntime({ ...active, schemaVersion: 2 }, 'M10-04')).toEqual([]);
    expect(validateRuntime({ ...active, schemaVersion: 1 }, 'M10-04')).toContain(
      'M10-04 active runtime must use schemaVersion 2',
    );
  });
});
