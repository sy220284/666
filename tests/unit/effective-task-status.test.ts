import { describe, expect, it } from 'vitest';

import {
  effectiveTaskStatus,
  hasSuccessfulCommitStatus,
  isMainEffectivelyVerified,
  isRuntimeEffectivelyVerified,
} from '../../.github/governance/effective-task-status.mjs';

describe('任务有效状态计算', () => {
  it('历史静态Verified保持有效', () => {
    expect(isRuntimeEffectivelyVerified({ status: 'VERIFIED' }, [])).toBe(true);
    expect(isRuntimeEffectivelyVerified(null, [], 'Verified')).toBe(true);
  });

  it('Implemented通过任务提交状态后视为有效Verified', () => {
    const task = {
      status: 'IMPLEMENTED',
      verificationBinding: { taskContext: 'task-verification/M10-03' },
    };
    const statuses = [{ context: 'task-verification/M10-03', state: 'success' }];
    expect(isRuntimeEffectivelyVerified(task, statuses)).toBe(true);
    expect(effectiveTaskStatus(task, statuses, 'Implemented')).toBe('VERIFIED');
  });

  it('拒绝缺失、失败或错误上下文', () => {
    const task = {
      status: 'IMPLEMENTED',
      verificationBinding: { taskContext: 'task-verification/M10-03' },
    };
    expect(isRuntimeEffectivelyVerified(task, [])).toBe(false);
    expect(
      isRuntimeEffectivelyVerified(task, [
        { context: 'task-verification/M10-03', state: 'failure' },
      ]),
    ).toBe(false);
    expect(
      isRuntimeEffectivelyVerified(task, [
        { context: 'task-verification/M10-04', state: 'success' },
      ]),
    ).toBe(false);
  });

  it('统一判断主线验证Context', () => {
    const statuses = [{ context: 'main-verification', state: 'success' }];
    expect(hasSuccessfulCommitStatus(statuses, 'main-verification')).toBe(true);
    expect(isMainEffectivelyVerified(statuses)).toBe(true);
    expect(isMainEffectivelyVerified([])).toBe(false);
  });
});
