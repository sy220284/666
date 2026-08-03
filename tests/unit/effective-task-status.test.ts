import { describe, expect, it } from 'vitest';

import { isRuntimeEffectivelyVerified } from '../../.github/governance/effective-task-status.mjs';

describe('任务有效状态计算', () => {
  it('历史静态Verified保持有效', () => {
    expect(isRuntimeEffectivelyVerified({ status: 'VERIFIED' }, [])).toBe(true);
  });

  it('Implemented通过任务提交状态后视为有效Verified', () => {
    expect(
      isRuntimeEffectivelyVerified(
        {
          status: 'IMPLEMENTED',
          verificationBinding: { taskContext: 'task-verification/M10-03' },
        },
        [{ context: 'task-verification/M10-03', state: 'success' }],
      ),
    ).toBe(true);
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
});
