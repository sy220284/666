import { describe, expect, it } from 'vitest';

import {
  implementationBindingErrors,
  runtimeAuthorizationErrors,
  taskAuthorizationIdFromBody,
  taskAuthorizationPathErrors,
  taskIdFromBody,
  validateAuthorization,
  validatePlannedRuntime,
  validatePullRequestShape,
  validateRuntime,
} from '../../.github/governance/single-work-policy.mjs';

describe('唯一work合并请求策略', () => {
  const authorization = {
    schemaVersion: 2,
    mode: 'single-work-pr',
    baseBranch: 'main',
    workBranch: 'work',
    allowDirectMainCommits: false,
    allowAdditionalBranches: false,
    maxOpenWorkPullRequests: 1,
    mainWriteMode: 'serialized',
    mergeMethod: 'squash',
    verificationClosure: 'main-status',
    workSynchronization: 'verified-reset',
  };

  it('接受Schema 2唯一work授权', () => {
    expect(validateAuthorization(authorization)).toEqual([]);
  });

  it.each(['parallel-pr', 'implementation-pr', 'continuous-mainline'])(
    '拒绝旧授权模式%s',
    (mode) => {
      expect(validateAuthorization({ ...authorization, mode })).not.toEqual([]);
    },
  );

  it('只接受work到main', () => {
    expect(validatePullRequestShape({ head: 'work', base: 'main' })).toEqual([]);
    expect(validatePullRequestShape({ head: 'work/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'fix/task', base: 'main' })).not.toEqual([]);
    expect(validatePullRequestShape({ head: 'work', base: 'release' })).not.toEqual([]);
    expect(
      validatePullRequestShape({ head: 'work', base: 'main', sameRepository: false }),
    ).not.toEqual([]);
  });

  it('解析任务标记但不以分支名路由', () => {
    expect(taskIdFromBody('<!-- worldforge-task: M10-04 -->')).toBe('M10-04');
    expect(taskAuthorizationIdFromBody('<!-- worldforge-task-authorization: M10-22 -->')).toBe(
      'M10-22',
    );
    expect(taskIdFromBody('无任务')).toBeNull();
  });

  it('活动任务只接受Schema 2 Runtime', () => {
    const active = {
      id: 'M10-04',
      status: 'IN_PROGRESS',
      executionBranch: 'work',
      allowedPaths: ['apps/'],
      forbiddenPaths: [],
      dependencies: ['M10-03'],
      verification: ['pnpm test'],
      source: 'docs/tasks/M10/M10-04.md',
    };
    expect(validateRuntime({ ...active, schemaVersion: 2 }, 'M10-04')).toEqual([]);
    expect(validateRuntime({ ...active, schemaVersion: 1 }, 'M10-04')).toContain(
      'M10-04 active runtime must use schemaVersion 2',
    );
  });

  it('要求新任务先以精确基线建立PLANNED授权', () => {
    const baseSha = 'a'.repeat(40);
    const runtime = {
      schemaVersion: 2,
      id: 'M10-22',
      status: 'PLANNED',
      executionBranch: 'work',
      source: 'docs/tasks/M10/M10-22.md',
      priority: 'P0',
      dependencies: ['M10-21'],
      baseline: { main: baseSha, work: baseSha },
      allowedPaths: ['apps/'],
      forbiddenPaths: [],
      verification: ['pnpm test'],
    };
    expect(validatePlannedRuntime(runtime, 'M10-22', baseSha)).toEqual([]);
    expect(
      validatePlannedRuntime(
        { ...runtime, baseline: { main: 'b'.repeat(40), work: baseSha } },
        'M10-22',
        baseSha,
      ),
    ).toContain('M10-22 authorization baseline must equal the pull request base SHA');
  });

  it('拒绝实现PR扩张自身Runtime授权', () => {
    const previous = {
      id: 'M10-22',
      executionBranch: 'work',
      source: 'docs/tasks/M10/M10-22.md',
      priority: 'P0',
      dependencies: ['M10-21'],
      baseline: { main: 'a'.repeat(40), work: 'a'.repeat(40) },
      allowedPaths: ['apps/'],
      forbiddenPaths: ['packages/contracts/'],
      verification: ['pnpm test'],
    };
    expect(
      runtimeAuthorizationErrors(previous, {
        ...previous,
        allowedPaths: ['apps/', 'packages/contracts/'],
        forbiddenPaths: [],
      }),
    ).toEqual([
      'M10-22 runtime authorization changed: allowedPaths',
      'M10-22 runtime authorization changed: forbiddenPaths',
    ]);
    expect(runtimeAuthorizationErrors(null, previous)).toEqual([
      'Task implementation requires a Runtime already authorized on main',
    ]);
  });

  it('任务授权PR只允许任务卡、Runtime与索引', () => {
    const task = {
      id: 'M10-22',
      source: 'docs/tasks/M10/M10-22.md',
    };
    expect(
      taskAuthorizationPathErrors(
        ['docs/tasks/runtime/M10-22.json', 'docs/tasks/M10/M10-22.md', 'docs/tasks/TASK_INDEX.md'],
        task,
      ),
    ).toEqual([]);
    expect(taskAuthorizationPathErrors(['packages/contracts/src/index.ts'], task)).toContain(
      'packages/contracts/src/index.ts: task authorization PR may only change its task card, Runtime and index',
    );
  });

  it('Implemented Runtime分别绑定当前实现PR与闭包PR', () => {
    const task = {
      id: 'M10-22',
      status: 'IMPLEMENTED',
      verificationBinding: {
        implementationPr: 332,
        closurePr: 332,
        mainContext: 'main-verification',
        taskContext: 'task-verification/M10-22',
      },
    };
    expect(implementationBindingErrors(task, 'M10-22', 332)).toEqual([]);
    expect(
      implementationBindingErrors(
        { ...task, verificationBinding: { ...task.verificationBinding, closurePr: 333 } },
        'M10-22',
        332,
      ),
    ).toContain('M10-22 closurePr must equal the current pull request');
  });
});
