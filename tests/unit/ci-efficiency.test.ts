import { describe, expect, it } from 'vitest';

import { baseGateAction } from '../../.github/governance/automerge-base-gate.mjs';
import { evidenceEntryDecision } from '../../scripts/evidence-policy-entry.mjs';
import { fullQualityRunPassed, taskIdFromPullBody } from '../../scripts/ready-closure-route.mjs';

describe('自动化恢复效率', () => {
  it('坏main进入healing路径而不是阻塞后续修复PR', () => {
    expect(baseGateAction('ready')).toBe('proceed');
    expect(baseGateAction('failed')).toBe('heal');
    expect(baseGateAction('pending')).toBe('wait');
  });
});

describe('维护PR的Evidence路由', () => {
  it('纯治理维护Ready无需制造任务Evidence', () => {
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '',
        files: ['.github/workflows/quality.yml', 'scripts/ready-closure-route.mjs'],
      }),
    ).toMatchObject({ action: 'maintenance' });
  });

  it('产品改动无任务标记时仍然拒绝', () => {
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '',
        files: ['packages/core-service/src/core.ts'],
      }),
    ).toMatchObject({ action: 'reject' });
  });

  it('带任务标记继续走严格Evidence闭包', () => {
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '<!-- worldforge-task: M10-23 -->',
        files: ['packages/core-service/src/core.ts'],
      }),
    ).toMatchObject({ action: 'delegate' });
  });
});

describe('Evidence收口复用完整Quality', () => {
  const completeRun = {
    id: 100,
    status: 'completed',
    conclusion: 'success',
  };
  const jobs = [
    { name: 'quality / release-audit', status: 'completed', conclusion: 'success' },
    { name: 'quality / package-smoke', status: 'completed', conclusion: 'success' },
    { name: 'quality / quality', status: 'completed', conclusion: 'success' },
    { name: 'quality-core / static-checks', status: 'completed', conclusion: 'success' },
    {
      name: 'quality-core / product-tests',
      status: 'completed',
      conclusion: 'success',
      steps: [
        { name: 'Run unit tests', status: 'completed', conclusion: 'success' },
        { name: 'Run integration tests', status: 'completed', conclusion: 'success' },
        { name: 'Run migration tests', status: 'completed', conclusion: 'success' },
        {
          name: 'Run product source coverage threshold',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    },
    { name: 'quality-core / tests-unit', status: 'completed', conclusion: 'success' },
    { name: 'quality-core / tests-integration', status: 'completed', conclusion: 'success' },
    { name: 'quality-core / tests-migration', status: 'completed', conclusion: 'success' },
    { name: 'quality-core / coverage', status: 'completed', conclusion: 'success' },
    {
      name: 'quality-core / desktop-e2e',
      status: 'completed',
      conclusion: 'success',
      steps: [
        {
          name: 'Run Electron E2E and capture diagnostics',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    },
    { name: 'quality-core / build', status: 'completed', conclusion: 'success' },
  ];

  it('只复用真正执行过产品测试和Electron E2E的完整Quality', () => {
    expect(fullQualityRunPassed(completeRun, jobs)).toBe(true);
    const missingE2e = jobs.map((job) =>
      job.name === 'quality-core / desktop-e2e'
        ? {
            ...job,
            steps: [
              {
                name: 'Run Electron E2E and capture diagnostics',
                status: 'completed',
                conclusion: 'skipped',
              },
            ],
          }
        : job,
    );
    expect(fullQualityRunPassed(completeRun, missingE2e)).toBe(false);
  });

  it('任务标记采用精确HTML格式', () => {
    expect(taskIdFromPullBody('<!-- worldforge-task: M10-23 -->')).toBe('M10-23');
    expect(taskIdFromPullBody('worldforge-task: M10-23')).toBeNull();
  });
});
