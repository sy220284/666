import { randomUUID } from 'node:crypto';

import {
  SCENE_BEAT_COMMANDS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const preferences = {
  workspaceAlignment: 'center' as const,
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal' as const,
  displayId: 'test',
  boundsDip: { x: 0, y: 0, width: 1200, height: 800 },
  scaleFactor: 1,
  maximized: false,
};

describe('M3-02 SceneBeat IPC boundary', () => {
  it('rejects untrusted senders and forwards a validated command only', async () => {
    const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
    const ipcMain = {
      handle: vi.fn(
        (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) =>
          handlers.set(channel, handler),
      ),
      removeHandler: vi.fn(),
      on: vi.fn(),
      removeListener: vi.fn(),
    } as unknown as IpcMain;
    const projectId = randomUUID();
    const chapterId = randomUUID();
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, _operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
        ok: true,
        operation: SCENE_BEAT_COMMANDS.createSceneBeat,
        data: { projectId, chapterId, beats: [], deletedBeats: [] },
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
    const handler = handlers.get('worldforge:planning:create-scene-beat');
    const requestId = randomUUID();
    const command = {
      protocolVersion: 1,
      requestId,
      sentAt: new Date().toISOString(),
      command: SCENE_BEAT_COMMANDS.createSceneBeat,
      payload: {
        projectId,
        chapterId,
        plotNodeId: null,
        title: '场景节拍',
        goal: '',
        coreConflict: '',
        expectedResult: '',
        beatType: 'development',
        wordTargetPercent: 20,
        required: false,
        characterIds: [],
        locationIds: [],
        placement: { kind: 'end' },
      },
    };
    await expect(
      handler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: true, requestId });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: SCENE_BEAT_COMMANDS.createSceneBeat,
      input: command.payload,
    });
  });
});
