import {
  DRAFT_COMMANDS,
  DRAFT_IPC_CHANNELS,
  DraftApplyPatchCommandSchema,
  DraftOpenCommandSchema,
  PROTOCOL_VERSION,
  type CoreProjectOperation,
  type CoreProjectResult,
  type DraftDocument,
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
const chapterId = '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d';
const draftId = '48ee4f14-d049-401a-8f21-991c769b1b86';
const logicalBlockId = 'd60c2f63-7f2c-4605-bf2d-bf8cd433bca6';
const contentHash = '1'.repeat(64);
const command = {
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt: '2026-07-16T14:00:00.000Z',
  command: DRAFT_COMMANDS.applyPatch,
  payload: {
    projectId,
    chapterId,
    draftId,
    baseRevision: 0,
    operations: [
      {
        type: 'update',
        logicalBlockId,
        expectedHash: contentHash,
        content: '正文更新',
      },
    ],
  },
} as const;
const document: DraftDocument = {
  projectId,
  chapterId,
  draftId,
  status: 'active',
  revision: 1,
  blocks: [
    {
      logicalBlockId,
      orderKey: '1024',
      blockType: 'paragraph',
      text: '正文更新',
      attributes: {},
      source: 'manual',
      locked: false,
      contentHash: '2'.repeat(64),
    },
  ],
};
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

describe('Draft IPC authority boundary', () => {
  it('accepts strict Patch fields and rejects renderer-supplied authority fields', () => {
    expect(DRAFT_COMMANDS.openDraft).toBe('draft.get');
    expect(DRAFT_COMMANDS.applyPatch).toBe('draft.applyPatch');
    expect(DRAFT_IPC_CHANNELS.applyPatch).toBe('worldforge:draft:apply-patch');
    expect(
      DraftOpenCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        sentAt: command.sentAt,
        command: DRAFT_COMMANDS.openDraft,
        payload: { projectId, chapterId },
      }).success,
    ).toBe(true);
    expect(DraftApplyPatchCommandSchema.safeParse(command).success).toBe(true);

    for (const authority of [
      { orderKey: '1' },
      { source: 'ai' },
      { locked: true },
      { revision: 7 },
    ]) {
      expect(
        DraftApplyPatchCommandSchema.safeParse({
          ...command,
          payload: {
            ...command.payload,
            operations: [{ ...command.payload.operations[0], ...authority }],
          },
        }).success,
      ).toBe(false);
    }
    expect(
      DraftApplyPatchCommandSchema.safeParse({
        ...command,
        payload: {
          ...command.payload,
          operations: [{ ...command.payload.operations[0], expectedHash: undefined }],
        },
      }).success,
    ).toBe(false);
  });

  it('validates origin and strict payload before forwarding the Patch operation', async () => {
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
        operation: operation.operation as typeof DRAFT_COMMANDS.applyPatch,
        data: document,
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
    });

    const handler = handlers.get(DRAFT_IPC_CHANNELS.applyPatch);
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
        {
          ...command,
          payload: {
            ...command.payload,
            operations: [{ ...command.payload.operations[0], orderKey: '9' }],
          },
        },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId, data: document });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: DRAFT_COMMANDS.applyPatch,
      input: command.payload,
    });

    invokeProjectOperation.mockResolvedValueOnce({
      ok: false,
      operation: DRAFT_COMMANDS.applyPatch,
      errorCode: 'DRAFT_BLOCK_LOCKED_003',
      details: {
        lockConflict: {
          conflicts: [{ kind: 'modified', logicalBlockId }],
          skippedOperationCount: 1,
        },
      },
    });
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: {
        code: 'DRAFT_BLOCK_LOCKED_003',
        details: {
          lockConflict: {
            conflicts: [{ kind: 'modified', logicalBlockId }],
            skippedOperationCount: 1,
          },
        },
      },
    });
  });
});
