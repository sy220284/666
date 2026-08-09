import { describe, expect, it } from 'vitest';

import {
  latestChecksByName,
  latestWorkflowRun,
  modeAwareRunState,
} from '../../scripts/automerge.mjs';
import { effectiveTaskStatus } from '../../.github/governance/effective-task-status.mjs';

describe('自动合并验证轮次', () => {
  it('同一Head只认最新workflow run，避免复用Draft旧绿灯', () => {
    const oldDraft = {
      id: 99,
      head_sha: 'a'.repeat(40),
      status: 'completed',
      conclusion: 'success',
      created_at: '2026-08-09T12:00:00Z',
    };
    const readyRun = {
      id: 100,
      head_sha: 'a'.repeat(40),
      status: 'in_progress',
      conclusion: null,
      created_at: '2026-08-09T12:05:00Z',
    };
    expect(latestWorkflowRun([oldDraft, readyRun])).toBe(readyRun);
  });

  it('Quality最新轮次必须同时完成工程聚合、Release Audit与package gate', () => {
    const workflowRun = { status: 'completed', conclusion: 'success' };
    expect(
      modeAwareRunState('quality', workflowRun, [
        { name: 'quality / quality', status: 'completed', conclusion: 'success' },
        { name: 'quality / release-audit', status: 'completed', conclusion: 'success' },
        { name: 'quality / package-smoke', status: 'completed', conclusion: 'success' },
      ]).ready,
    ).toBe(true);
    expect(
      modeAwareRunState('quality', workflowRun, [
        { name: 'quality / quality', status: 'completed', conclusion: 'success' },
        { name: 'quality / release-audit', status: 'in_progress', conclusion: null },
        { name: 'quality / package-smoke', status: 'completed', conclusion: 'success' },
      ]).ready,
    ).toBe(false);
  });

  it('同名状态按时间与数字ID选择真实最新项', () => {
    const latest = latestChecksByName([
      { name: 'quality / quality', id: 99, created_at: '2026-08-09T12:00:00Z' },
      { name: 'quality / quality', id: 100, created_at: '2026-08-09T12:00:00Z' },
    ]);
    expect(latest.get('quality / quality')?.id).toBe(100);
  });
});

describe('任务有效状态权威', () => {
  const schema2Runtime = {
    schemaVersion: 2,
    id: 'M10-22',
    status: 'IMPLEMENTED',
    verificationBinding: { taskContext: 'task-verification/M10-22' },
  };

  it('Schema 2不能由TASK_INDEX静态Verified越权提升', () => {
    expect(effectiveTaskStatus(schema2Runtime, [], 'Verified')).toBe('VERIFICATION_PENDING');
  });

  it('Schema 2只有真实task-verification成功后成为Verified', () => {
    expect(
      effectiveTaskStatus(schema2Runtime, [
        { context: 'task-verification/M10-22', state: 'success' },
      ]),
    ).toBe('VERIFIED');
  });

  it('冻结Schema 1历史任务继续接受静态Verified', () => {
    expect(effectiveTaskStatus({ schemaVersion: 1, status: 'VERIFIED' }, [])).toBe('VERIFIED');
  });
});
