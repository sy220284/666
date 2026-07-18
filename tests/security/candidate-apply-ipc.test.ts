import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidateApplyCommandSchema,
  PROTOCOL_VERSION,
  type CandidateApplyOutcome,
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
const conflictSetId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const sentAt = '2026-07-18T03:30:00.000Z';

const command = CandidateApplyCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.applyCandidate,
  payload: {
    projectId,
    chapterId,
    candidateId,
    draftId,
    baseRevision: 0,
    selection: { mode: 'all' },
  },
});

const outcome: CandidateApplyOutcome = {
  outcome: 'conflict',
  conflictSet: {
    conflictSetId,
    candidateId,
    draftId,
    applyRecordId: null,
    phase: 'apply',
    attemptedRevision: 0,
    currentRevision: 1,
    conflicts: [
      {
        kind: 'revision',
        logicalBlockId: null,
        candidateBlockId: null,
        expectedHash: null,
        actualHash: null,
        message: 'Draft revision changed before Candidate action.',
      },
    ],
    createdAt: sentAt,
    resolvedAt: null,
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
    async (_id: string, operation: CoreProjectOperation): Promise<CoreProjectResult> => ({
      ok: true,
      operation: operation.operation as typeof CANDIDATE_APPLY_COMMANDS.applyCandidate,
      data: outcome,
    }),
  );
  registerCandidatePreviewIpc({
    ipcMain,
    supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
    rendererUrl: 'file:///trusted/index.html',
  });
  return { handlers, invokeProjectOperation };
}

describe('Candidate action IPC input boundary', () => {
  it('rejects invalid senders and extra input fields before Core', async () => {
    const { handlers, invokeProjectOperation } = register();
    const handler = handlers.get(CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate);

    await expect(
      handler?.(
        { senderFrame: { url: 'https://untrusted.invalid' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...command, payload: { ...command.payload, candidateStatus: 'accepted' } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        { ...command, payload: { ...command.payload, baseRevision: -1 } },
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();
  });

  it('forwards the strict Candidate action operation', async () => {
    const { handlers, invokeProjectOperation } = register();
    const handler = handlers.get(CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate);

    await expect(
      handler?.(
        { senderFrame: { url: 'file:///trusted/index.html' } } as unknown as IpcMainInvokeEvent,
        command,
      ),
    ).resolves.toEqual({ ok: true, requestId, data: outcome });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.applyCandidate,
      input: command.payload,
    });
  });
});
