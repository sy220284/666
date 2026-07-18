import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidatePreviewCancelCommandSchema,
  CandidatePreviewCommandSchema,
  PROTOCOL_VERSION,
  type CandidatePreview,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';
import { describe, expect, it, vi } from 'vitest';

import type { CoreSupervisor } from '../../apps/desktop/main/src/core-supervisor.js';
import { registerCandidatePreviewIpc } from '../../apps/desktop/main/src/candidate-preview-ipc.js';

const requestId = '550e8400-e29b-41d4-a716-446655440000';
const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const chapterId = '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d';
const draftId = '48ee4f14-d049-401a-8f21-991c769b1b86';
const candidateId = 'd60c2f63-7f2c-4605-bf2d-bf8cd433bca6';
const blockId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const candidateBlockId = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const sentAt = '2026-07-17T12:30:00.000Z';
const hash = '1'.repeat(64);
const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;

const command = CandidatePreviewCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.previewCandidate,
  payload: { projectId, chapterId, candidateId },
});

const cancelCommand = CandidatePreviewCancelCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.cancelPreview,
  payload: { previewRequestId: requestId },
});

const preview: CandidatePreview = {
  candidate: {
    candidateId,
    projectId,
    chapterId,
    generationRunId: null,
    candidateType: 'rewrite',
    baseDraftId: draftId,
    baseDraftRevision: 0,
    completeness: 'complete',
    status: 'pending',
    title: '预览候选',
    sourceVersionId: null,
    contentHash: hash,
    blockCount: 1,
    createdAt: sentAt,
    resolvedAt: null,
    blocks: [
      {
        candidateBlockId,
        logicalBlockId: blockId,
        sourceLogicalBlockIds: [blockId],
        orderKey: '1024',
        blockType: 'paragraph',
        text: '候选正文',
        attributes: {},
        beatId: null,
        sourceBlockHash: hash,
        contentHash: hash,
      },
    ],
  },
  draft: {
    projectId,
    chapterId,
    draftId,
    status: 'active',
    revision: 0,
    blocks: [
      {
        logicalBlockId: blockId,
        orderKey: '1024',
        blockType: 'paragraph',
        text: '当前正文',
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: hash,
      },
    ],
  },
  structure: [
    {
      kind: 'modified',
      logicalBlockId: blockId,
      candidateBlockIds: [candidateBlockId],
      sourceLogicalBlockIds: [blockId],
      currentIndexes: [0],
      candidateIndexes: [0],
      contentChanged: true,
    },
  ],
  characterDiffs: [
    {
      key: `block:${blockId}`,
      before: '当前正文',
      after: '候选正文',
      segments: [
        { type: 'delete', text: '当前' },
        { type: 'insert', text: '候选' },
        { type: 'equal', text: '正文' },
      ],
      coarse: false,
    },
  ],
  execution: {
    strategy: 'main-thread',
    chapterCharacters: 4,
    continuousBlockingBudgetMilliseconds: 100,
    rationale: '测试',
  },
};

function register() {
  const handlers = new Map<string, (event: IpcMainInvokeEvent, raw: unknown) => unknown>();
  const ipcMain = {
    handle: vi.fn(
      (channel: string, handler: (event: IpcMainInvokeEvent, raw: unknown) => unknown) => {
        handlers.set(channel, handler);
      },
    ),
    removeHandler: vi.fn(),
  } as unknown as IpcMain;
  const invokeProjectOperation = vi.fn(
    async (_id: string, operation: CoreProjectOperation): Promise<CoreProjectResult> =>
      operation.operation === CANDIDATE_APPLY_COMMANDS.cancelPreview
        ? {
            ok: true,
            operation: CANDIDATE_APPLY_COMMANDS.cancelPreview,
            data: { cancelled: true },
          }
        : ({
            ok: true,
            operation: CANDIDATE_APPLY_COMMANDS.previewCandidate,
            data: preview,
          } as CoreProjectResult),
  );
  registerCandidatePreviewIpc({
    ipcMain,
    supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
    rendererUrl: 'file:///trusted/index.html',
  });
  return { handlers, invokeProjectOperation };
}

describe('Candidate Preview IPC authority boundary', () => {
  it('rejects untrusted senders and extra fields before Core', async () => {
    const { handlers, invokeProjectOperation } = register();
    const handler = handlers.get(CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate);

    await expect(
      handler?.(
        { senderFrame: { url: 'https://attacker.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...command, payload: { ...command.payload, status: 'accepted' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();
  });

  it('forwards only the strict Preview operation', async () => {
    const { handlers, invokeProjectOperation } = register();
    const handler = handlers.get(CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate);
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId, data: preview });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.previewCandidate,
      input: command.payload,
    });
  });

  it('validates and forwards only the strict Preview cancellation operation', async () => {
    const { handlers, invokeProjectOperation } = register();
    const handler = handlers.get(CANDIDATE_APPLY_IPC_CHANNELS.cancelPreview);
    await expect(
      handler?.(trustedEvent, {
        ...cancelCommand,
        payload: { ...cancelCommand.payload, candidateId },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();

    await expect(handler?.(trustedEvent, cancelCommand)).resolves.toEqual({
      ok: true,
      requestId,
      data: { cancelled: true },
    });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.cancelPreview,
      input: cancelCommand.payload,
    });
  });
});
