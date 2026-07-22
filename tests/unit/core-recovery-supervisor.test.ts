import { randomUUID } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

import {
  createCoreRecoverySupervisor,
  type CoreRecoverySurface,
  type CoreRecoverySurfaceActions,
  type CoreRecoverySurfaceState,
} from '../../apps/desktop/renderer/src/runtime/core-recovery-supervisor.js';

const project: ProjectWorkspaceSummary = {
  projectId: randomUUID(),
  name: '故障恢复项目',
  channel: 'test',
  workspacePath: '/tmp/worldforge-recovery-project',
  schemaVersion: 18,
  databaseMode: 'read-write',
  compatibility: 'current',
  readOnlyReason: null,
  createdAt: '2026-07-22T12:00:00.000Z',
};

const healthy: CoreStatus = {
  status: 'healthy',
  pid: 1234,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
};

const crashed: CoreStatus = {
  status: 'crashed',
  pid: null,
  restartCount: 0,
  lastErrorCode: 'CORE_PROCESS_EXITED',
  diagnosticId: 'diag-core-crash',
};

class FakeSurface implements CoreRecoverySurface {
  actions: CoreRecoverySurfaceActions | null = null;
  states: CoreRecoverySurfaceState[] = [];
  disposed = false;

  bind(actions: CoreRecoverySurfaceActions): void {
    this.actions = actions;
  }

  render(state: CoreRecoverySurfaceState): void {
    this.states.push(state);
  }

  dispose(): void {
    this.disposed = true;
  }
}

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: randomUUID(),
    data,
  };
}

describe('M3-R01 Core recovery supervisor', () => {
  it('remembers the active project, surfaces a crash, and reopens after restart', async () => {
    const surface = new FakeSurface();
    const statusQueue = [healthy, crashed];
    const getCoreStatus = vi.fn(async () => success(statusQueue.shift() ?? healthy));
    const getActive = vi.fn(async () => success(project));
    const restartCore = vi.fn(async () => success({ accepted: true, status: healthy }));
    const openRecent = vi.fn(async () => success(project));
    const schedule = vi.fn(() => 'timer');
    const cancelSchedule = vi.fn();

    const supervisor = createCoreRecoverySupervisor({
      bridge: {
        app: { getCoreStatus, restartCore },
        project: { getActive, openRecent },
      },
      surface,
      schedule,
      cancelSchedule,
      readDraftText: () => '未保存正文',
      writeClipboardText: vi.fn(async () => undefined),
    });

    supervisor.start();
    await supervisor.checkNow();
    expect(supervisor.health).toBe('healthy');
    expect(supervisor.rememberedProjectId).toBe(project.projectId);
    expect(surface.states.at(-1)).toMatchObject({ visible: false, health: 'healthy' });

    await supervisor.checkNow();
    expect(supervisor.health).toBe('crashed');
    expect(surface.states.at(-1)).toMatchObject({
      visible: true,
      health: 'crashed',
      recovering: false,
    });

    await expect(supervisor.restart()).resolves.toBe(true);
    expect(restartCore).toHaveBeenCalledTimes(1);
    expect(openRecent).toHaveBeenCalledWith(project.projectId);
    expect(surface.states.at(-1)).toMatchObject({ visible: false, health: 'healthy' });

    supervisor.dispose();
    expect(cancelSchedule).toHaveBeenCalledWith('timer');
    expect(surface.disposed).toBe(true);
  });

  it('copies dirty editor text without requiring a Draft flush', async () => {
    const surface = new FakeSurface();
    const writeClipboardText = vi.fn(async () => undefined);
    const supervisor = createCoreRecoverySupervisor({
      bridge: {
        app: {
          getCoreStatus: vi.fn(async () => success(crashed)),
          restartCore: vi.fn(async () => success({ accepted: false, status: crashed })),
        },
        project: {
          getActive: vi.fn(async () => success(project)),
          openRecent: vi.fn(async () => success(project)),
        },
      },
      surface,
      schedule: () => 'timer',
      cancelSchedule: () => undefined,
      readDraftText: () => '窗口中的未保存正文',
      writeClipboardText,
    });

    await expect(supervisor.copyDraft()).resolves.toBe(true);
    expect(writeClipboardText).toHaveBeenCalledWith('窗口中的未保存正文');
  });
});
