import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  APP_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
} from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const taskId = '33333333-3333-4333-8333-333333333333';
const credentialRef = 'cred_55555555-5555-4555-8555-555555555555';
const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };
const untrustedEvent = { senderFrame: { url: 'https://evil.example' } };

type HandlerOptions = Parameters<typeof registerIpcHandlers>[0];

interface FakePort {
  closed: number;
  close(): void;
}

function port(): FakePort {
  return {
    closed: 0,
    close() {
      this.closed += 1;
    },
  };
}

function envelope(
  command: string,
  payload: unknown = {},
  project?: string,
): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    command,
    ...(project ? { projectId: project } : {}),
    payload,
    sentAt: '2026-07-23T00:00:00.000Z',
  };
}

function createHarness(
  options: {
    fixtures?: boolean;
    setAppearancePreferences?: (preferences: unknown) => Promise<unknown>;
  } = {},
) {
  const handlers = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const listeners = new Map<string, (event: unknown, raw: unknown) => unknown>();
  const removedHandlers: string[] = [];
  const removedListeners: string[] = [];
  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, raw: unknown) => unknown) => {
      handlers.set(channel, handler);
    }),
    on: vi.fn((channel: string, listener: (event: unknown, raw: unknown) => unknown) => {
      listeners.set(channel, listener);
    }),
    removeHandler: vi.fn((channel: string) => removedHandlers.push(channel)),
    removeListener: vi.fn((channel: string) => removedListeners.push(channel)),
  };
  const supervisor = {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 123,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(async () => ({ ok: true })),
    invokeAppDataOperation: vi.fn(async (_requestId: string, operation: unknown) => ({
      ok: true,
      operation: (operation as { operation: string }).operation,
      data: {
        source: 'stored',
        settings: {
          schemaVersion: 1,
          language: 'zh-CN',
          startupBehavior: 'show-home',
          defaultMode: 'beginner',
          themeId: 'theme-a',
          themeVariant: 'light',
          reduceMotion: false,
        },
      },
    })),
    invokeProjectOperation: vi.fn(async (_requestId: string, operation: unknown) => ({
      ok: true,
      operation: (operation as { operation: string }).operation,
      data: null,
    })),
    invokeTaskCommand: vi.fn(async (command: unknown) => ({
      ok: true,
      requestId,
      data: command,
    })),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  };
  const credentialBroker = {
    store: vi.fn(async () => credentialRef),
    remove: vi.fn(async () => true),
    has: vi.fn(async () => true),
  };
  const logger = { log: vi.fn(async () => undefined) };
  const choices = {
    recent: vi.fn(async () => '/tmp/recent'),
    create: vi.fn(async () => '/tmp/create'),
    open: vi.fn(async () => '/tmp/open'),
    move: vi.fn(async () => '/tmp/move'),
    restore: vi.fn(async () => '/tmp/restore'),
    recoveryExport: vi.fn(async () => '/tmp/recovery-export'),
    importFile: vi.fn(async () => '/tmp/import.md'),
    textExport: vi.fn(async () => '/tmp/text-export'),
  };
  const setAppearancePreferences =
    options.setAppearancePreferences ??
    (async (appearance: unknown) => ({
      ...(appearance as object),
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }));
  const unregister = registerIpcHandlers({
    ipcMain: strictTestDouble(
      'IpcMain',
      contractInput<Partial<HandlerOptions['ipcMain']>>(ipcMain),
    ),
    supervisor: strictTestDouble(
      'CoreSupervisor',
      contractInput<Partial<HandlerOptions['supervisor']>>(supervisor),
    ),
    credentialBroker: strictTestDouble(
      'CredentialBroker',
      contractInput<Partial<HandlerOptions['credentialBroker']>>(credentialBroker),
    ),
    rendererUrl: trustedEvent.senderFrame.url,
    version: '1.2.3',
    platform: 'linux',
    enableTestFixtures: options.fixtures,
    logger: strictTestDouble(
      'PrivacyLogger',
      contractInput<Partial<HandlerOptions['logger']>>(logger),
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
    setAppearancePreferences: contractInput<HandlerOptions['setAppearancePreferences']>(
      setAppearancePreferences,
    ),
    chooseRecentLocation: choices.recent,
    chooseProjectCreateParent: choices.create,
    chooseProjectToOpen: choices.open,
    chooseProjectMoveParent: choices.move,
    chooseRecoveryRestoreParent: choices.restore,
    chooseRecoveryExportDirectory: choices.recoveryExport,
    chooseTextImportFile: choices.importFile,
    chooseTextExportDirectory: choices.textExport,
  });
  return {
    handlers,
    listeners,
    removedHandlers,
    removedListeners,
    supervisor,
    credentialBroker,
    logger,
    choices,
    unregister,
  };
}

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  raw: unknown,
  event: unknown = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  return await handler?.(event, raw);
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const productionHandlerChannels = sorted([
  ...Object.values(IPC_CHANNELS).filter(
    (channel) => channel !== IPC_CHANNELS.taskConnectEvents,
  ),
  ...Object.values(CANDIDATE_IPC_CHANNELS).filter(
    (channel) => channel !== CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
  ),
]);
const removableHandlerChannels = sorted([
  ...productionHandlerChannels,
  CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
]);

describe('IPC handlers real-contract branch coverage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the exact production surface and removes every configured handler symmetrically', () => {
    const harness = createHarness();
    expect(sorted(harness.handlers.keys())).toEqual(productionHandlerChannels);
    expect(sorted(harness.listeners.keys())).toEqual([IPC_CHANNELS.taskConnectEvents]);
    expect(harness.handlers.has(CANDIDATE_IPC_CHANNELS.createFixtureCandidate)).toBe(false);

    harness.unregister();
    expect(sorted(harness.removedHandlers)).toEqual(removableHandlerChannels);
    expect(sorted(harness.removedListeners)).toEqual([IPC_CHANNELS.taskConnectEvents]);
  });

  it('parses real commands and dispatches exact app-data and project operations', async () => {
    const harness = createHarness();

    await expect(
      call(
        harness,
        IPC_CHANNELS.settingsSet,
        envelope(APP_COMMANDS.settingsSet, {
          themeId: 'theme-b',
          themeVariant: 'dark',
        }),
      ),
    ).resolves.toMatchObject({ ok: true, requestId });
    expect(harness.supervisor.invokeAppDataOperation).toHaveBeenCalledWith(requestId, {
      operation: APP_COMMANDS.settingsSet,
      settings: { themeId: 'theme-b', themeVariant: 'dark' },
    });

    await expect(
      call(harness, IPC_CHANNELS.openRecent, envelope(APP_COMMANDS.openRecent, { projectId })),
    ).resolves.toMatchObject({ ok: true, requestId });
    expect(harness.supervisor.invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: APP_COMMANDS.openRecent,
      projectId,
    });

    await expect(
      call(harness, IPC_CHANNELS.appGetInfo, envelope(APP_COMMANDS.getInfo)),
    ).resolves.toMatchObject({
      ok: true,
      data: { version: '1.2.3', platform: 'linux', protocolVersion: PROTOCOL_VERSION },
    });
  });

  it('rejects untrusted and schema-invalid requests before dispatch', async () => {
    const harness = createHarness();
    const untrusted = (await call(
      harness,
      IPC_CHANNELS.openRecent,
      envelope(APP_COMMANDS.openRecent, { projectId }),
      untrustedEvent,
    )) as { ok: boolean; error: { code: string } };
    expect(untrusted).toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });

    const invalidCases = [
      [
        IPC_CHANNELS.appSetAppearancePreferences,
        envelope(APP_COMMANDS.setAppearancePreferences, {
          workspaceAlignment: 'center',
          uiScalePercent: 95,
          bodyFontSize: 18,
          contentWidth: 'normal',
        }),
      ],
      [IPC_CHANNELS.settingsSet, envelope(APP_COMMANDS.settingsSet, { themeId: 'invalid' })],
      [IPC_CHANNELS.openRecent, envelope(APP_COMMANDS.openRecent, { projectId: 'invalid' })],
      [
        IPC_CHANNELS.aiHasCredential,
        envelope(APP_COMMANDS.hasCredential, { credentialRef: 'bad' }),
      ],
    ] as const;
    for (const [channel, raw] of invalidCases) {
      await expect(call(harness, channel, raw)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
    }
    expect(harness.supervisor.invokeProjectOperation).not.toHaveBeenCalled();
    expect(harness.credentialBroker.has).not.toHaveBeenCalled();
  });

  it('maps app-data and project failures with correct query/mutation semantics', async () => {
    const harness = createHarness();
    harness.supervisor.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false,
      operation: APP_COMMANDS.settingsSet,
      errorCode: 'DB_WRITE_FAILED_004',
    });
    await expect(
      call(
        harness,
        IPC_CHANNELS.settingsSet,
        envelope(APP_COMMANDS.settingsSet, {
          reduceMotion: true,
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'DB_WRITE_FAILED_004', retryable: false },
    });

    harness.supervisor.invokeProjectOperation.mockResolvedValueOnce({
      ok: false,
      operation: APP_COMMANDS.getActive,
      errorCode: 'COMMON_NOT_FOUND_002',
      details: { field: 'projectId' },
    });
    await expect(
      call(harness, IPC_CHANNELS.getActive, envelope(APP_COMMANDS.getActive)),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_NOT_FOUND_002', details: { field: 'projectId' } },
    });
  });

  it('covers chooser cancellation and exceptions using valid commands', async () => {
    const cancelled = createHarness();
    cancelled.choices.open.mockResolvedValueOnce(null);
    await expect(
      call(cancelled, IPC_CHANNELS.openSelected, envelope(APP_COMMANDS.openSelected)),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_CANCELLED_004' } });

    const failed = createHarness();
    failed.choices.open.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(
      call(failed, IPC_CHANNELS.openSelected, envelope(APP_COMMANDS.openSelected)),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INTERNAL_999' } });
  });

  it('reports real appearance persistence and credential storage failures', async () => {
    const appearance = createHarness({
      setAppearancePreferences: async () => {
        throw new Error('save failed');
      },
    });
    await expect(
      call(
        appearance,
        IPC_CHANNELS.appSetAppearancePreferences,
        envelope(APP_COMMANDS.setAppearancePreferences, {
          workspaceAlignment: 'right',
          uiScalePercent: 120,
          bodyFontSize: 20,
          contentWidth: 'wide',
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999', retryable: true, diagnosticId: expect.any(String) },
    });
    expect(appearance.logger.log).toHaveBeenCalledWith(
      'error',
      'window.preferences.save.failed',
      expect.any(Object),
    );

    const credentials = createHarness();
    credentials.credentialBroker.store.mockRejectedValueOnce(new Error('secure storage failed'));
    await expect(
      call(
        credentials,
        IPC_CHANNELS.aiSetCredential,
        envelope(APP_COMMANDS.setCredential, { providerId: 'provider.test', credential: 'secret' }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'AI_CREDENTIAL_MISSING_002', diagnosticId: expect.any(String) },
    });
    expect(credentials.logger.log).toHaveBeenCalledWith(
      'error',
      'credential.store.failed',
      expect.any(Object),
    );
  });

  it('accepts one trusted task port and closes malformed, untrusted or rejected connections', () => {
    const harness = createHarness();
    const listener = harness.listeners.get(IPC_CHANNELS.taskConnectEvents);
    expect(listener).toBeTypeOf('function');
    const connection = { protocolVersion: PROTOCOL_VERSION, connectionId: requestId, projectId };

    const accepted = port();
    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [accepted] }, connection);
    expect(harness.supervisor.attachTaskPort).toHaveBeenCalledWith(requestId, accepted);
    expect(accepted.closed).toBe(0);

    const untrusted = port();
    listener?.({ senderFrame: untrustedEvent.senderFrame, ports: [untrusted] }, connection);
    expect(untrusted.closed).toBe(1);

    const first = port();
    const second = port();
    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [first, second] }, connection);
    expect(first.closed).toBe(1);
    expect(second.closed).toBe(1);

    const invalid = port();
    listener?.(
      { senderFrame: trustedEvent.senderFrame, ports: [invalid] },
      { ...connection, connectionId: 'invalid' },
    );
    expect(invalid.closed).toBe(1);

    harness.supervisor.attachTaskPort.mockReturnValueOnce({ ok: false });
    const rejected = port();
    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [rejected] }, connection);
    expect(rejected.closed).toBe(1);

    listener?.({ senderFrame: trustedEvent.senderFrame, ports: [] }, connection);
  });

  it('uses real task command schemas', async () => {
    const harness = createHarness();
    await call(
      harness,
      IPC_CHANNELS.taskGetSnapshot,
      envelope(APP_COMMANDS.taskGetSnapshot, { taskId }, projectId),
    );
    expect(harness.supervisor.invokeTaskCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        command: APP_COMMANDS.taskGetSnapshot,
        projectId,
        payload: { taskId },
      }),
    );
  });
});
