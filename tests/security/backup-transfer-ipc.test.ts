import { randomUUID } from 'node:crypto';

import {
  RECOVERY_COMMANDS,
  RECOVERY_IPC_CHANNELS,
  RecoveryCleanupApplyCommandSchema,
  RecoveryCleanupPreviewCommandSchema,
  RecoveryDailyBackupCommandSchema,
  RecoveryNamedSnapshotCommandSchema,
  RecoveryPolicyUpdateCommandSchema,
  RecoveryProtectionCommandSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;
const untrustedEvent = {
  senderFrame: { url: 'https://attacker.invalid' },
} as unknown as IpcMainInvokeEvent;
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

describe('M4-04 backup and transfer IPC authority boundary', () => {
  it('strictly validates six backup-center commands and blocks forged major checkpoints', async () => {
    const handlers = new Map<
      string,
      (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown
    >();
    const ipcMain = {
      handle: vi.fn(
        (
          channel: string,
          handler: (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown> | unknown,
        ) => handlers.set(channel, handler),
      ),
      removeHandler: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
        ok: true,
        operation: operation.operation,
        data: {},
      }),
    );
    registerIpcHandlers({
      ipcMain,
      supervisor: {
        getStatus: vi.fn(),
        restart: vi.fn(),
        invokeTaskCommand: vi.fn(),
        invokeAppDataOperation: vi.fn(),
        invokeProjectOperation,
        attachTaskPort: vi.fn(() => ({ ok: true })),
      } as unknown as CoreSupervisor,
      credentialBroker: {
        store: vi.fn(),
        remove: vi.fn(),
        has: vi.fn(),
      } as unknown as CredentialBroker,
      rendererUrl: 'file:///trusted/index.html',
      version: '0.1.0',
      platform: 'test',
      logger: { log: vi.fn() } as unknown as PrivacyLogger,
      getWindowPreferences: () => preferences,
      setAppearancePreferences: vi.fn(async () => preferences),
      chooseRecentLocation: vi.fn(async () => null),
      chooseProjectCreateParent: vi.fn(async () => null),
      chooseProjectToOpen: vi.fn(async () => null),
      chooseProjectMoveParent: vi.fn(async () => null),
      chooseRecoveryRestoreParent: vi.fn(async () => null),
      chooseRecoveryExportDirectory: vi.fn(async () => null),
      chooseTextImportFile: vi.fn(async () => null),
      chooseTextExportDirectory: vi.fn(async () => null),
    });

    const projectId = randomUUID();
    const backupId = randomUUID();
    const cases = [
      {
        schema: RecoveryDailyBackupCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.createDailyBackup,
        command: RECOVERY_COMMANDS.createDailyBackup,
        payload: { projectId },
      },
      {
        schema: RecoveryNamedSnapshotCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.createNamedSnapshot,
        command: RECOVERY_COMMANDS.createNamedSnapshot,
        payload: {
          projectId,
          authority: 'author',
          name: '投稿前',
          note: '明确保留',
        },
      },
      {
        schema: RecoveryPolicyUpdateCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.updatePolicy,
        command: RECOVERY_COMMANDS.updatePolicy,
        payload: {
          projectId,
          authority: 'author',
          dailyRetentionCount: 14,
          majorRetentionCount: 30,
          majorRetentionDays: 90,
          quotaBytes: 5 * 1024 * 1024 * 1024,
        },
      },
      {
        schema: RecoveryProtectionCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.setProtection,
        command: RECOVERY_COMMANDS.setProtection,
        payload: {
          projectId,
          backupId,
          authority: 'author',
          protected: false,
          confirmationBackupId: backupId,
        },
      },
      {
        schema: RecoveryCleanupPreviewCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.previewCleanup,
        command: RECOVERY_COMMANDS.previewCleanup,
        payload: { projectId },
      },
      {
        schema: RecoveryCleanupApplyCommandSchema,
        channel: RECOVERY_IPC_CHANNELS.applyCleanup,
        command: RECOVERY_COMMANDS.applyCleanup,
        payload: {
          projectId,
          authority: 'author',
          planHash: 'a'.repeat(64),
        },
      },
    ] as const;

    for (const item of cases) {
      const envelope = {
        protocolVersion: 1,
        requestId: randomUUID(),
        sentAt: '2026-07-26T11:00:00.000Z',
        command: item.command,
        payload: item.payload,
      };
      expect(item.schema.safeParse(envelope).success).toBe(true);
      const handler = handlers.get(item.channel);
      const callsBefore = invokeProjectOperation.mock.calls.length;
      await expect(handler?.(untrustedEvent, envelope)).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      await expect(
        handler?.(trustedEvent, { ...envelope, payload: { ...item.payload, forged: true } }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: 'COMMON_INVALID_INPUT_001' },
      });
      expect(invokeProjectOperation).toHaveBeenCalledTimes(callsBefore);
      await expect(handler?.(trustedEvent, envelope)).resolves.toMatchObject({ ok: true });
    }

    const legacyCheckpoint = handlers.get(RECOVERY_IPC_CHANNELS.createCheckpoint);
    await expect(
      legacyCheckpoint?.(trustedEvent, {
        protocolVersion: 1,
        requestId: randomUUID(),
        sentAt: '2026-07-26T11:00:00.000Z',
        command: RECOVERY_COMMANDS.createCheckpoint,
        payload: { projectId, operation: 'migration' },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
  });
});
