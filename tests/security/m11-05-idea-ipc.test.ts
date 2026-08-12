import {
  IDEA_CAPSULE_BRIDGE_COMMAND,
  IDEA_CAPSULE_IPC_CHANNELS,
  IdeaOperationCommandSchema,
  PROTOCOL_VERSION,
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

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const preferences: WindowPreferences = {
  displayId: 'display-1',
  boundsDip: { x: 0, y: 0, width: 1_280, height: 800 },
  scaleFactor: 1,
  maximized: false,
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
};

function listCommand() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    sentAt: '2026-08-12T09:50:00.000Z',
    command: IDEA_CAPSULE_BRIDGE_COMMAND,
    payload: {
      operation: 'idea.list' as const,
      input: { projectId, status: null, limit: 50, cursor: null },
    },
  };
}

describe('M11-05 Idea Capsule IPC security boundary', () => {
  it('rejects renderer supplied authority and unknown fields at the strict contract', () => {
    const command = listCommand();
    expect(IdeaOperationCommandSchema.safeParse(command).success).toBe(true);
    expect(
      IdeaOperationCommandSchema.safeParse({
        ...command,
        payload: {
          operation: 'idea.create',
          input: {
            projectId,
            ideaKind: 'plot',
            title: '非法字段测试',
            summary: '摘要',
            content: '内容',
            divergenceLevel: 'safe',
            depthLevel: 'spark',
            sourceContext: { scopeType: 'project', scopeId: projectId, chapterId: null },
            authority: 'author',
          },
        },
      }).success,
    ).toBe(false);
  });

  it('checks the trusted renderer origin before forwarding the named Project Operation', async () => {
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
    const invokeProjectOperation = vi.fn(
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
        ok: true,
        operation: operation.operation as 'idea.list',
        data: { projectId, ideas: [], nextCursor: null },
      }),
    );
    const supervisor = {
      getStatus: vi.fn(),
      restart: vi.fn(),
      invokeTaskCommand: vi.fn(),
      invokeAppDataOperation: vi.fn(),
      invokeProjectOperation,
      attachTaskPort: vi.fn(() => ({ ok: true })),
    } as unknown as CoreSupervisor;

    registerIpcHandlers({
      ipcMain,
      supervisor,
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

    const handler = handlers.get(IDEA_CAPSULE_IPC_CHANNELS.operation);
    const command = listCommand();
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
    ).resolves.toEqual({
      ok: true,
      requestId,
      data: { projectId, ideas: [], nextCursor: null },
    });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, command.payload);
  });
});
