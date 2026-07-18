import {
  PROTOCOL_VERSION,
  PROJECT_STRUCTURE_COMMANDS,
  ProjectCreateVolumeCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectPermanentDeleteCommandSchema,
  ProjectSplitChapterCommandSchema,
  ProjectPreviewSplitChapterCommandSchema,
  ProjectUpdateChapterCommandSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
  type ProjectStructure,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import type { CredentialBroker } from '../../apps/desktop/main/src/credential-broker.js';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import type { PrivacyLogger } from '../../apps/desktop/main/src/privacy-logger.js';

const base = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  sentAt: '2026-07-16T12:00:00.000Z',
} as const;
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const volumeId = '99b815c1-19ae-4aa9-b14b-6e1329830c4c';
const chapterId = '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d';
const trashEntryId = '48ee4f14-d049-401a-8f21-991c769b1b86';
const draftId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const logicalBlockId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const planHash = '1'.repeat(64);
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
const structure: ProjectStructure = { projectId, volumes: [] };

describe('project structure IPC contracts', () => {
  it('rejects renderer-supplied authority fields and malformed restore positions', () => {
    const create = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.createVolume,
      payload: { projectId, title: '新卷', placement: { kind: 'end' } },
    };
    expect(ProjectCreateVolumeCommandSchema.safeParse(create).success).toBe(true);
    expect(
      ProjectCreateVolumeCommandSchema.safeParse({
        ...create,
        payload: { ...create.payload, orderKey: '1', id: volumeId, deletedAt: null },
      }).success,
    ).toBe(false);

    const split = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.splitChapter,
      payload: {
        projectId,
        chapterId,
        draftId,
        baseRevision: 3,
        splitAfterLogicalBlockId: logicalBlockId,
        newChapterTitle: '新章',
        planHash,
      },
    };
    expect(ProjectSplitChapterCommandSchema.safeParse(split).success).toBe(true);
    expect(
      ProjectSplitChapterCommandSchema.safeParse({
        ...split,
        payload: { ...split.payload, backupId: trashEntryId, committedRevision: 4 },
      }).success,
    ).toBe(false);

    const permanentDelete = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.permanentDelete,
      payload: {
        projectId,
        trashEntryId,
        planHash,
        confirmationTitle: '待删章节',
      },
    };
    expect(ProjectPermanentDeleteCommandSchema.safeParse(permanentDelete).success).toBe(true);
    expect(
      ProjectPermanentDeleteCommandSchema.safeParse({
        ...permanentDelete,
        payload: { ...permanentDelete.payload, canDelete: true, impact: {} },
      }).success,
    ).toBe(false);

    const update = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.updateChapter,
      payload: {
        projectId,
        chapterId,
        patch: { title: '新标题', targetWordMin: 2_000, targetWordMax: 3_000 },
      },
    };
    expect(ProjectUpdateChapterCommandSchema.safeParse(update).success).toBe(true);
    expect(
      ProjectUpdateChapterCommandSchema.safeParse({
        ...update,
        payload: {
          ...update.payload,
          patch: { ...update.payload.patch, activeDraftId: chapterId },
        },
      }).success,
    ).toBe(false);

    const restore = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry,
      payload: { projectId, trashEntryId, placement: 'original' },
    };
    expect(ProjectRestoreTrashEntryCommandSchema.safeParse(restore).success).toBe(true);
    expect(
      ProjectRestoreTrashEntryCommandSchema.safeParse({
        ...restore,
        payload: { ...restore.payload, originalOrderKey: '-1' },
      }).success,
    ).toBe(false);
  });

  it('validates sender and payload before forwarding named structure operations to Core', async () => {
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
      async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => {
        if (operation.operation === PROJECT_STRUCTURE_COMMANDS.listTrash) {
          return { ok: true, operation: operation.operation, data: { entries: [] } };
        }
        return {
          ok: true,
          operation: operation.operation as typeof PROJECT_STRUCTURE_COMMANDS.createVolume,
          data: structure,
        };
      },
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

    const handler = handlers.get('worldforge:planning:create-volume');
    const command = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.createVolume,
      payload: { projectId, title: '新卷', placement: { kind: 'end' } },
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
        { ...command, payload: { ...command.payload, orderKey: '7' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId: base.requestId, data: structure });
    expect(invokeProjectOperation).toHaveBeenCalledWith(base.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.createVolume,
      input: command.payload,
    });

    const previewHandler = handlers.get('worldforge:planning:preview-split-chapter');
    const previewCommand = {
      ...base,
      command: PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
      payload: {
        projectId,
        chapterId,
        draftId,
        baseRevision: 3,
        splitAfterLogicalBlockId: logicalBlockId,
        newChapterTitle: '新章',
      },
    };
    expect(ProjectPreviewSplitChapterCommandSchema.safeParse(previewCommand).success).toBe(true);
    await previewHandler?.(
      { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
      previewCommand,
    );
    expect(invokeProjectOperation).toHaveBeenLastCalledWith(base.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
      input: previewCommand.payload,
    });
  });
});
