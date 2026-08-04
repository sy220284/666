import { describe, expect, it } from 'vitest';

import { validateSingleWorkState } from '../../.github/governance/single-work-taskctl.mjs';

describe('Schema 2本地任务控制', () => {
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

  it('接受完整Schema 2授权', () => {
    expect(validateSingleWorkState(authorization)).toEqual([]);
  });

  it('拒绝额外分支和非串行main写入', () => {
    expect(
      validateSingleWorkState({
        ...authorization,
        allowAdditionalBranches: true,
        mainWriteMode: 'parallel',
      }),
    ).toEqual(
      expect.arrayContaining([
        'Additional branches must be disabled',
        'mainWriteMode must be serialized',
      ]),
    );
  });

  it('拒绝错误的验证关闭和work同步模式', () => {
    expect(
      validateSingleWorkState({
        ...authorization,
        verificationClosure: 'runtime-text',
        workSynchronization: 'manual-copy',
      }),
    ).toEqual(
      expect.arrayContaining([
        'verificationClosure must be main-status',
        'workSynchronization must be verified-reset',
      ]),
    );
  });
});
