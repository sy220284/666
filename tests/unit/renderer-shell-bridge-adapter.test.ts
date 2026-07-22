import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

describe('M3-07 shell bridge adapter', () => {
  it('routes appearance, settings and project lifecycle operations through named keys', async () => {
    const bridge = {
      app: {
        getInfo: vi.fn(async () => success('info', { version: '0.1.0' })),
        getCoreStatus: vi.fn(async () => success('core-status', { status: 'healthy' })),
        restartCore: vi.fn(async () => success('restart', { accepted: true })),
        getWindowPreferences: vi.fn(async () =>
          success('window-preferences', { maximized: false }),
        ),
        setAppearancePreferences: vi.fn(async (preferences) =>
          success('appearance', { ...preferences, maximized: false }),
        ),
      },
      settings: {
        get: vi.fn(async () => success('settings-get', { appearance: {} })),
        set: vi.fn(async (settings) => success('settings-set', settings)),
        reset: vi.fn(async () => success('settings-reset', { appearance: {} })),
      },
      project: {
        listRecent: vi.fn(async () => success('recent-list', { projects: [] })),
        relocateRecent: vi.fn(async (projectId) => success('recent-relocate', { id: projectId })),
        removeRecent: vi.fn(async () => success('recent-remove', { removed: true })),
        getActive: vi.fn(async () => success('active', null)),
        create: vi.fn(async (input) => success('project-create', { id: input.name })),
        openSelected: vi.fn(async () => success('project-open-selected', { id: 'selected' })),
        openRecent: vi.fn(async (projectId) => success('project-open-recent', { id: projectId })),
        close: vi.fn(async (projectId) => success('project-close', { projectId })),
        move: vi.fn(async (projectId) => success('project-move', { projectId })),
      },
      task: {
        getSnapshot: vi.fn(async (taskId) => success('task-snapshot', { taskId })),
        cancel: vi.fn(async () => success('task-cancel', { accepted: true, status: 'running' })),
        listActive: vi.fn(async () => success('task-list', { tasks: [] })),
        subscribe: vi.fn(() => () => undefined),
      },
    };
    const adapter = createRendererBridgeAdapter(bridge);

    await expect(adapter.settings.get()).resolves.toMatchObject({
      state: 'success',
      requestId: 'settings-get',
    });
    await expect(
      adapter.app.setAppearancePreferences({
        workspaceAlignment: 'center',
        uiScalePercent: 100,
        bodyFontSize: 18,
        contentWidth: 'normal',
      }),
    ).resolves.toMatchObject({ state: 'success', requestId: 'appearance' });
    await expect(adapter.project.openRecent('project-1')).resolves.toMatchObject({
      state: 'success',
      data: { id: 'project-1' },
    });
    await expect(adapter.project.close('project-1')).resolves.toMatchObject({
      state: 'success',
      requestId: 'project-close',
    });
    await expect(adapter.task.listActive()).resolves.toMatchObject({
      state: 'success',
      requestId: 'task-list',
      data: { tasks: [] },
    });
    const listener = vi.fn();
    const unsubscribe = adapter.task.subscribe(listener, 'project-1');
    expect(bridge.task.subscribe).toHaveBeenCalledWith(listener, 'project-1');
    unsubscribe();
  });
});
