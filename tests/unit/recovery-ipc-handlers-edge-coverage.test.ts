import {
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  RECOVERY_COMMANDS,
  TEXT_IO_COMMANDS,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { createIpcHandlerContext } from '../../apps/desktop/main/src/handler-guard.js';
import { registerRecoveryIpcHandlers } from '../../apps/desktop/main/src/recovery-ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const backupId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const planId = '55555555-5555-4555-8555-555555555555';
const planChapterId = '66666666-6666-4666-8666-666666666666';
const trustedEvent = contractInput<IpcMainInvokeEvent>({
  senderFrame: { url: 'file:///renderer.html' },
});
const untrustedEvent = contractInput<IpcMainInvokeEvent>({
  senderFrame: { url: 'https://evil.example' },
});

type Handler = (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown;

function envelope(command: string, payload: unknown): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: '2026-08-17T00:00:00.000Z',
    command,
    payload,
  };
}

function createHarness() {
  const handlers = new Map<string, Handler>();
  const invokeProjectOperation = vi.fn(
    async (_requestId: string, operation: { operation: string }) => ({
      ok: true as const,
      operation: operation.operation,
      data: { operation: operation.operation },
    }),
  );
  const choices = {
    restore: vi.fn<() => Promise<string | null>>(async () => '/tmp/restored-parent'),
    recoveryExport: vi.fn<() => Promise<string | null>>(async () => '/tmp/recovery-export'),
    importFile: vi.fn<() => Promise<string | null>>(async () => '/tmp/import.md'),
    textExport: vi.fn<() => Promise<string | null>>(async () => '/tmp/text-export'),
  };
  const ipcMain = strictTestDouble<IpcMain>('IpcMain', {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn(),
  });
  const context = createIpcHandlerContext({
    ipcMain,
    supervisor: strictTestDouble<CoreSupervisor>('CoreSupervisor', {
      invokeProjectOperation,
    }),
    credentialBroker: strictTestDouble<CredentialBroker>('CredentialBroker', {}),
    rendererUrl: trustedEvent.senderFrame?.url ?? 'file:///renderer.html',
    version: '1.0.0',
    platform: 'linux',
    logger: strictTestDouble<PrivacyLogger>('PrivacyLogger', { log: vi.fn() }),
    getWindowPreferences: vi.fn(),
    setAppearancePreferences: vi.fn(),
    chooseRecentLocation: vi.fn(),
    chooseProjectCreateParent: vi.fn(),
    chooseProjectToOpen: vi.fn(),
    chooseProjectMoveParent: vi.fn(),
    chooseRecoveryRestoreParent: choices.restore,
    chooseRecoveryExportDirectory: choices.recoveryExport,
    chooseTextImportFile: choices.importFile,
    chooseTextExportDirectory: choices.textExport,
  });
  registerRecoveryIpcHandlers(context);
  return { handlers, invokeProjectOperation, choices };
}

async function call(
  harness: ReturnType<typeof createHarness>,
  channel: string,
  raw: unknown,
  event: IpcMainInvokeEvent = trustedEvent,
): Promise<unknown> {
  const handler = harness.handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  return await handler?.(event, raw);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('recovery IPC handler edge coverage', () => {
  it('covers manual checkpoint and overview validation branches', async () => {
    const harness = createHarness();
    const manual = envelope(RECOVERY_COMMANDS.createCheckpoint, {
      projectId,
      operation: 'manual-protection',
    });
    await expect(call(harness, IPC_CHANNELS.createCheckpoint, manual)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: RECOVERY_COMMANDS.createCheckpoint,
      input: { projectId, operation: 'manual-protection' },
    });

    await expect(
      call(
        harness,
        IPC_CHANNELS.createCheckpoint,
        envelope(RECOVERY_COMMANDS.createCheckpoint, { projectId, operation: 'migration' }),
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });

    await expect(
      call(
        harness,
        IPC_CHANNELS.getOverview,
        envelope(RECOVERY_COMMANDS.getOverview, { projectId }),
      ),
    ).resolves.toMatchObject({ ok: true, requestId });
    await expect(
      call(harness, IPC_CHANNELS.getOverview, { requestId }, untrustedEvent),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
  });

  it('covers restore chooser failure, cancellation and successful dispatch', async () => {
    const harness = createHarness();
    const command = envelope(RECOVERY_COMMANDS.restoreCheckpoint, { projectId, backupId });

    await expect(
      call(harness, IPC_CHANNELS.restoreCheckpoint, { requestId }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    harness.choices.restore.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(call(harness, IPC_CHANNELS.restoreCheckpoint, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    harness.choices.restore.mockResolvedValueOnce(null);
    await expect(call(harness, IPC_CHANNELS.restoreCheckpoint, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    harness.choices.restore.mockResolvedValueOnce('/tmp/restore-here');
    await expect(call(harness, IPC_CHANNELS.restoreCheckpoint, command)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: RECOVERY_COMMANDS.restoreCheckpoint,
      input: { projectId, backupId },
      targetParentDirectory: '/tmp/restore-here',
    });
  });

  it('covers recovery export chooser failure, cancellation and successful dispatch', async () => {
    const harness = createHarness();
    const command = envelope(RECOVERY_COMMANDS.exportVersion, { projectId, versionId });

    await expect(call(harness, IPC_CHANNELS.exportVersion, { requestId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    harness.choices.recoveryExport.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(call(harness, IPC_CHANNELS.exportVersion, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    harness.choices.recoveryExport.mockResolvedValueOnce(null);
    await expect(call(harness, IPC_CHANNELS.exportVersion, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    harness.choices.recoveryExport.mockResolvedValueOnce('/tmp/recovery-out');
    await expect(call(harness, IPC_CHANNELS.exportVersion, command)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: RECOVERY_COMMANDS.exportVersion,
      input: { projectId, versionId },
      targetDirectory: '/tmp/recovery-out',
    });
  });

  it('covers text import preview chooser branches and commit/list dispatch', async () => {
    const harness = createHarness();
    const preview = envelope(TEXT_IO_COMMANDS.previewImport, { projectId, encoding: 'utf-8' });

    await expect(call(harness, IPC_CHANNELS.previewImport, { requestId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    harness.choices.importFile.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(call(harness, IPC_CHANNELS.previewImport, preview)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    harness.choices.importFile.mockResolvedValueOnce(null);
    await expect(call(harness, IPC_CHANNELS.previewImport, preview)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    harness.choices.importFile.mockResolvedValueOnce('/tmp/source.md');
    await expect(call(harness, IPC_CHANNELS.previewImport, preview)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: TEXT_IO_COMMANDS.previewImport,
      input: { projectId, encoding: 'utf-8' },
      sourcePath: '/tmp/source.md',
    });

    const commit = envelope(TEXT_IO_COMMANDS.commitImport, {
      projectId,
      planId,
      volumeTitle: '第一卷',
      chapters: [
        {
          planChapterId,
          title: '第一章',
          blocks: [{ blockType: 'paragraph', text: '正文' }],
        },
      ],
    });
    await expect(call(harness, IPC_CHANNELS.commitImport, commit)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: TEXT_IO_COMMANDS.commitImport,
      input: contractInput<Record<string, unknown>>(commit.payload),
    });

    await expect(
      call(
        harness,
        IPC_CHANNELS.listExportVersions,
        envelope(TEXT_IO_COMMANDS.listExportVersions, { projectId }),
      ),
    ).resolves.toMatchObject({ ok: true, requestId });
  });

  it('covers untrusted and schema-invalid guards across recovery and text-I/O handlers', async () => {
    const harness = createHarness();
    const validCases: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      [
        IPC_CHANNELS.createCheckpoint,
        envelope(RECOVERY_COMMANDS.createCheckpoint, {
          projectId,
          operation: 'manual-protection',
        }),
      ],
      [
        IPC_CHANNELS.restoreCheckpoint,
        envelope(RECOVERY_COMMANDS.restoreCheckpoint, { projectId, backupId }),
      ],
      [
        IPC_CHANNELS.exportVersion,
        envelope(RECOVERY_COMMANDS.exportVersion, { projectId, versionId }),
      ],
      [
        IPC_CHANNELS.previewImport,
        envelope(TEXT_IO_COMMANDS.previewImport, { projectId, encoding: 'utf-8' }),
      ],
      [
        IPC_CHANNELS.commitImport,
        envelope(TEXT_IO_COMMANDS.commitImport, {
          projectId,
          planId,
          volumeTitle: '第一卷',
          chapters: [
            {
              planChapterId,
              title: '第一章',
              blocks: [{ blockType: 'paragraph', text: '正文' }],
            },
          ],
        }),
      ],
      [
        IPC_CHANNELS.listExportVersions,
        envelope(TEXT_IO_COMMANDS.listExportVersions, { projectId }),
      ],
      [
        IPC_CHANNELS.exportVersions,
        envelope(TEXT_IO_COMMANDS.exportVersions, {
          projectId,
          versionIds: [versionId],
          format: 'markdown',
          fileName: 'export.md',
        }),
      ],
    ];

    for (const [channel, raw] of validCases) {
      await expect(call(harness, channel, raw, untrustedEvent)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
    }

    const invalidChannels = [
      IPC_CHANNELS.createCheckpoint,
      IPC_CHANNELS.getOverview,
      IPC_CHANNELS.commitImport,
      IPC_CHANNELS.listExportVersions,
    ];
    for (const channel of invalidChannels) {
      await expect(call(harness, channel, { requestId })).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
    }
  });

  it('covers text export chooser failure, cancellation and successful dispatch', async () => {
    const harness = createHarness();
    const command = envelope(TEXT_IO_COMMANDS.exportVersions, {
      projectId,
      versionIds: [versionId],
      format: 'markdown',
      fileName: 'export.md',
    });

    await expect(call(harness, IPC_CHANNELS.exportVersions, { requestId })).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });

    harness.choices.textExport.mockRejectedValueOnce(new Error('dialog failed'));
    await expect(call(harness, IPC_CHANNELS.exportVersions, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999' },
    });

    harness.choices.textExport.mockResolvedValueOnce(null);
    await expect(call(harness, IPC_CHANNELS.exportVersions, command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    harness.choices.textExport.mockResolvedValueOnce('/tmp/text-out');
    await expect(call(harness, IPC_CHANNELS.exportVersions, command)).resolves.toMatchObject({
      ok: true,
      requestId,
    });
    expect(harness.invokeProjectOperation).toHaveBeenLastCalledWith(requestId, {
      operation: TEXT_IO_COMMANDS.exportVersions,
      input: {
        projectId,
        versionIds: [versionId],
        format: 'markdown',
        fileName: 'export.md',
      },
      targetDirectory: '/tmp/text-out',
    });
  });
});
