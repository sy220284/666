import { describe, expect, it } from 'vitest';

import {
  implementationRequiresFullQuality,
  mainVerificationStatusPayload,
  taskIdFromPullBody,
  taskVerificationStatusPayload,
  validateCapturedTaskId,
  validateSplitTaskProvenance,
  validateTaskVerificationBinding,
} from '../../scripts/main-verification.mjs';

describe('主分支任务有效验证', () => {
  it('解析PR任务标记', () => {
    expect(taskIdFromPullBody('<!-- worldforge-task: M10-03 -->')).toBe('M10-03');
    expect(taskIdFromPullBody('治理PR')).toBeNull();
  });

  it('拒绝Controlled Merge后改写任务marker', () => {
    expect(() => validateCapturedTaskId('M10-22', 'M10-21')).toThrow(
      'task marker changed after controlled merge',
    );
    expect(() => validateCapturedTaskId('M10-22', 'M10-22')).not.toThrow();
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

  it('区分实现来源与闭包来源并锁定精确提交', () => {
    const provenance = {
      implementationPr: 330,
      implementationHeadSha: 'a'.repeat(40),
      implementationMergeSha: 'b'.repeat(40),
      closurePr: 331,
      closureHeadSha: 'c'.repeat(40),
      closureMergeSha: 'd'.repeat(40),
    };
    expect(
      validateTaskVerificationBinding(
        {
          id: 'M10-21',
          status: 'IMPLEMENTED',
          executionBranch: 'work',
          verificationBinding: {
            sourcePr: 331,
            mainContext: 'main-verification',
            taskContext: 'task-verification/M10-21',
          },
        },
        { taskId: 'M10-21', sourcePr: 331 },
        provenance,
      ),
    ).toEqual([]);
    expect(
      validateSplitTaskProvenance({
        taskId: 'M10-21',
        provenance,
        implementationPull: {
          number: 330,
          merged: true,
          merged_at: '2026-08-08T23:19:16Z',
          head: { sha: 'a'.repeat(40) },
          merge_commit_sha: 'b'.repeat(40),
        },
        closurePull: {
          number: 331,
          head: { sha: 'c'.repeat(40) },
          merge_commit_sha: 'd'.repeat(40),
        },
        implementationAncestor: true,
        closureFiles: ['docs/tasks/runtime/M10-21.json', 'docs/test-evidence/M10-21/summary.md'],
        runtimeSource: 'docs/tasks/M10/M10-21_CURRENT_AUTHORITY_TEST_ARCHITECTURE_MODERNIZATION.md',
      }),
    ).toEqual([]);
  });

  it('拒绝闭包PR夹带实现文件并按实现差异选择完整质量矩阵', () => {
    const provenance = {
      implementationPr: 330,
      implementationHeadSha: 'a'.repeat(40),
      implementationMergeSha: 'b'.repeat(40),
      closurePr: 331,
      closureHeadSha: 'c'.repeat(40),
      closureMergeSha: 'd'.repeat(40),
    };
    expect(
      validateSplitTaskProvenance({
        taskId: 'M10-21',
        provenance,
        implementationPull: {
          number: 330,
          merged: true,
          merged_at: '2026-08-08T23:19:16Z',
          head: { sha: 'a'.repeat(40) },
          merge_commit_sha: 'b'.repeat(40),
        },
        closurePull: {
          number: 331,
          head: { sha: 'c'.repeat(40) },
          merge_commit_sha: 'd'.repeat(40),
        },
        closureFiles: ['packages/core-service/src/index.ts'],
        runtimeSource: 'docs/tasks/M10/M10-21.md',
      }),
    ).toContain('M10-21 closure changed non-closure path: packages/core-service/src/index.ts');
    expect(implementationRequiresFullQuality(['docs/design.md'])).toBe(false);
    expect(implementationRequiresFullQuality(['tests/unit/governance.test.ts'])).toBe(true);
  });
});
