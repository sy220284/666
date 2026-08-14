import { afterEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  fromWebContents: vi.fn(),
  showOpenDialog: vi.fn(),
}));

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: electron.fromWebContents },
  dialog: { showOpenDialog: electron.showOpenDialog },
}));

import {
  RESEARCH_COMMANDS,
  RESEARCH_IPC_CHANNELS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import type { IpcMain } from 'electron';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import { registerResearchIpc } from '../../apps/desktop/main/src/research-ipc.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const projectId = '5a198db8-5a43-45ea-b777-7dfb63742bb7';
const noteId = '47ec1a73-cb73-454d-8133-b9574b8e6d91';
const attachmentId = '481b7b8f-c7b4-4a87-88b6-1d27721a3bb8';
const linkId = '4d8bb193-b682-4f39-abfe-cda2ddf5e494';
const targetId = 'a19ee637-1789-49ee-b49d-7839b3b5585f';
const requestId = '1297f55c-68b9-4a09-bf74-c3ba6cb4a2af';
const sentAt = '2026-08-14T00:00:00.000Z';
const rendererUrl = 'file:///renderer';

type Handler = (event: unknown, raw: unknown) => Promise<unknown>;

const catalog = {
  projectId,
  notes: [
    {
      id: noteId,
      projectId,
      title: '资料',
      body: '正文',
      sourceType: null,
      sourceLabel: null,
      sourceUri: null,
      tags: [],
      status: 'active' as const,
      createdAt: sentAt,
      updatedAt: sentAt,
      archivedAt: null,
    },
  ],
  attachments: [
    {
      id: attachmentId,
      projectId,
      noteId,
      displayName: '资料.txt',
      mediaType: 'text/plain',
      sizeBytes: 4,
      contentHash: 'a'.repeat(64),
      managedRelativePath: `artifacts/research/${attachmentId}.txt`,
      createdAt: sentAt,
    },
  ],
  links: [
    {
      id: linkId,
      projectId,
      sourceType: 'note' as const,
      sourceId: noteId,
      targetType: 'chapter' as const,
      targetId,
      createdAt: sentAt,
    },
  ],
};

function envelope(command: string, payload: unknown) {
  return { protocolVersion: 1, requestId, sentAt, command, payload };
}

function event(url = rendererUrl) {
  return { senderFrame: { url }, sender: {} };
}

function harness(resultFor: (operation: CoreProjectOperation) => CoreProjectResult = successFor) {
  const handlers = new Map<string, Handler>();
  const ipcMain = {
    handle: vi.fn((channel: string, handler: Handler) => handlers.set(channel, handler)),
    removeHandler: vi.fn((channel: string) => handlers.delete(channel)),
  };
  const invokeProjectOperation = vi.fn(
    async (_requestId: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
      resultFor(operation),
  );
  const unregister = registerResearchIpc({
    ipcMain: contractInput<IpcMain>(ipcMain),
    supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
    rendererUrl,
  });
  return { handlers, ipcMain, invokeProjectOperation, unregister };
}

afterEach(() => {
  delete process.env.WORLDFORGE_E2E;
  delete process.env.WORLDFORGE_E2E_RESEARCH_ATTACHMENT;
  electron.fromWebContents.mockReset();
  electron.showOpenDialog.mockReset();
});

describe('M12-02 research IPC coverage', () => {
  it('registers all handlers, maps catalog success, rejects malformed/untrusted input and maps Core failure', async () => {
    const value = harness();
    expect(value.ipcMain.handle).toHaveBeenCalledTimes(Object.keys(RESEARCH_IPC_CHANNELS).length);

    const list = value.handlers.get(RESEARCH_IPC_CHANNELS.list)!;
    await expect(list(event(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      list(
        event('https://untrusted.example'),
        envelope(RESEARCH_COMMANDS.list, { projectId, includeArchived: false }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      list(event(), envelope(RESEARCH_COMMANDS.list, { projectId, includeArchived: false })),
    ).resolves.toMatchObject({ ok: true, requestId, data: { projectId } });

    const failed = harness(() => ({
      ok: false,
      operation: RESEARCH_COMMANDS.list,
      errorCode: 'COMMON_INTERNAL_999',
    }));
    await expect(
      failed.handlers.get(RESEARCH_IPC_CHANNELS.list)!(
        event(),
        envelope(RESEARCH_COMMANDS.list, { projectId, includeArchived: false }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_INTERNAL_999', retryable: true },
    });

    value.unregister();
    expect(value.ipcMain.removeHandler).toHaveBeenCalledTimes(
      Object.keys(RESEARCH_IPC_CHANNELS).length,
    );
    expect(value.handlers.size).toBe(0);
  });

  it('covers every ordinary research mutation registration with valid project operations', async () => {
    const value = harness();
    const commands = [
      [
        RESEARCH_IPC_CHANNELS.createNote,
        RESEARCH_COMMANDS.createNote,
        { projectId, title: '资料' },
      ],
      [
        RESEARCH_IPC_CHANNELS.updateNote,
        RESEARCH_COMMANDS.updateNote,
        {
          projectId,
          noteId,
          expectedUpdatedAt: sentAt,
          title: '资料',
          body: '正文',
          sourceType: null,
          sourceLabel: null,
          sourceUri: null,
          tags: [],
        },
      ],
      [
        RESEARCH_IPC_CHANNELS.setNoteStatus,
        RESEARCH_COMMANDS.setNoteStatus,
        { projectId, noteId, expectedUpdatedAt: sentAt, status: 'archived' },
      ],
      [
        RESEARCH_IPC_CHANNELS.deleteNote,
        RESEARCH_COMMANDS.deleteNote,
        { projectId, noteId, expectedUpdatedAt: sentAt },
      ],
      [
        RESEARCH_IPC_CHANNELS.deleteAttachment,
        RESEARCH_COMMANDS.deleteAttachment,
        { projectId, attachmentId },
      ],
      [
        RESEARCH_IPC_CHANNELS.addLink,
        RESEARCH_COMMANDS.addLink,
        { projectId, sourceType: 'note', sourceId: noteId, targetType: 'chapter', targetId },
      ],
      [RESEARCH_IPC_CHANNELS.removeLink, RESEARCH_COMMANDS.removeLink, { projectId, linkId }],
    ] as const;

    for (const [channel, command, payload] of commands) {
      await expect(
        value.handlers.get(channel)!(event(), envelope(command, payload)),
      ).resolves.toMatchObject({
        ok: true,
        requestId,
        data: { projectId },
      });
    }
  });

  it('covers preview validation, success and Core failure semantics', async () => {
    const value = harness();
    const preview = value.handlers.get(RESEARCH_IPC_CHANNELS.previewAttachment)!;
    await expect(preview(event(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      preview(
        event('https://untrusted.example'),
        envelope(RESEARCH_COMMANDS.previewAttachment, { projectId, attachmentId }),
      ),
    ).resolves.toMatchObject({ ok: false, requestId });
    await expect(
      preview(event(), envelope(RESEARCH_COMMANDS.previewAttachment, { projectId, attachmentId })),
    ).resolves.toMatchObject({
      ok: true,
      data: { projectId, attachmentId, text: '正文' },
    });

    const failed = harness(() => ({
      ok: false,
      operation: RESEARCH_COMMANDS.previewAttachment,
      errorCode: 'COMMON_INTERNAL_999',
    }));
    await expect(
      failed.handlers.get(RESEARCH_IPC_CHANNELS.previewAttachment)!(
        event(),
        envelope(RESEARCH_COMMANDS.previewAttachment, { projectId, attachmentId }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999', retryable: true },
    });
  });

  it('covers attachment chooser cancellation, E2E injection, dialog selection and import failure', async () => {
    const value = harness();
    const importAttachment = value.handlers.get(RESEARCH_IPC_CHANNELS.importAttachment)!;
    const command = envelope(RESEARCH_COMMANDS.importAttachment, { projectId, noteId });

    await expect(importAttachment(event(), {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INVALID_INPUT_001' },
    });
    await expect(
      importAttachment(event('https://untrusted.example'), command),
    ).resolves.toMatchObject({
      ok: false,
      requestId,
    });

    electron.fromWebContents.mockReturnValue(null);
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    electron.fromWebContents.mockReturnValue({ isDestroyed: () => true });
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });

    electron.fromWebContents.mockReturnValue({ isDestroyed: () => false });
    electron.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });
    electron.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] });
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_CANCELLED_004' },
    });
    electron.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['/tmp/research.txt'],
    });
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: true,
      requestId,
    });

    process.env.WORLDFORGE_E2E = '1';
    process.env.WORLDFORGE_E2E_RESEARCH_ATTACHMENT = 'relative.txt';
    await expect(importAttachment(event(), command)).rejects.toThrow(
      'WORLDFORGE_E2E_RESEARCH_ATTACHMENT_MUST_BE_ABSOLUTE',
    );
    process.env.WORLDFORGE_E2E_RESEARCH_ATTACHMENT = '/tmp/injected.txt';
    await expect(importAttachment(event(), command)).resolves.toMatchObject({
      ok: true,
      requestId,
    });

    const failed = harness(() => ({
      ok: false,
      operation: RESEARCH_COMMANDS.importAttachment,
      errorCode: 'COMMON_INTERNAL_999',
    }));
    await expect(
      failed.handlers.get(RESEARCH_IPC_CHANNELS.importAttachment)!(event(), command),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: 'COMMON_INTERNAL_999', retryable: true },
    });
  });
});

function successFor(operation: CoreProjectOperation): CoreProjectResult {
  if (operation.operation === RESEARCH_COMMANDS.previewAttachment) {
    return {
      ok: true,
      operation: operation.operation,
      data: {
        projectId,
        attachmentId,
        displayName: '资料.txt',
        mediaType: 'text/plain',
        contentHash: 'a'.repeat(64),
        text: '正文',
        truncated: false,
      },
    };
  }
  return { ok: true, operation: operation.operation, data: catalog } as CoreProjectResult;
}
