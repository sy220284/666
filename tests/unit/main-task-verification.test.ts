import { describe, expect, it } from 'vitest';

import {
  mainVerificationStatusPayload,
  taskIdFromPullBody,
  taskVerificationStatusPayload,
  validateTaskVerificationBinding,
} from '../../scripts/main-verification.mjs';

describe('主分支验证状态发布', () => {
  it('发布稳定的main-verification状态', () => {
    expect(mainVerificationStatusPayload(true, 'https://example.test')).toEqual({
      state: 'success',
      context: 'main-verification',
      description: 'Final main SHA passed provenance and static verification',
      target_url: 'https://example.test',
    });
    expect(mainVerificationStatusPayload(false, 'https://example.test').state).toBe('failure');
  });

  it('从PR marker解析当前任务并发布独立task-verification状态', () => {
    expect(taskIdFromPullBody('<!-- worldforge-task: M10-22 -->')).toBe('M10-22');
    expect(taskIdFromPullBody('maintenance only')).toBeNull();
    expect(taskVerificationStatusPayload('M10-22', true, 'https://example.test')).toEqual({
      state: 'success',
      context: 'task-verification/M10-22',
      description: 'M10-22 source binding and main verification passed',
      target_url: 'https://example.test',
    });
  });

  it('Schema 2任务只在IMPLEMENTED且来源PR绑定一致时允许发布Verified事实', () => {
    const runtime = {
      schemaVersion: 2,
      id: 'M10-22',
      status: 'IMPLEMENTED',
      executionBranch: 'work',
      verificationBinding: {
        sourcePr: 341,
        mainContext: 'main-verification',
        taskContext: 'task-verification/M10-22',
      },
    };
    expect(validateTaskVerificationBinding(runtime, { taskId: 'M10-22', sourcePr: 341 })).toEqual(
      [],
    );
    expect(
      validateTaskVerificationBinding(runtime, { taskId: 'M10-22', sourcePr: 340 }),
    ).toContain('M10-22 sourcePr binding mismatch');
    expect(
      validateTaskVerificationBinding(
        { ...runtime, status: 'IN_PROGRESS' },
        { taskId: 'M10-22', sourcePr: 341 },
      ),
    ).toContain('M10-22 runtime must be IMPLEMENTED');
  });
});
