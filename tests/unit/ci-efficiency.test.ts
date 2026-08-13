import { describe, expect, it } from 'vitest';

import { baseGateAction } from '../../.github/governance/automerge-base-gate.mjs';
import { waitForSynchronizedIntegrationRef } from '../../.github/governance/work-synchronization.mjs';
import { evidenceEntryDecision } from '../../scripts/evidence-policy-entry.mjs';
import { riskPlan, securityPerformanceRoute } from '../../scripts/ci-risk-policy.mjs';
import { fullQualityRunPassed, taskIdFromPullBody } from '../../scripts/ready-closure-route.mjs';

describe('自动化恢复效率', () => {
  it('坏main进入healing路径而不是阻塞后续修复PR', () => {
    expect(baseGateAction('ready')).toBe('proceed');
    expect(baseGateAction('failed')).toBe('heal');
    expect(baseGateAction('pending')).toBe('wait');
  });

  it('集成分支ref更新后允许GitHub短暂返回旧值', async () => {
    const mainSha = 'a'.repeat(40);
    const oldSha = 'b'.repeat(40);
    let reads = 0;
    await expect(
      waitForSynchronizedIntegrationRef(
        async () => {
          reads += 1;
          return { object: { sha: reads < 3 ? oldSha : mainSha } };
        },
        mainSha,
        { attempts: 3, intervalMs: 0 },
      ),
    ).resolves.toBe(mainSha);
    expect(reads).toBe(3);
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

  it('governance分支允许治理源码和授权文件，不要求任务Evidence', () => {
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '',
        headRef: 'governance',
        files: ['docs/tasks/TASK_AUTHORIZATION.json', 'packages/core-service/src/index.ts'],
      }),
    ).toMatchObject({ action: 'maintenance' });
  });

  it('governance分支仍不能绕过任务Runtime或Evidence约束', () => {
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '',
        headRef: 'governance',
        files: ['docs/tasks/runtime/M11-03.json'],
      }),
    ).toMatchObject({ action: 'reject' });
    expect(
      evidenceEntryDecision({
        final: true,
        pullBody: '',
        headRef: 'governance',
        files: ['docs/test-evidence/M11-03/summary.md'],
      }),
    ).toMatchObject({ action: 'reject' });
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

describe('Security与Performance风险路由', () => {
  it('普通治理维护只保留Secret Scan，不跑应用安全/依赖审计/性能预算', () => {
    expect(
      securityPerformanceRoute([
        '.github/governance/automerge-base-gate.mjs',
        'scripts/evidence-policy-entry.mjs',
        'docs/process/DEVELOPMENT_AUTOMATION.md',
      ]),
    ).toEqual({
      dependencyAudit: false,
      applicationSecurity: false,
      performance: false,
    });
  });

  it('产品运行时代码触发应用安全和性能', () => {
    expect(securityPerformanceRoute(['packages/core-service/src/core.ts'])).toEqual({
      dependencyAudit: false,
      applicationSecurity: true,
      performance: true,
    });
  });

  it('依赖变化同时触发三类风险检查', () => {
    expect(securityPerformanceRoute(['pnpm-lock.yaml'])).toEqual({
      dependencyAudit: true,
      applicationSecurity: true,
      performance: true,
    });
  });

  it('安全或性能工作流自身变化会实跑对应套件', () => {
    expect(securityPerformanceRoute(['.github/workflows/security.yml'])).toMatchObject({
      applicationSecurity: true,
    });
    expect(securityPerformanceRoute(['.github/workflows/performance.yml'])).toMatchObject({
      performance: true,
    });
  });
});

describe('重型桌面验证精确路由', () => {
  it('普通规划页面不再触发Windows真实拼音和三平台体验', () => {
    expect(riskPlan(['apps/desktop/renderer/src/features/planning/idea-capsule-panel.tsx'])).toMatchObject({
      windowsIme: false,
      platformExperience: false,
    });
  });

  it('正文编辑器变化继续触发Windows真实拼音和三平台体验', () => {
    expect(riskPlan(['apps/desktop/renderer/src/features/writing/writing-workbench-view.tsx'])).toMatchObject({
      windowsIme: true,
      platformExperience: true,
    });
  });

  it('治理和Evidence变化触发release audit，纯产品实现不触发', () => {
    expect(riskPlan(['.github/workflows/quality.yml']).releaseAudit).toBe(true);
    expect(riskPlan(['docs/test-evidence/M11-05/summary.md']).releaseAudit).toBe(true);
    expect(riskPlan(['packages/core-service/src/core.ts']).releaseAudit).toBe(false);
  });
});

describe('Evidence收口复用完整Quality', () => {
  const completeRun = {
    id: 100,
    status: 'completed',
    conclusion: 'success',
  };
  const jobs = [
    { name: 'quality / quality', status: 'completed', conclusion: 'success' },
    { name: 'quality-core / static-checks', status: 'completed', conclusion: 'success' },
    {
      name: 'quality-core / product-tests',
      status: 'completed',
      conclusion: 'success',
      steps: [
        {
          name: 'Run product tests with coverage',
          status: 'completed',
          conclusion: 'success',
        },
      ],
    },
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
  ];

  it('只复用真正执行过产品测试、覆盖率和Electron E2E的完整Quality', () => {
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
