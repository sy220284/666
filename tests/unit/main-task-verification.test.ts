import { describe, expect, it } from 'vitest';

import {
  mainVerificationStatusPayload,
  taskIdFromPullBody,
  taskVerificationStatusPayload,
  validateTaskVerificationBinding,
} from '../../scripts/main-verification.mjs';

describe('主分支任务有效验证', () => {
  it('解析PR任务标记', () => {
    expect(taskIdFromPullBody('<!-- worldforge-task: M10-03 -->')).toBe('M10-03');
    expect(taskIdFromPullBody('治理PR')).toBeNull();
  });

  it('接受完整的任务来源绑定', () => {
    expect(
      validateTaskVerificationBinding(
        {
          id: 'M10-03',
          status: 'IMPLEMENTED',
          executionBranch: 'work',
          verificationBinding: {
            sourcePr: 301,
            mainContext: 'main-verification',
            taskContext: 'task-verification/M10-03',
          },
        },
        { taskId: 'M10-03', sourcePr: 301 },
      ),
    ).toEqual([]);
  });

  it('拒绝来源PR或任务状态不一致', () => {
    expect(
      validateTaskVerificationBinding(
        {
          id: 'M10-03',
          status: 'IN_PROGRESS',
          executionBranch: 'work',
          verificationBinding: {
            sourcePr: 302,
            mainContext: 'main-verification',
            taskContext: 'task-verification/M10-03',
          },
        },
        { taskId: 'M10-03', sourcePr: 301 },
      ),
    ).not.toEqual([]);
  });

  it('发布稳定的主分支与任务状态上下文', () => {
    expect(mainVerificationStatusPayload(true, 'https://example.test').context).toBe(
      'main-verification',
    );
    expect(taskVerificationStatusPayload('M10-03', true, 'https://example.test').context).toBe(
      'task-verification/M10-03',
    );
  });
});
