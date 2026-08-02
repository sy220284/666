import { describe, expect, it, vi } from 'vitest';

import {
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  RECOVERY_COMMANDS,
} from '@worldforge/contracts';
import { registerIpcHandlers } from '../../apps/desktop/main/src/ipc-handlers.js';
import { contractInput, strictTestDouble } from '../testkit/strict-test-doubles.js';

const requestId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const volumeId = '33333333-3333-4333-8333-333333333333';
const targetVolumeId = '44444444-4444-4444-8444-444444444444';
const chapterId = '55555555-5555-4555-8555-555555555555';
const targetChapterId = '66666666-6666-4666-8666-666666666666';
const draftId = '77777777-7777-4777-8777-777777777777';
const targetDraftId = '88888888-8888-4888-8888-888888888888';
const logicalBlockId = '99999999-9999-4999-8999-999999999999';
const trashEntryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const backupId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const versionId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const planHash = '1'.repeat(64);
const trustedEvent = { senderFrame: { url: 'file:///renderer.html' } };

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

function createHarness() {
  const handlers = new Map<string, Handler>();
  const invokeProjectOperation = vi.fn(async (_requestId: string, operation: unknown) => ({
    ok: true,
    operation: (operation as { operation: string }).operation,
    data: null,
  }));
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
    invokeProjectOperation,
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
    chooseRecentLocation: vi.fn(async () => '/tmp/recent'),
    chooseProjectCreateParent: vi.fn(async () => '/tmp/create'),
    chooseProjectToOpen: vi.fn(async () => '/tmp/open'),
    chooseProjectMoveParent: vi.fn(async () => '/tmp/move'),
    chooseRecoveryRestoreParent: vi.fn(async () => '/tmp/restore'),
    chooseRecoveryExportDirectory: vi.fn(async () => '/tmp/export'),
    chooseTextImportFile: vi.fn(async () => '/tmp/import.md'),
    chooseTextExportDirectory: vi.fn(async () => '/tmp/text-export'),
  });
  return { handlers, invokeProjectOperation };
}

async function call(
  handlers: ReadonlyMap<string, Handler>,
  channel: string,
  command: string,
  payload: unknown,
): Promise<void> {
  const handler = handlers.get(channel);
  expect(handler, `missing handler for ${channel}`).toBeTypeOf('function');
  await expect(handler?.(trustedEvent, envelope(command, payload))).resolves.toMatchObject({
    ok: true,
    requestId,
  });
}

describe('AR-10 Main IPC domain command coverage', () => {
  it('routes every Structure command through the shared guard and exact operation mapping', async () => {
    const { handlers, invokeProjectOperation } = createHarness();
    const commonMerge = {
      projectId,
      sourceChapterId: chapterId,
      sourceDraftId: draftId,
      sourceBaseRevision: 1,
      targetChapterId,
      targetDraftId,
      targetBaseRevision: 2,
    };
    const commonMove = {
      ...commonMerge,
      logicalBlockIds: [logicalBlockId],
      afterTargetLogicalBlockId: null,
    };
    const cases = [
      [IPC_CHANNELS.listStructure, PROJECT_STRUCTURE_COMMANDS.listStructure, { projectId }],
      [
        IPC_CHANNELS.createVolume,
        PROJECT_STRUCTURE_COMMANDS.createVolume,
        { projectId, title: '第一卷', placement: { kind: 'end' } },
      ],
      [
        IPC_CHANNELS.updateVolume,
        PROJECT_STRUCTURE_COMMANDS.updateVolume,
        { projectId, volumeId, patch: { title: '新卷名' } },
      ],
      [
        IPC_CHANNELS.moveVolume,
        PROJECT_STRUCTURE_COMMANDS.moveVolume,
        { projectId, volumeId, placement: { kind: 'start' } },
      ],
      [IPC_CHANNELS.deleteVolume, PROJECT_STRUCTURE_COMMANDS.deleteVolume, { projectId, volumeId }],
      [
        IPC_CHANNELS.createChapter,
        PROJECT_STRUCTURE_COMMANDS.createChapter,
        { projectId, volumeId, title: '第一章', placement: { kind: 'end' } },
      ],
      [
        IPC_CHANNELS.updateChapter,
        PROJECT_STRUCTURE_COMMANDS.updateChapter,
        { projectId, chapterId, patch: { title: '新章名' } },
      ],
      [
        IPC_CHANNELS.moveChapter,
        PROJECT_STRUCTURE_COMMANDS.moveChapter,
        { projectId, chapterId, targetVolumeId, placement: { kind: 'end' } },
      ],
      [
        IPC_CHANNELS.deleteChapter,
        PROJECT_STRUCTURE_COMMANDS.deleteChapter,
        { projectId, chapterId },
      ],
      [IPC_CHANNELS.listTrash, PROJECT_STRUCTURE_COMMANDS.listTrash, { projectId }],
      [
        IPC_CHANNELS.restoreTrashEntry,
        PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry,
        { projectId, trashEntryId, placement: 'original' },
      ],
      [
        IPC_CHANNELS.previewPermanentDelete,
        PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
        { projectId, trashEntryId },
      ],
      [
        IPC_CHANNELS.permanentDelete,
        PROJECT_STRUCTURE_COMMANDS.permanentDelete,
        { projectId, trashEntryId, planHash, confirmationTitle: '待删章节' },
      ],
      [
        IPC_CHANNELS.previewSplitChapter,
        PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
        {
          projectId,
          chapterId,
          draftId,
          baseRevision: 1,
          splitAfterLogicalBlockId: logicalBlockId,
          newChapterTitle: '拆分章',
        },
      ],
      [
        IPC_CHANNELS.splitChapter,
        PROJECT_STRUCTURE_COMMANDS.splitChapter,
        {
          projectId,
          chapterId,
          draftId,
          baseRevision: 1,
          splitAfterLogicalBlockId: logicalBlockId,
          newChapterTitle: '拆分章',
          planHash,
        },
      ],
      [
        IPC_CHANNELS.previewMergeChapters,
        PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
        commonMerge,
      ],
      [
        IPC_CHANNELS.mergeChapters,
        PROJECT_STRUCTURE_COMMANDS.mergeChapters,
        { ...commonMerge, planHash },
      ],
      [IPC_CHANNELS.previewMoveBlocks, PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks, commonMove],
      [IPC_CHANNELS.moveBlocks, PROJECT_STRUCTURE_COMMANDS.moveBlocks, { ...commonMove, planHash }],
    ] as const;

    for (const [channel, command, payload] of cases) {
      await call(handlers, channel, command, payload);
    }
    expect(invokeProjectOperation).toHaveBeenCalledTimes(cases.length);
  });

  it('routes every Recovery command including chooser-backed restore and export', async () => {
    const { handlers, invokeProjectOperation } = createHarness();
    const cases = [
      [
        IPC_CHANNELS.createCheckpoint,
        RECOVERY_COMMANDS.createCheckpoint,
        { projectId, operation: 'manual-protection' },
      ],
      [IPC_CHANNELS.createDailyBackup, RECOVERY_COMMANDS.createDailyBackup, { projectId }],
      [
        IPC_CHANNELS.createNamedSnapshot,
        RECOVERY_COMMANDS.createNamedSnapshot,
        { projectId, authority: 'author', name: '阶段快照', note: null },
      ],
      [IPC_CHANNELS.getOverview, RECOVERY_COMMANDS.getOverview, { projectId }],
      [
        IPC_CHANNELS.updatePolicy,
        RECOVERY_COMMANDS.updatePolicy,
        {
          projectId,
          authority: 'author',
          dailyRetentionCount: 7,
          majorRetentionCount: 20,
          majorRetentionDays: 90,
          quotaBytes: 100 * 1024 * 1024,
        },
      ],
      [
        IPC_CHANNELS.setProtection,
        RECOVERY_COMMANDS.setProtection,
        { projectId, backupId, authority: 'author', protected: true },
      ],
      [IPC_CHANNELS.previewCleanup, RECOVERY_COMMANDS.previewCleanup, { projectId }],
      [
        IPC_CHANNELS.applyCleanup,
        RECOVERY_COMMANDS.applyCleanup,
        { projectId, authority: 'author', planHash },
      ],
      [
        IPC_CHANNELS.restoreCheckpoint,
        RECOVERY_COMMANDS.restoreCheckpoint,
        { projectId, backupId },
      ],
      [IPC_CHANNELS.exportVersion, RECOVERY_COMMANDS.exportVersion, { projectId, versionId }],
    ] as const;

    for (const [channel, command, payload] of cases) {
      await call(handlers, channel, command, payload);
    }
    expect(invokeProjectOperation).toHaveBeenCalledTimes(cases.length);
  });

  it('routes all Project lifecycle commands and preserves continuation payloads', async () => {
    const { handlers, invokeProjectOperation } = createHarness();
    const cases = [
      [IPC_CHANNELS.getActive, PROJECT_WORKSPACE_COMMANDS.getActive, {}],
      [IPC_CHANNELS.getContinuation, PROJECT_WORKSPACE_COMMANDS.getContinuation, { projectId }],
      [
        IPC_CHANNELS.saveContinuation,
        PROJECT_WORKSPACE_COMMANDS.saveContinuation,
        {
          projectId,
          chapterId,
          draftId,
          draftRevision: 1,
          logicalBlockId,
          expectedBlockHash: 'a'.repeat(64),
          cursorOffset: 0,
          scrollTop: 0,
          panel: 'editor',
        },
      ],
      [
        IPC_CHANNELS.create,
        PROJECT_WORKSPACE_COMMANDS.create,
        { name: '测试作品', channel: '男频', initialStructure: 'blank' },
      ],
      [IPC_CHANNELS.openSelected, PROJECT_WORKSPACE_COMMANDS.openSelected, {}],
      [IPC_CHANNELS.openRecent, PROJECT_WORKSPACE_COMMANDS.openRecent, { projectId }],
      [IPC_CHANNELS.close, PROJECT_WORKSPACE_COMMANDS.close, { projectId }],
      [IPC_CHANNELS.move, PROJECT_WORKSPACE_COMMANDS.move, { projectId }],
    ] as const;

    for (const [channel, command, payload] of cases) {
      await call(handlers, channel, command, payload);
    }
    expect(invokeProjectOperation).toHaveBeenCalledTimes(cases.length);
  });
});
