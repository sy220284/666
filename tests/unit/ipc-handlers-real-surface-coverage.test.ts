import { describe, expect, it, vi } from 'vitest';

import { APP_COMMANDS, IPC_CHANNELS, PROTOCOL_VERSION } from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const credentialRef = 'cred_55555555-5555-4555-8555-555555555555';
const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };

function envelope(command: string, payload: unknown = {}, currentProjectId?: string) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    command,
    ...(currentProjectId ? { projectId: currentProjectId } : {}),
    payload,
    sentAt: '2026-07-23T00:00:00.000Z',
  };
}

function createHarness() {
  const handlers = new Map<string, (event: unknown, command: unknown) => unknown>();
  const supervisor = {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 123,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(async () => ({ ok: true })),
    invokeAppDataOperation: vi.fn(async (_id: string, operation: { operation: string }) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'COMMON_INTERNAL_999',
    })),
    invokeProjectOperation: vi.fn(async (_id: string, operation: { operation: string }) => ({
      ok: false,
      operation: operation.operation,
      errorCode: 'COMMON_INTERNAL_999',
    })),
    invokeTaskCommand: vi.fn(async () => ({
      ok: true,
      requestId,
      data: { tasks: [] },
    })),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  };
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => true),
  };
  const unregister = registerIpcHandlers({
    ipcMain: {
      handle(channel: string, handler: (event: unknown, command: unknown) => unknown) {
        handlers.set(channel, handler);
      },
      on: vi.fn(),
      removeHandler: vi.fn(),
      removeListener: vi.fn(),
    } as never,
    supervisor: supervisor as never,
    credentialBroker: credentialBroker as never,
    rendererUrl: trustedEvent.senderFrame.url,
    version: '1.2.3',
    platform: 'linux',
    logger: { log: vi.fn(async () => undefined) } as never,
    getWindowPreferences: () => ({
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    setAppearancePreferences: async (preferences) => ({
      ...preferences,
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    chooseRecentLocation: async () => null,
    chooseProjectCreateParent: async () => null,
    chooseProjectToOpen: async () => null,
    chooseProjectMoveParent: async () => null,
    chooseRecoveryRestoreParent: async () => null,
    chooseRecoveryExportDirectory: async () => null,
    chooseTextImportFile: async () => null,
    chooseTextExportDirectory: async () => null,
  });
  return { handlers, supervisor, credentialBroker, unregister };
}

async function invoke(
  handlers: Map<string, (event: unknown, command: unknown) => unknown>,
  channel: string,
  command: unknown,
) {
  const handler = handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  return await handler?.(trustedEvent, command);
}

describe('IPC real-schema surface matrix', () => {
  it('covers direct App and window-preference handlers with valid envelopes', async () => {
    const harness = createHarness();
    await expect(
      invoke(harness.handlers, IPC_CHANNELS.appGetInfo, envelope(APP_COMMANDS.getInfo)),
    ).resolves.toMatchObject({
      ok: true,
      data: { version: '1.2.3', platform: 'linux' },
    });
    await expect(
      invoke(harness.handlers, IPC_CHANNELS.appGetCoreStatus, envelope(APP_COMMANDS.getCoreStatus)),
    ).resolves.toMatchObject({ ok: true, data: { status: 'healthy' } });
    await expect(
      invoke(harness.handlers, IPC_CHANNELS.appRestartCore, envelope(APP_COMMANDS.restartCore)),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      invoke(
        harness.handlers,
        IPC_CHANNELS.appGetWindowPreferences,
        envelope(APP_COMMANDS.getWindowPreferences),
      ),
    ).resolves.toMatchObject({ ok: true, data: { displayId: 'primary' } });
    await expect(
      invoke(
        harness.handlers,
        IPC_CHANNELS.appSetAppearancePreferences,
        envelope(APP_COMMANDS.setAppearancePreferences, {
          workspaceAlignment: 'right',
          uiScalePercent: 120,
          bodyFontSize: 20,
          contentWidth: 'wide',
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      data: { workspaceAlignment: 'right' },
    });
    expect(harness.supervisor.getStatus).toHaveBeenCalledTimes(2);
    expect(harness.supervisor.restart).toHaveBeenCalledOnce();
    harness.unregister();
  });

  it('covers settings, project and planning dispatch with real command schemas', async () => {
    const harness = createHarness();
    const cases = [
      [IPC_CHANNELS.settingsGet, envelope(APP_COMMANDS.settingsGet)],
      [
        IPC_CHANNELS.settingsSet,
        envelope(APP_COMMANDS.settingsSet, {
          themeId: 'theme-b',
          themeVariant: 'dark',
        }),
      ],
      [IPC_CHANNELS.settingsReset, envelope(APP_COMMANDS.settingsReset)],
      [IPC_CHANNELS.projectListRecent, envelope(APP_COMMANDS.projectListRecent)],
      [IPC_CHANNELS.getActive, envelope(APP_COMMANDS.getActive)],
      [IPC_CHANNELS.openRecent, envelope(APP_COMMANDS.openRecent, { projectId })],
      [IPC_CHANNELS.getBrief, envelope(APP_COMMANDS.getBrief, { projectId })],
      [IPC_CHANNELS.listPlotNodes, envelope(APP_COMMANDS.listPlotNodes, { projectId })],
    ] as const;

    for (const [channel, command] of cases) {
      await expect(invoke(harness.handlers, channel, command)).resolves.toMatchObject({
        ok: false,
      });
    }
    expect(harness.supervisor.invokeAppDataOperation).toHaveBeenCalledTimes(4);
    expect(harness.supervisor.invokeProjectOperation).toHaveBeenCalledTimes(4);
    harness.unregister();
  });

  it('covers task and credential handlers with authoritative inputs', async () => {
    const harness = createHarness();
    await expect(
      invoke(
        harness.handlers,
        IPC_CHANNELS.aiHasCredential,
        envelope(APP_COMMANDS.hasCredential, { credentialRef }),
      ),
    ).resolves.toMatchObject({ ok: true, data: { exists: true } });
    await expect(
      invoke(
        harness.handlers,
        IPC_CHANNELS.taskListActive,
        envelope(APP_COMMANDS.taskListActive, {}, projectId),
      ),
    ).resolves.toMatchObject({ ok: true, data: { tasks: [] } });
    await expect(
      invoke(
        harness.handlers,
        IPC_CHANNELS.taskGetSnapshot,
        envelope(APP_COMMANDS.taskGetSnapshot, { taskId }, projectId),
      ),
    ).resolves.toMatchObject({ ok: true });
    expect(harness.credentialBroker.has).toHaveBeenCalledWith(credentialRef);
    expect(harness.supervisor.invokeTaskCommand).toHaveBeenCalledTimes(2);
    harness.unregister();
  });
});
