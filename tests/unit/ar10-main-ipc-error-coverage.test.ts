import { describe, expect, it, vi } from 'vitest';

import {
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  PROJECT_STRUCTURE_COMMANDS,
} from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };
const untrustedEvent = { senderFrame: { url: 'https://untrusted.invalid' } };

type HandlerOptions = Parameters<typeof registerIpcHandlers>[0];
type Handler = (event: unknown, raw: unknown) => unknown;

function envelope(command: string, payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    command,
    payload,
    sentAt: '2026-08-02T00:00:00.000Z',
  };
}

function createHandlers(): ReadonlyMap<string, Handler> {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  };
  const supervisor = {
    getStatus: vi.fn(() => ({
      status: 'healthy',
      pid: 1,
      restartCount: 0,
      lastErrorCode: null,
      diagnosticId: null,
    })),
    restart: vi.fn(async () => ({ ok: true })),
    invokeAppDataOperation: vi.fn(),
    invokeProjectOperation: vi.fn(),
    invokeTaskCommand: vi.fn(),
    attachTaskPort: vi.fn(() => ({ ok: true })),
  };
  registerIpcHandlers({
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
      contractInput<Partial<HandlerOptions['credentialBroker']>>({
        store: vi.fn(),
        remove: vi.fn(),
        has: vi.fn(),
      }),
    ),
    rendererUrl: trustedEvent.senderFrame.url,
    version: '1.0.0',
    platform: 'test',
    logger: strictTestDouble(
      'PrivacyLogger',
      contractInput<Partial<HandlerOptions['logger']>>({ log: vi.fn(async () => undefined) }),
    ),
    getWindowPreferences: () => ({
      workspaceAlignment: 'center',
      uiScalePercent: 100,
      bodyFontSize: 18,
      contentWidth: 'normal',
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    }),
    setAppearancePreferences: vi.fn(async (preferences) => ({
      ...preferences,
      displayId: 'primary',
      boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
      scaleFactor: 1,
      maximized: false,
    })),
    chooseRecentLocation: vi.fn(async () => null),
    chooseProjectCreateParent: vi.fn(async () => null),
    chooseProjectToOpen: vi.fn(async () => null),
    chooseProjectMoveParent: vi.fn(async () => null),
    chooseRecoveryRestoreParent: vi.fn(async () => null),
    chooseRecoveryExportDirectory: vi.fn(async () => null),
    chooseTextImportFile: vi.fn(async () => null),
    chooseTextExportDirectory: vi.fn(async () => null),
  });
  return handlers;
}

async function expectInvalid(
  handlers: ReadonlyMap<string, Handler>,
  channel: string,
  raw: unknown,
  event: unknown,
): Promise<void> {
  const handler = handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  await expect(handler?.(event, raw)).resolves.toMatchObject({
    ok: false,
    error: { code: 'COMMON_INVALID_INPUT_001' },
  });
}

const structureCases = [
  [IPC_CHANNELS.listStructure, PROJECT_STRUCTURE_COMMANDS.listStructure],
  [IPC_CHANNELS.createVolume, PROJECT_STRUCTURE_COMMANDS.createVolume],
  [IPC_CHANNELS.updateVolume, PROJECT_STRUCTURE_COMMANDS.updateVolume],
  [IPC_CHANNELS.moveVolume, PROJECT_STRUCTURE_COMMANDS.moveVolume],
  [IPC_CHANNELS.deleteVolume, PROJECT_STRUCTURE_COMMANDS.deleteVolume],
  [IPC_CHANNELS.createChapter, PROJECT_STRUCTURE_COMMANDS.createChapter],
  [IPC_CHANNELS.updateChapter, PROJECT_STRUCTURE_COMMANDS.updateChapter],
  [IPC_CHANNELS.moveChapter, PROJECT_STRUCTURE_COMMANDS.moveChapter],
  [IPC_CHANNELS.deleteChapter, PROJECT_STRUCTURE_COMMANDS.deleteChapter],
  [IPC_CHANNELS.listTrash, PROJECT_STRUCTURE_COMMANDS.listTrash],
  [IPC_CHANNELS.restoreTrashEntry, PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry],
  [IPC_CHANNELS.previewPermanentDelete, PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete],
  [IPC_CHANNELS.permanentDelete, PROJECT_STRUCTURE_COMMANDS.permanentDelete],
  [IPC_CHANNELS.previewSplitChapter, PROJECT_STRUCTURE_COMMANDS.previewSplitChapter],
  [IPC_CHANNELS.splitChapter, PROJECT_STRUCTURE_COMMANDS.splitChapter],
  [IPC_CHANNELS.previewMergeChapters, PROJECT_STRUCTURE_COMMANDS.previewMergeChapters],
  [IPC_CHANNELS.mergeChapters, PROJECT_STRUCTURE_COMMANDS.mergeChapters],
  [IPC_CHANNELS.previewMoveBlocks, PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks],
  [IPC_CHANNELS.moveBlocks, PROJECT_STRUCTURE_COMMANDS.moveBlocks],
] as const;

const invalidPayloadCases = structureCases.slice(1, 11);

describe('AR-10 Main IPC rejection coverage', () => {
  it('rejects untrusted senders independently for every Structure handler', async () => {
    const handlers = createHandlers();
    for (const [channel, command] of structureCases) {
      await expectInvalid(handlers, channel, envelope(command, {}), untrustedEvent);
    }
  });

  it('rejects malformed payloads independently after trusted-source validation', async () => {
    const handlers = createHandlers();
    for (const [channel, command] of invalidPayloadCases) {
      await expectInvalid(handlers, channel, envelope(command, {}), trustedEvent);
    }
  });
});
