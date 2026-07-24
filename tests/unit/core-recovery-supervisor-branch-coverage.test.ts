import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { CoreStatus, ProjectWorkspaceSummary, RecentProject } from '@worldforge/contracts';
import {
  createCoreRecoverySupervisor,
  type CoreRecoverySurface,
  type CoreRecoverySurfaceActions,
  type CoreRecoverySurfaceState,
} from '../../apps/desktop/renderer/src/runtime/core-recovery-supervisor.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const project: ProjectWorkspaceSummary = {
  projectId: randomUUID(),
  name: '恢复项目',
  channel: 'test',
  workspacePath: '/tmp/recovery-project',
  schemaVersion: 19,
  databaseMode: 'read-write',
  compatibility: 'current',
  readOnlyReason: null,
  createdAt: '2026-07-23T00:00:00.000Z',
};
const recent: RecentProject = {
  projectId: project.projectId,
  workspacePath: project.workspacePath,
  displayName: project.name,
  lastOpenedAt: '2026-07-23T00:00:00.000Z',
  missingSince: null,
};
const healthy: CoreStatus = {
  status: 'healthy',
  pid: 123,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
};
const degraded: CoreStatus = {
  status: 'degraded',
  pid: 123,
  restartCount: 1,
  lastErrorCode: 'CORE_DEGRADED',
  diagnosticId: 'diag-degraded',
};
const crashed: CoreStatus = {
  status: 'crashed',
  pid: null,
  restartCount: 1,
  lastErrorCode: 'CORE_PROCESS_EXITED',
  diagnosticId: 'diag-crashed',
};

type RecoveryOptions = Parameters<typeof createCoreRecoverySupervisor>[0];
type RecoveryBridge = RecoveryOptions['bridge'];

class Surface implements CoreRecoverySurface {
  actions: CoreRecoverySurfaceActions | null = null;
  readonly states: CoreRecoverySurfaceState[] = [];
  disposeCalls = 0;

  bind(actions: CoreRecoverySurfaceActions): void {
    this.actions = actions;
  }
  render(state: CoreRecoverySurfaceState): void {
    this.states.push(state);
  }
  dispose(): void {
    this.disposeCalls += 1;
  }
}

function success<T>(data: T) {
  return { state: 'success' as const, generation: 1, requestId: randomUUID(), data };
}
function failure(code: string) {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: randomUUID(),
    error: { code, message: code, retryable: false },
  };
}
function pending() {
  return { state: 'pending' as const, generation: 1, requestId: randomUUID() };
}
function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((reason?: unknown) => void) | undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve: (value: T) => resolve?.(value),
    reject: (reason?: unknown) => reject?.(reason),
  };
}

function harness(
  overrides: {
    status?: unknown;
    active?: unknown;
    restart?: unknown;
    recents?: unknown;
    reopen?: unknown;
    draft?: string;
    clipboardReject?: boolean;
  } = {},
) {
  const surface = new Surface();
  const getCoreStatus = vi.fn(async () => overrides.status ?? success(healthy));
  const getActive = vi.fn(async () => overrides.active ?? success(project));
  const restartCore = vi.fn(
    async () => overrides.restart ?? success({ accepted: true, status: healthy }),
  );
  const listRecent = vi.fn(async () => overrides.recents ?? success({ projects: [recent] }));
  const openRecent = vi.fn(async () => overrides.reopen ?? success(project));
  const schedule = vi.fn(() => 'timer');
  const cancelSchedule = vi.fn();
  const writeClipboardText = vi.fn(async () => {
    if (overrides.clipboardReject) throw new Error('clipboard failed');
  });
  const bridge = strictTestDouble<RecoveryBridge>(
    'CoreRecoveryBridge',
    contractInput({
      app: { getCoreStatus, restartCore },
      project: { getActive, listRecent, openRecent },
    }),
  );
  const supervisor = createCoreRecoverySupervisor({
    bridge,
    surface,
    pollIntervalMs: 250,
    schedule,
    cancelSchedule,
    readDraftText: () => overrides.draft ?? '草稿正文',
    writeClipboardText,
  });
  return {
    supervisor,
    surface,
    getCoreStatus,
    getActive,
    restartCore,
    listRecent,
    openRecent,
    schedule,
    cancelSchedule,
    writeClipboardText,
  };
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe('Core recovery supervisor branch coverage', () => {
  it.each([249, 250.5, Number.NaN])('rejects invalid poll interval %s', (pollIntervalMs) => {
    expect(() =>
      createCoreRecoverySupervisor({
        bridge: strictTestDouble<RecoveryBridge>('InvalidRecoveryBridge', {}),
        surface: new Surface(),
        pollIntervalMs,
      }),
    ).toThrow('CORE_RECOVERY_POLL_INTERVAL_INVALID');
  });

  it('starts once, invokes bound actions, polls through the timer and disposes once', async () => {
    const value = harness();
    value.supervisor.start();
    value.supervisor.start();
    await flush();
    expect(value.schedule).toHaveBeenCalledTimes(1);
    expect(value.surface.actions).not.toBeNull();
    const timerHandler = value.schedule.mock.calls[0]?.[0] as (() => void) | undefined;
    timerHandler?.();
    await flush();
    value.surface.actions?.copyDraft();
    value.surface.actions?.restart();
    await flush();
    expect(value.writeClipboardText).toHaveBeenCalled();
    expect(value.restartCore).toHaveBeenCalled();
    value.supervisor.dispose();
    value.supervisor.dispose();
    value.supervisor.start();
    expect(value.cancelSchedule).toHaveBeenCalledTimes(1);
    expect(value.surface.disposeCalls).toBe(1);
  });

  it('coalesces health checks and exposes failure, pending and thrown status outcomes', async () => {
    const status = deferred<unknown>();
    const value = harness();
    value.getCoreStatus.mockImplementationOnce(() =>
      contractInput<ReturnType<typeof value.getCoreStatus>>(status.promise),
    );
    const first = value.supervisor.checkNow();
    const second = value.supervisor.checkNow();
    expect(first).toBe(second);
    status.resolve(failure('CORE_STATUS_FAILED'));
    await first;
    expect(value.supervisor.health).toBe('unreachable');
    expect(value.surface.states.at(-1)?.message).toContain('CORE_STATUS_FAILED');

    value.getCoreStatus.mockResolvedValueOnce(
      contractInput<Awaited<ReturnType<typeof value.getCoreStatus>>>(pending()),
    );
    await value.supervisor.checkNow();
    expect(value.surface.states.at(-1)?.message).toContain('请求未完成');

    value.getCoreStatus.mockRejectedValueOnce(new Error('disconnected'));
    await value.supervisor.checkNow();
    expect(value.surface.states.at(-1)?.message).toContain('连接已中断');
  });

  it('handles healthy/degraded status and active-project success, failure and exception', async () => {
    const value = harness({ active: failure('ACTIVE_FAILED') });
    await value.supervisor.checkNow();
    expect(value.supervisor.health).toBe('healthy');
    expect(value.supervisor.rememberedProjectId).toBeNull();

    value.getActive.mockRejectedValueOnce(new Error('active collision'));
    await value.supervisor.checkNow();
    expect(value.supervisor.rememberedProjectId).toBeNull();

    value.getCoreStatus.mockResolvedValueOnce(success(degraded));
    await value.supervisor.checkNow();
    expect(value.supervisor.health).toBe('degraded');
    expect(value.surface.states.at(-1)).toMatchObject({ visible: true, health: 'degraded' });
  });

  it.each([
    [failure('RESTART_FAILED'), 'unreachable', 'Core重启失败'],
    [pending(), 'unreachable', '尚未恢复健康'],
    [success({ accepted: false, status: crashed }), 'crashed', '尚未恢复健康'],
  ])('handles restart outcome %#', async (restart, expectedHealth, message) => {
    const value = harness({ restart });
    await expect(value.supervisor.restart()).resolves.toBe(false);
    expect(value.supervisor.health).toBe(expectedHealth);
    expect(value.surface.states.at(-1)?.message).toContain(message);
    expect(value.surface.states.at(-1)?.recovering).toBe(false);
  });

  it('recovers without a project when recent list is empty, failed or throws', async () => {
    const empty = harness({ active: success(null), recents: success({ projects: [] }) });
    await empty.supervisor.checkNow();
    await expect(empty.supervisor.restart()).resolves.toBe(true);
    expect(empty.openRecent).not.toHaveBeenCalled();
    expect(empty.surface.states.at(-1)?.message).toContain('没有可自动重新打开');

    const failed = harness({ active: success(null), recents: failure('RECENT_FAILED') });
    await failed.supervisor.checkNow();
    await expect(failed.supervisor.restart()).resolves.toBe(true);
    expect(failed.openRecent).not.toHaveBeenCalled();

    const thrown = harness({ active: success(null) });
    await thrown.supervisor.checkNow();
    thrown.listRecent.mockRejectedValueOnce(new Error('recent failed'));
    await expect(thrown.supervisor.restart()).resolves.toBe(true);
  });

  it.each([
    [failure('OPEN_FAILED'), 'Core已重启，但项目重新打开失败'],
    [pending(), '项目重新打开请求未完成'],
  ])('reports project reopen outcome %#', async (reopen, message) => {
    const value = harness({ reopen });
    await value.supervisor.checkNow();
    value.getCoreStatus.mockResolvedValueOnce(success(crashed));
    await value.supervisor.checkNow();
    await expect(value.supervisor.restart()).resolves.toBe(false);
    expect(value.supervisor.health).toBe('degraded');
    expect(value.surface.states.at(-1)?.message).toContain(message);
  });

  it('handles restart exceptions and ignores late restart completion after disposal', async () => {
    const thrown = harness();
    thrown.restartCore.mockRejectedValueOnce(new Error('restart exception'));
    await expect(thrown.supervisor.restart()).resolves.toBe(false);
    expect(thrown.supervisor.health).toBe('unreachable');
    expect(thrown.surface.states.at(-1)?.message).toContain('恢复失败');

    const restart = deferred<unknown>();
    const late = harness();
    late.restartCore.mockImplementationOnce(() =>
      contractInput<ReturnType<typeof late.restartCore>>(restart.promise),
    );
    const promise = late.supervisor.restart();
    late.supervisor.dispose();
    restart.resolve(success({ accepted: true, status: healthy }));
    await expect(promise).resolves.toBe(false);
    expect(late.openRecent).not.toHaveBeenCalled();
  });

  it('covers empty, successful, failed, disposed and late clipboard writes', async () => {
    const empty = harness({ draft: '   ' });
    await expect(empty.supervisor.copyDraft()).resolves.toBe(false);
    expect(empty.writeClipboardText).not.toHaveBeenCalled();
    expect(empty.surface.states.at(-1)?.message).toContain('没有可复制');

    const successValue = harness({ draft: '正文' });
    await expect(successValue.supervisor.copyDraft()).resolves.toBe(true);
    expect(successValue.surface.states.at(-1)?.message).toContain('已复制');

    const failed = harness({ clipboardReject: true });
    await expect(failed.supervisor.copyDraft()).resolves.toBe(false);
    expect(failed.surface.states.at(-1)?.message).toContain('复制失败');

    const disposed = harness();
    disposed.supervisor.dispose();
    await expect(disposed.supervisor.copyDraft()).resolves.toBe(false);
    await expect(disposed.supervisor.restart()).resolves.toBe(false);
    await expect(disposed.supervisor.checkNow()).resolves.toBeUndefined();

    const clipboard = deferred<void>();
    const late = harness();
    late.writeClipboardText.mockImplementationOnce(() => clipboard.promise);
    const copy = late.supervisor.copyDraft();
    late.supervisor.dispose();
    clipboard.resolve();
    await expect(copy).resolves.toBe(false);
  });
});
