import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  APP_COMMANDS,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  type DiagnosticPreview,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const directories: string[] = [];
const rendererUrl = 'worldforge-app://renderer/index.html';
const preferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};
const command = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  sentAt: '2026-07-28T07:00:00.000Z',
  command: APP_COMMANDS.exportDiagnostics,
  payload: { confirmation: true },
} as const;

function setup(
  confirmDiagnosticsExport: (preview: DiagnosticPreview) => Promise<boolean>,
  chooseDiagnosticsDirectory: () => Promise<string | null>,
) {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    ),
    removeHandler: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  } as unknown as IpcMain;
  const supervisor = {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 123,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(),
    invokeTaskCommand: vi.fn(),
    invokeAppDataOperation: vi.fn(),
    invokeProjectOperation: vi.fn(),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  } as unknown as CoreSupervisor;
  const credentialBroker = {
    store: vi.fn(),
    remove: vi.fn(),
    has: vi.fn(),
  } as unknown as CredentialBroker;

  registerIpcHandlers({
    ipcMain,
    supervisor,
    credentialBroker,
    rendererUrl,
    version: '1.0.0',
    platform: 'test',
    logger: { log: vi.fn() } as unknown as PrivacyLogger,
    getWindowPreferences: () => preferences,
    setAppearancePreferences: vi.fn(async () => preferences),
    confirmDiagnosticsExport,
    chooseDiagnosticsDirectory,
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });

  const handler = handlers.get(IPC_CHANNELS.appExportDiagnostics);
  if (!handler) throw new Error('Diagnostic export handler was not registered');
  return handler;
}

const trustedEvent = {
  senderFrame: { url: rendererUrl },
} as unknown as IpcMainInvokeEvent;

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe('trusted diagnostic IPC confirmation', () => {
  it('stops before directory selection when Main confirmation is denied', async () => {
    const confirm = vi.fn(async () => false);
    const chooseDirectory = vi.fn(async () => '/should/not/be/used');
    const handler = setup(confirm, chooseDirectory);

    await expect(handler(trustedEvent, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });
    expect(confirm).toHaveBeenCalledOnce();
    expect(chooseDirectory).not.toHaveBeenCalled();
  });

  it('exports the exact confirmed allowlist preview after Main approval', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'worldforge-diagnostic-ipc-'));
    directories.push(directory);
    let confirmedPreview: DiagnosticPreview | null = null;
    const handler = setup(
      vi.fn(async (preview) => {
        confirmedPreview = preview;
        return true;
      }),
      vi.fn(async () => directory),
    );

    await expect(handler(trustedEvent, command)).resolves.toMatchObject({ ok: true });
    expect(confirmedPreview?.manifest.contentIncluded).toBe(false);
    expect(confirmedPreview?.manifest.credentialIncluded).toBe(false);
    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const content = await readFile(join(directory, files[0]!), 'utf8');
    expect(content).toContain('project-content');
    expect(content).not.toContain('workspacePath');
    expect(content).not.toContain('credentialRef');
  });
});
