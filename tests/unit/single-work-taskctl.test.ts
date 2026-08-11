import { describe, expect, it } from 'vitest';

import { validateSingleWorkState } from '../../.github/governance/single-work-taskctl.mjs';

describe('Schema 2本地任务控制', () => {
  const authorization = {
    schemaVersion: 2,
    mode: 'single-work-pr',
    baseBranch: 'main',
    workBranch: 'work',
    governanceBranch: 'governance',
    allowDirectMainCommits: false,
    allowAdditionalBranches: false,
    maxOpenWorkPullRequests: 1,
    maxOpenGovernancePullRequests: 1,
    mainWriteMode: 'serialized',
    mergeMethod: 'squash',
    verificationClosure: 'main-status',
    workSynchronization: 'verified-reset',
    governanceSynchronization: 'verified-reset',
  };

  it('接受work与governance双集成通道授权', () => {
    expect(validateSingleWorkState(authorization)).toEqual([]);
  });

  it('拒绝未声明分支和非串行main写入', () => {
    expect(
      validateSingleWorkState({
        ...authorization,
        allowAdditionalBranches: true,
        mainWriteMode: 'parallel',
      }),
    ).toEqual(
      expect.arrayContaining([
        'Undeclared branches must be disabled',
        'mainWriteMode must be serialized',
      ]),
    );
  });

  it('拒绝错误的治理分支与同步模式', () => {
    expect(
      validateSingleWorkState({
        ...authorization,
        governanceBranch: 'policy/governance',
        governanceSynchronization: 'manual-copy',
      }),
    ).toEqual(
      expect.arrayContaining([
        'governanceBranch must be governance',
        'governanceSynchronization must be verified-reset',
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
