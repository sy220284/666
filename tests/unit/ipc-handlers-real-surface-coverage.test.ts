import { describe, expect, it, vi } from 'vitest';

import { APP_COMMANDS, IPC_CHANNELS, PROTOCOL_VERSION } from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const credentialRef = 'cred_55555555-5555-4555-8555-555555555555';
const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };

type HandlerOptions = Parameters<typeof registerIpcHandlers>[0];

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
    ipcMain: strictTestDouble(
      'SurfaceIpcMain',
      contractInput<Partial<HandlerOptions['ipcMain']>>({
        handle(channel: string, handler: (event: unknown, command: unknown) => unknown) {
          handlers.set(channel, handler);
        },
        on: vi.fn(),
        removeHandler: vi.fn(),
        removeListener: vi.fn(),
      }),
    ),
    supervisor: strictTestDouble(
      'SurfaceCoreSupervisor',
      contractInput<Partial<HandlerOptions['supervisor']>>(supervisor),
    ),
    credentialBroker: strictTestDouble(
      'SurfaceCredentialBroker',
      contractInput<Partial<HandlerOptions['credentialBroker']>>(credentialBroker),
    ),
    rendererUrl: trustedEvent.senderFrame.url,
    version: '1.2.3',
    platform: 'linux',
    logger: strictTestDouble(
      'SurfacePrivacyLogger',
      contractInput<Partial<HandlerOptions['logger']>>({
        log: vi.fn(async () => undefined),
      }),
    ),
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

  it('dispatches every settings, project and planning channel to the exact Core operation', async () => {
    const harness = createHarness();
    const cases = [
      {
        channel: IPC_CHANNELS.settingsGet,
        command: envelope(APP_COMMANDS.settingsGet),
        layer: 'app',
        operation: { operation: APP_COMMANDS.settingsGet },
      },
      {
        channel: IPC_CHANNELS.settingsSet,
        command: envelope(APP_COMMANDS.settingsSet, {
          themeId: 'theme-b',
          themeVariant: 'dark',
        }),
        layer: 'app',
        operation: {
          operation: APP_COMMANDS.settingsSet,
          settings: { themeId: 'theme-b', themeVariant: 'dark' },
        },
      },
      {
        channel: IPC_CHANNELS.settingsReset,
        command: envelope(APP_COMMANDS.settingsReset),
        layer: 'app',
        operation: { operation: APP_COMMANDS.settingsReset },
      },
      {
        channel: IPC_CHANNELS.projectListRecent,
        command: envelope(APP_COMMANDS.projectListRecent),
        layer: 'app',
        operation: { operation: APP_COMMANDS.projectListRecent },
      },
      {
        channel: IPC_CHANNELS.getActive,
        command: envelope(APP_COMMANDS.getActive),
        layer: 'project',
        operation: { operation: APP_COMMANDS.getActive },
      },
      {
        channel: IPC_CHANNELS.openRecent,
        command: envelope(APP_COMMANDS.openRecent, { projectId }),
        layer: 'project',
        operation: { operation: APP_COMMANDS.openRecent, projectId },
      },
      {
        channel: IPC_CHANNELS.getBrief,
        command: envelope(APP_COMMANDS.getBrief, { projectId }),
        layer: 'project',
        operation: { operation: APP_COMMANDS.getBrief, projectId },
      },
      {
        channel: IPC_CHANNELS.listPlotNodes,
        command: envelope(APP_COMMANDS.listPlotNodes, { projectId }),
        layer: 'project',
        operation: { operation: APP_COMMANDS.listPlotNodes, projectId },
      },
    ] as const;

    for (const testCase of cases) {
      await expect(
        invoke(harness.handlers, testCase.channel, testCase.command),
      ).resolves.toMatchObject({
        ok: false,
        requestId,
        error: { code: 'COMMON_INTERNAL_999' },
      });
    }
    expect(harness.supervisor.invokeAppDataOperation.mock.calls).toEqual(
      cases
        .filter((testCase) => testCase.layer === 'app')
        .map((testCase) => [requestId, testCase.operation]),
    );
    expect(harness.supervisor.invokeProjectOperation.mock.calls).toEqual(
      cases
        .filter((testCase) => testCase.layer === 'project')
        .map((testCase) => [requestId, testCase.operation]),
    );
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
