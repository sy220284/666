import { describe, expect, it } from 'vitest';

import {
  mainVerificationStatusPayload,
  taskIdFromPullBody,
  taskVerificationStatusPayload,
} from '../../scripts/main-verification.mjs';

describe('主分支任务状态发布', () => {
  it('解析可选PR任务标记', () => {
    expect(taskIdFromPullBody('<!-- worldforge-task: M10-03 -->')).toBe('M10-03');
    expect(taskIdFromPullBody('治理PR')).toBeNull();
  });

  it('任务标记只用于自动发布状态，不再要求Runtime授权绑定', () => {
    expect(taskVerificationStatusPayload('M10-03', true, 'https://example.test')).toMatchObject({
      context: 'task-verification/M10-03',
      state: 'success',
    });
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
