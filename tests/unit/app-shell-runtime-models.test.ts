import { readFile } from 'node:fs/promises';

import type {
  CoreStatus,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  RecentProject,
  TaskSnapshot,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  contentWidthPixels,
  continuationRoute,
  failureFromOutcome,
  isCancelledOutcome,
  isWritingRoute,
} from '../../apps/desktop/renderer/src/app/app-shell-helpers.js';
import {
  buildGlobalStatus,
  buildHomeHealthSignals,
} from '../../apps/desktop/renderer/src/app/app-shell-status.js';
import type { BridgeRequestOutcome } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import type { AiReadiness } from '../../apps/desktop/renderer/src/runtime/ai-readiness.js';
import {
  EMPTY_WORKSPACE_ATTENTION,
  type WorkspaceAttention,
} from '../../apps/desktop/renderer/src/runtime/workspace-attention.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

function core(status: string): CoreStatus {
  return contractInput<CoreStatus>({ status });
}

function project(databaseMode: 'read-write' | 'read-only' = 'read-write'): ProjectWorkspaceSummary {
  return contractInput<ProjectWorkspaceSummary>({
    projectId: 'project-1',
    name: '测试作品',
    workspacePath: '/workspace/project-1',
    databaseMode,
    compatibility: databaseMode === 'read-only' ? 'future-schema' : 'current',
    readOnlyReason: databaseMode === 'read-only' ? 'future-schema' : null,
  });
}

function recent(missingSince: string | null): RecentProject {
  return contractInput<RecentProject>({
    projectId: 'recent-1',
    missingSince,
  });
}

function attention(overrides: Partial<WorkspaceAttention> = {}): WorkspaceAttention {
  return { ...EMPTY_WORKSPACE_ATTENTION, ...overrides };
}

function readiness(status: AiReadiness['status'], message = 'AI状态'): AiReadiness {
  return contractInput<AiReadiness>({ status, providerId: null, message });
}

describe('AppShell pure runtime models', () => {
  it('resolves writing routes, continuation routes, cancellation and author-facing failures', () => {
    expect([
      isWritingRoute('writing'),
      isWritingRoute('versions'),
      isWritingRoute('candidates'),
    ]).toEqual([true, true, true]);
    expect(isWritingRoute('home')).toBe(false);

    expect(continuationRoute(null)).toBe('writing');
    expect(
      continuationRoute(
        contractInput<ProjectContinuationSnapshot>({ status: 'missing', panel: 'versions' }),
      ),
    ).toBe('writing');
    expect(
      continuationRoute(
        contractInput<ProjectContinuationSnapshot>({ status: 'ready', panel: 'editor' }),
      ),
    ).toBe('writing');
    expect(
      continuationRoute(
        contractInput<ProjectContinuationSnapshot>({ status: 'ready', panel: 'versions' }),
      ),
    ).toBe('versions');
    expect(
      continuationRoute(
        contractInput<ProjectContinuationSnapshot>({ status: 'ready', panel: 'candidates' }),
      ),
    ).toBe('candidates');

    const cancelled = contractInput<BridgeRequestOutcome<unknown>>({
      state: 'cancelled',
      generation: 1,
    });
    const cancelledFailure = contractInput<BridgeRequestOutcome<unknown>>({
      state: 'failure',
      generation: 2,
      requestId: 'request-2',
      error: {
        code: 'COMMON_CANCELLED_004',
        message: 'cancelled',
        retryable: false,
      },
    });
    const failed = contractInput<BridgeRequestOutcome<unknown>>({
      state: 'failure',
      generation: 3,
      requestId: 'request-3',
      error: {
        code: 'COMMON_INTERNAL_999',
        message: 'internal detail',
        retryable: true,
        diagnosticId: 'diag-3',
      },
    });
    const stale = contractInput<BridgeRequestOutcome<unknown>>({ state: 'stale', generation: 4 });

    expect(isCancelledOutcome(cancelled)).toBe(true);
    expect(isCancelledOutcome(cancelledFailure)).toBe(true);
    expect(isCancelledOutcome(failed)).toBe(false);
    expect(failureFromOutcome('读取失败', failed)).toMatchObject({
      title: '读取失败',
      retryable: true,
      diagnosticId: 'diag-3',
    });
    expect(failureFromOutcome('读取失败', cancelled)).toMatchObject({
      message: '操作已取消。',
      retryable: false,
    });
    expect(failureFromOutcome('读取失败', stale)).toMatchObject({
      message: '响应已被更新请求替代。',
      retryable: true,
    });

    expect(contentWidthPixels('narrow', 1600)).toBe(720);
    expect(contentWidthPixels('wide', 1600)).toBe(1280);
    expect(contentWidthPixels('adaptive', 1000)).toBe(720);
    expect(contentWidthPixels('adaptive', 2400)).toBe(1440);
    expect(contentWidthPixels('standard', 1200)).toBe(960);
  });

  it('builds home health signals without hiding simultaneous risks', () => {
    expect(
      buildHomeHealthSignals({
        activeProject: project('read-only'),
        coreStatus: core('degraded'),
        recentProjects: [recent('2026-08-01T00:00:00.000Z')],
      }),
    ).toMatchObject([
      { id: 'core-health', severity: 'data-risk' },
      { id: 'project-readonly', severity: 'data-risk' },
      { id: 'recent-missing', severity: 'high' },
    ]);

    expect(
      buildHomeHealthSignals({
        activeProject: project(),
        coreStatus: core('healthy'),
        recentProjects: [recent(null)],
      }),
    ).toEqual([]);
  });

  it('keeps P0 failures above every simultaneous workspace signal', () => {
    const status = buildGlobalStatus({
      activeProject: project('read-only'),
      aiReadiness: readiness('not-verified', 'AI尚未验证'),
      coreStatus: core('degraded'),
      creativePath: 'ai-first',
      failure: {
        title: '工作区读取失败',
        message: '无法读取工作区。',
        retryable: true,
        diagnosticId: 'diag-workspace',
      },
      message: '正在恢复',
      recentProjects: [recent('2026-08-01T00:00:00.000Z')],
      tasks: [contractInput<TaskSnapshot>({ taskId: 'task-1' })],
      workspaceAttention: attention({
        pendingCandidateCount: 2,
        partialCandidateCount: 1,
        pendingProposalCount: 1,
        openValidationCount: 2,
        highValidationCount: 1,
        searchStatus: 'rebuilding',
        searchFailedCount: 1,
        backupFailureCount: 1,
        unavailableSources: ['candidate'],
      }),
    });

    expect(status).toMatchObject({
      id: 'failure',
      priority: 'P0',
      message: '无法读取工作区。',
    });
  });

  it('orders pending review, validation, stale search, backup, AI, missing and operation states', () => {
    const base: Omit<Parameters<typeof buildGlobalStatus>[0], 'message' | 'workspaceAttention'> = {
      activeProject: project(),
      aiReadiness: readiness('ready'),
      coreStatus: core('healthy'),
      creativePath: 'offline-first',
      failure: null,
      recentProjects: [recent(null)],
      tasks: [],
    };

    expect(
      buildGlobalStatus({
        ...base,
        message: '已保存',
        workspaceAttention: attention({
          pendingCandidateCount: 2,
          openValidationCount: 1,
          searchStatus: 'stale',
        }),
      }),
    ).toMatchObject({ id: 'candidate-pending', priority: 'P2' });

    expect(
      buildGlobalStatus({
        ...base,
        message: null,
        workspaceAttention: attention({ openValidationCount: 2, highValidationCount: 0 }),
      }),
    ).toMatchObject({ id: 'validation-open' });

    expect(
      buildGlobalStatus({
        ...base,
        message: null,
        workspaceAttention: attention({ searchStatus: 'stale' }),
      }),
    ).toMatchObject({ id: 'search-stale' });

    expect(
      buildGlobalStatus({
        ...base,
        message: null,
        workspaceAttention: attention({ backupFailureCount: 1 }),
      }),
    ).toMatchObject({ id: 'backup-failed' });

    expect(
      buildGlobalStatus({
        ...base,
        aiReadiness: readiness('not-configured', '未配置AI'),
        creativePath: 'ai-first',
        message: null,
        workspaceAttention: attention(),
      }),
    ).toMatchObject({ id: 'ai-readiness', message: '未配置AI' });

    expect(
      buildGlobalStatus({
        ...base,
        recentProjects: [recent('2026-08-01T00:00:00.000Z')],
        message: null,
        workspaceAttention: attention(),
      }),
    ).toMatchObject({ id: 'missing' });

    expect(
      buildGlobalStatus({
        ...base,
        message: '设置已保存',
        workspaceAttention: attention(),
      }),
    ).toMatchObject({ id: 'operation', priority: 'P3' });

    expect(
      buildGlobalStatus({
        ...base,
        message: null,
        workspaceAttention: attention(),
      }),
    ).toBeNull();
  });

  it('registers lifecycle-only hooks while keeping pure AppShell models in coverage', async () => {
    const [config, baselineSource, exclusionsSource] = await Promise.all([
      readFile('vitest.coverage.config.ts', 'utf8'),
      readFile('docs/architecture/coverage-baseline.json', 'utf8'),
      readFile('docs/architecture/coverage-exclusions.json', 'utf8'),
    ]);
    const baseline = JSON.parse(baselineSource) as {
      core: {
        thresholdPercent: Record<'statements' | 'branches' | 'functions' | 'lines', number>;
      };
    };
    const exclusions = JSON.parse(exclusionsSource) as {
      exclusions: Array<{ path: string }>;
    };
    const excludedPaths = exclusions.exclusions.map((entry) => entry.path);

    for (const file of [
      'use-app-settings-persistence.ts',
      'use-app-shell-actions.ts',
      'use-app-shell-navigation.ts',
      'use-project-session-controller.ts',
      'use-workspace-runtime.ts',
      'use-workspace-startup.ts',
    ]) {
      expect(excludedPaths).toContain(`apps/desktop/renderer/src/app/${file}`);
    }
    expect(excludedPaths).not.toContain('apps/desktop/renderer/src/app/app-shell-helpers.ts');
    expect(excludedPaths).not.toContain('apps/desktop/renderer/src/app/app-shell-status.ts');
    expect(config).toContain('registeredCoverageExcludes');
    expect(config).toContain(
      "readFileSync(source('./docs/architecture/coverage-exclusions.json'), 'utf8')",
    );
    expect(config).toContain('thresholds:');
    expect(config).toContain(
      '[coverageBaseline.core.pattern]: coverageBaseline.core.thresholdPercent',
    );
    expect(baseline.core.thresholdPercent).toEqual({
      statements: 75,
      branches: 75,
      functions: 75,
      lines: 75,
    });
  });
});
