import { beforeEach, describe, expect, it, vi } from 'vitest';

const transport = vi.hoisted(() => ({
  rendererUrl: 'file:///renderer.html',
  exposed: undefined as unknown,
  handlers: new Map<string, (event: unknown, command: unknown) => unknown>(),
  invokedChannels: [] as string[],
  postMessage: vi.fn(),
}));

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, value: unknown) => {
      transport.exposed = value;
    },
  },
  ipcRenderer: {
    invoke: async (channel: string, command: unknown) => {
      transport.invokedChannels.push(channel);
      const handler = transport.handlers.get(channel);
      if (!handler) throw new Error(`MISSING_IPC_HANDLER:${channel}`);
      return await handler({ senderFrame: { url: transport.rendererUrl } }, command);
    },
    postMessage: transport.postMessage,
  },
}));

import {
  DEFAULT_APP_SETTINGS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  type AppSettings,
  type AppSettingsSnapshot,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import { executeAppDataOperation } from '../../packages/core-service/src/utility-app-data-router.js';
import { executeProjectOperation } from '../../packages/core-service/src/utility-project-router.js';

const project = {
  projectId: '22222222-2222-4222-8222-222222222222',
  name: '集成测试项目',
  channel: 'test',
  workspacePath: '/tmp/worldforge-integration-project',
  schemaVersion: 19,
  databaseMode: 'read-write',
  compatibility: 'current',
  readOnlyReason: null,
  createdAt: '2026-07-23T00:00:00.000Z',
} as const;

const windowPreferences = {
  workspaceAlignment: 'center' as const,
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal' as const,
  displayId: 'primary',
  boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
  scaleFactor: 1,
  maximized: false,
};

function createCoreRuntime() {
  let settings: AppSettings = { ...DEFAULT_APP_SETTINGS };
  const snapshot = (source: AppSettingsSnapshot['source']): AppSettingsSnapshot => ({
    source: source as 'default' | 'stored',
    settings: { ...settings },
  });
  return {
    readSettings: () => settings,
    appRuntime: {
      appSettings: {
        get: () => snapshot('stored'),
        update: async (_requestId: string, update: Partial<AppSettings>) => {
          settings = { ...settings, ...update };
          return snapshot('stored');
        },
        reset: async () => {
          settings = { ...DEFAULT_APP_SETTINGS };
          return snapshot('default');
        },
      },
      recentProjects: {
        list: async () => [],
        relocate: async () => {
          throw new Error('unused');
        },
        remove: async () => false,
      },
    },
    projectServices: {
      projectWorkspace: { activeProject: project },
    },
  };
}

function registerTransport() {
  const core = createCoreRuntime();
  const unregister = registerIpcHandlers({
    ipcMain: {
      handle(channel: string, handler: (event: unknown, command: unknown) => unknown) {
        transport.handlers.set(channel, handler);
      },
      on: vi.fn(),
      removeHandler(channel: string) {
        transport.handlers.delete(channel);
      },
      removeListener: vi.fn(),
    } as never,
    supervisor: {
      getStatus: () => ({
        status: 'healthy',
        pid: 123,
        restartCount: 0,
        lastErrorCode: null,
        diagnosticId: null,
      }),
      restart: async () => ({ ok: true }),
      invokeAppDataOperation: (requestId: string, operation: never) =>
        executeAppDataOperation(core.appRuntime as never, requestId, operation),
      invokeProjectOperation: (requestId: string, operation: never) =>
        executeProjectOperation(core.projectServices as never, requestId, operation),
      invokeTaskCommand: vi.fn(),
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as never,
    credentialBroker: {
      store: vi.fn(),
      remove: vi.fn(),
      has: vi.fn(),
    } as never,
    rendererUrl: transport.rendererUrl,
    version: '1.2.3',
    platform: 'linux',
    logger: { log: vi.fn(async () => undefined) } as never,
    getWindowPreferences: () => windowPreferences,
    setAppearancePreferences: async (preferences) => ({ ...windowPreferences, ...preferences }),
    chooseRecentLocation: async () => null,
    chooseProjectCreateParent: async () => null,
    chooseProjectToOpen: async () => null,
    chooseProjectMoveParent: async () => null,
    chooseRecoveryRestoreParent: async () => null,
    chooseRecoveryExportDirectory: async () => null,
    chooseTextImportFile: async () => null,
    chooseTextExportDirectory: async () => null,
  });
  return { core, unregister };
}

describe('Preload → IPC Main → Core integration', () => {
  beforeEach(async () => {
    transport.exposed = undefined;
    transport.handlers.clear();
    transport.invokedChannels.length = 0;
    transport.postMessage.mockReset();
    vi.resetModules();
  });

  it('round-trips real settings schemas through the actual IPC and Core routers', async () => {
    const { core, unregister } = registerTransport();
    await import('../../apps/desktop/preload/src/index.js');
    const bridge = transport.exposed as WorldforgeBridge;

    await expect(bridge.settings.get()).resolves.toMatchObject({
      ok: true,
      data: { settings: DEFAULT_APP_SETTINGS },
    });
    await expect(
      bridge.settings.set({ themeId: 'theme-b', themeVariant: 'dark', reduceMotion: true }),
    ).resolves.toMatchObject({
      ok: true,
      data: {
        source: 'stored',
        settings: { themeId: 'theme-b', themeVariant: 'dark', reduceMotion: true },
      },
    });
    expect(core.readSettings()).toMatchObject({
      themeId: 'theme-b',
      themeVariant: 'dark',
      reduceMotion: true,
    });

    await expect(bridge.settings.reset()).resolves.toMatchObject({
      ok: true,
      data: { source: 'default' },
    });
    expect(core.readSettings()).toEqual(DEFAULT_APP_SETTINGS);
    expect(transport.invokedChannels).toEqual([
      IPC_CHANNELS.settingsGet,
      IPC_CHANNELS.settingsSet,
      IPC_CHANNELS.settingsReset,
    ]);
    unregister();
  });

  it('round-trips a real project query and rejects invalid input before IPC dispatch', async () => {
    const { unregister } = registerTransport();
    await import('../../apps/desktop/preload/src/index.js');
    const bridge = transport.exposed as WorldforgeBridge;

    await expect(bridge.project.getActive()).resolves.toMatchObject({ ok: true, data: project });
    expect(transport.invokedChannels).toContain(IPC_CHANNELS.getActive);

    const callsBeforeInvalidInput = transport.invokedChannels.length;
    expect(() =>
      bridge.app.setAppearancePreferences({
        workspaceAlignment: 'center',
        uiScalePercent: 95,
        bodyFontSize: 18,
        contentWidth: 'normal',
      } as never),
    ).toThrow();
    expect(transport.invokedChannels).toHaveLength(callsBeforeInvalidInput);

    await expect(bridge.app.getInfo()).resolves.toMatchObject({
      ok: true,
      data: { version: '1.2.3', platform: 'linux', protocolVersion: PROTOCOL_VERSION },
    });
    unregister();
  });
});
