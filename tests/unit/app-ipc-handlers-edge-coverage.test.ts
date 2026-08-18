import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  type DiagnosticPreview,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { createIpcHandlerContext } from '../../apps/desktop/main/src/handler-guard.js';
import { registerAppIpcHandlers } from '../../apps/desktop/main/src/app-ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const diagnostics = vi.hoisted(() => ({
  preview: vi.fn(() => ({ app: {}, core: {}, window: {}, redacted: true })),
  export: vi.fn(async () => ({ fileName: 'diagnostics.zip', filePath: '/tmp/diagnostics.zip' })),
}));

vi.mock('../../apps/desktop/main/src/diagnostic-export.js', () => ({
  createDiagnosticPreview: diagnostics.preview,
  exportDiagnosticPreview: diagnostics.export,
}));

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const trustedEvent = contractInput<IpcMainInvokeEvent>({
  senderFrame: { url: 'file:///renderer.html' },
});
const untrustedEvent = contractInput<IpcMainInvokeEvent>({
  senderFrame: { url: 'https://evil.example' },
});

type Handler = (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown;

function envelope(command: string, payload?: unknown): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: '2026-08-17T00:00:00.000Z',
    command,
    ...(payload === undefined ? {} : { payload }),
  };
}

function createHarness(
  options: {
    confirmDiagnosticsExport?: (preview: DiagnosticPreview) => Promise<boolean>;
    chooseDiagnosticsDirectory?: () => Promise<string | null>;
  } = {},
) {
  const handlers = new Map<string, Handler>();
  const invokeAppDataOperation = vi.fn(
    async (_requestId: string, operation: { operation: string }) => ({
      ok: true as const,
      operation: operation.operation,
      data: { operation: operation.operation },
    }),
  );
  const supervisor = strictTestDouble<CoreSupervisor>('CoreSupervisor', {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 123,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(async () => ({ ok: true as const })),
    invokeAppDataOperation,
  });
  const preferences = {
    displayId: 'display-1',
    boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
    scaleFactor: 1,
    maximized: false,
    workspaceAlignment: 'center' as const,
    uiScalePercent: 100,
    bodyFontSize: 18,
    contentWidth: 'normal' as const,
  };
  const choices = { recent: vi.fn<() => Promise<string | null>>(async () => '/tmp/project') };
  const logger = strictTestDouble<PrivacyLogger>('PrivacyLogger', {
    log: vi.fn(async () => undefined),
  });
  const context = createIpcHandlerContext({
    ipcMain: strictTestDouble<IpcMain>('IpcMain', {
      handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
      removeHandler: vi.fn(),
    }),
    supervisor,
    credentialBroker: strictTestDouble<CredentialBroker>('CredentialBroker', {}),
    rendererUrl: trustedEvent.senderFrame?.url ?? 'file:///renderer.html',
    version: '1.2.3',
    platform: 'linux',
    logger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    chooseRecentLocation: choices.recent,
    chooseProjectCreateParent: vi.fn(),
    chooseProjectToOpen: vi.fn(),
    chooseProjectMoveParent: vi.fn(),
    chooseRecoveryRestoreParent: vi.fn(),
    chooseRecoveryExportDirectory: vi.fn(),
    chooseTextImportFile: vi.fn(),
    chooseTextExportDirectory: vi.fn(),
    confirmDiagnosticsExport: options.confirmDiagnosticsExport,
    chooseDiagnosticsDirectory: options.chooseDiagnosticsDirectory,
  });
  registerAppIpcHandlers(context);
  return { handlers, supervisor, invokeAppDataOperation, choices, logger, preferences };
}

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  raw: unknown,
  event: IpcMainInvokeEvent = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler).toBeTypeOf('function');
  return await handler?.(event, raw);
}

beforeEach(() => {
  vi.clearAllMocks();
  diagnostics.export.mockResolvedValue({
    fileName: 'diagnostics.zip',
    filePath: '/tmp/diagnostics.zip',
  });
});

describe('app IPC handler edge coverage', () => {
  it('covers app info, core status/restart and window preference guards', async () => {
    const harness = createHarness();
    const cases = [
      [IPC_CHANNELS.appGetInfo, APP_COMMANDS.getInfo],
      [IPC_CHANNELS.appGetCoreStatus, APP_COMMANDS.getCoreStatus],
      [IPC_CHANNELS.appRestartCore, APP_COMMANDS.restartCore],
      [IPC_CHANNELS.appGetWindowPreferences, APP_COMMANDS.getWindowPreferences],
    ] as const;
    for (const [channel, command] of cases) {
      await expect(
        call(harness, channel, envelope(command, {}), untrustedEvent),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(call(harness, channel, { requestId })).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(call(harness, channel, envelope(command, {}))).resolves.toMatchObject({
        ok: true,
        requestId,
      });
    }
  });

  it('covers appearance rejection and diagnostic preview/export branches', async () => {
    const harness = createHarness();
    const appearance = envelope(APP_COMMANDS.setAppearancePreferences, {
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
    });
    await expect(
      call(harness, IPC_CHANNELS.appSetAppearancePreferences, appearance, untrustedEvent),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    await expect(
      call(
        harness,
        IPC_CHANNELS.appPreviewDiagnostics,
        envelope(APP_COMMANDS.previewDiagnostics, {}),
      ),
    ).resolves.toMatchObject({ ok: true, requestId });
    await expect(
      call(harness, IPC_CHANNELS.appPreviewDiagnostics, { requestId }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(
        harness,
        IPC_CHANNELS.appPreviewDiagnostics,
        envelope(APP_COMMANDS.previewDiagnostics, {}),
        untrustedEvent,
      ),
    ).resolves.toMatchObject({ ok: false });

    await expect(
      call(
        harness,
        IPC_CHANNELS.appExportDiagnostics,
        envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    const cancelledDirectory = createHarness({
      confirmDiagnosticsExport: async () => true,
      chooseDiagnosticsDirectory: async () => null,
    });
    await expect(
      call(
        cancelledDirectory,
        IPC_CHANNELS.appExportDiagnostics,
        envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_CANCELLED_004' } });

    const success = createHarness({
      confirmDiagnosticsExport: async () => true,
      chooseDiagnosticsDirectory: async () => '/tmp',
    });
    await expect(
      call(
        success,
        IPC_CHANNELS.appExportDiagnostics,
        envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
      ),
    ).resolves.toMatchObject({ ok: true, requestId });

    diagnostics.export.mockRejectedValueOnce(new Error('zip failed'));
    const failure = createHarness({
      confirmDiagnosticsExport: async () => true,
      chooseDiagnosticsDirectory: async () => '/tmp',
    });
    await expect(
      call(
        failure,
        IPC_CHANNELS.appExportDiagnostics,
        envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INTERNAL_999' } });

    await expect(
      call(success, IPC_CHANNELS.appExportDiagnostics, { requestId }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(
        success,
        IPC_CHANNELS.appExportDiagnostics,
        envelope(APP_COMMANDS.exportDiagnostics, { confirmation: true }),
        untrustedEvent,
      ),
    ).resolves.toMatchObject({ ok: false });
  });

  it('covers settings/recent guards, relocation chooser branches and remove success/failure', async () => {
    const harness = createHarness();
    const settingsGet = envelope(APP_COMMANDS.settingsGet, {});
    await expect(
      call(harness, IPC_CHANNELS.settingsGet, settingsGet, untrustedEvent),
    ).resolves.toMatchObject({ ok: false });
    await expect(call(harness, IPC_CHANNELS.settingsGet, { requestId })).resolves.toMatchObject({
      ok: false,
    });
    await expect(call(harness, IPC_CHANNELS.settingsGet, settingsGet)).resolves.toMatchObject({
      ok: true,
    });
    harness.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false as const,
      operation: APP_COMMANDS.settingsGet,
      errorCode: 'DB_READ_FAILED_003',
    });
    await expect(call(harness, IPC_CHANNELS.settingsGet, settingsGet)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DB_READ_FAILED_003' },
    });

    const settingsSet = envelope(APP_COMMANDS.settingsSet, { reduceMotion: true });
    await expect(
      call(harness, IPC_CHANNELS.settingsSet, settingsSet, untrustedEvent),
    ).resolves.toMatchObject({ ok: false });

    await expect(
      call(
        harness,
        IPC_CHANNELS.settingsReset,
        envelope(APP_COMMANDS.settingsReset, {}),
        untrustedEvent,
      ),
    ).resolves.toMatchObject({ ok: false });
    await expect(call(harness, IPC_CHANNELS.settingsReset, { requestId })).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      call(harness, IPC_CHANNELS.settingsReset, envelope(APP_COMMANDS.settingsReset, {})),
    ).resolves.toMatchObject({ ok: true });
    harness.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false as const,
      operation: APP_COMMANDS.settingsReset,
      errorCode: 'DB_WRITE_FAILED_004',
    });
    await expect(
      call(harness, IPC_CHANNELS.settingsReset, envelope(APP_COMMANDS.settingsReset, {})),
    ).resolves.toMatchObject({ ok: false, error: { code: 'DB_WRITE_FAILED_004' } });

    await expect(
      call(
        harness,
        IPC_CHANNELS.projectListRecent,
        envelope(APP_COMMANDS.projectListRecent, {}),
        untrustedEvent,
      ),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(harness, IPC_CHANNELS.projectListRecent, { requestId }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(harness, IPC_CHANNELS.projectListRecent, envelope(APP_COMMANDS.projectListRecent, {})),
    ).resolves.toMatchObject({ ok: true });
    harness.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false as const,
      operation: APP_COMMANDS.projectListRecent,
      errorCode: 'DB_READ_FAILED_003',
    });
    await expect(
      call(harness, IPC_CHANNELS.projectListRecent, envelope(APP_COMMANDS.projectListRecent, {})),
    ).resolves.toMatchObject({ ok: false, error: { code: 'DB_READ_FAILED_003' } });

    const relocate = envelope(APP_COMMANDS.projectRelocateRecent, { projectId });
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, relocate, untrustedEvent),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, { requestId }),
    ).resolves.toMatchObject({ ok: false });
    harness.choices.recent.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, relocate),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INTERNAL_999' } });
    harness.choices.recent.mockResolvedValueOnce(null);
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, relocate),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_CANCELLED_004' } });
    harness.choices.recent.mockResolvedValueOnce('/tmp/new-workspace');
    harness.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false as const,
      operation: APP_COMMANDS.projectRelocateRecent,
      errorCode: 'DB_WRITE_FAILED_004',
    });
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, relocate),
    ).resolves.toMatchObject({ ok: false, error: { code: 'DB_WRITE_FAILED_004' } });
    harness.choices.recent.mockResolvedValueOnce('/tmp/new-workspace-2');
    await expect(
      call(harness, IPC_CHANNELS.projectRelocateRecent, relocate),
    ).resolves.toMatchObject({ ok: true });

    const remove = envelope(APP_COMMANDS.projectRemoveRecent, { projectId });
    await expect(
      call(harness, IPC_CHANNELS.projectRemoveRecent, remove, untrustedEvent),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      call(harness, IPC_CHANNELS.projectRemoveRecent, { requestId }),
    ).resolves.toMatchObject({ ok: false });
    await expect(call(harness, IPC_CHANNELS.projectRemoveRecent, remove)).resolves.toMatchObject({
      ok: true,
    });
    harness.invokeAppDataOperation.mockResolvedValueOnce({
      ok: false as const,
      operation: APP_COMMANDS.projectRemoveRecent,
      errorCode: 'DB_WRITE_FAILED_004',
    });
    await expect(call(harness, IPC_CHANNELS.projectRemoveRecent, remove)).resolves.toMatchObject({
      ok: false,
      error: { code: 'DB_WRITE_FAILED_004' },
    });
  });
});
