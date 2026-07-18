import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidateUndoCommandSchema,
  CandidateUndoLookupCommandSchema,
  CandidateUndoPreviewCommandSchema,
  PROTOCOL_VERSION,
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
const applyRecordId = 'c56a4180-65aa-42ec-a945-5fd21dec0538';
const sentAt = '2026-07-18T03:30:00.000Z';
const trustedEvent = {
  senderFrame: { url: 'file:///trusted/index.html' },
} as unknown as IpcMainInvokeEvent;

const lookupCommand = CandidateUndoLookupCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.findUndoRecord,
  payload: { projectId, chapterId, candidateId },
});
const previewCommand = CandidateUndoPreviewCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.previewUndo,
  payload: { projectId, chapterId, applyRecordId },
});
const undoCommand = CandidateUndoCommandSchema.parse({
  protocolVersion: PROTOCOL_VERSION,
  requestId,
  sentAt,
  command: CANDIDATE_APPLY_COMMANDS.undoApply,
  payload: { projectId, chapterId, applyRecordId, draftId, baseRevision: 1 },
});

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
      ({
        ok: false,
        operation: operation.operation,
        errorCode: 'COMMON_NOT_FOUND_002',
      }) as CoreProjectResult,
  );
  registerCandidatePreviewIpc({
    ipcMain,
    supervisor: { invokeProjectOperation } as unknown as CoreSupervisor,
    rendererUrl: 'file:///trusted/index.html',
  });
  return { handlers, invokeProjectOperation };
}

describe('Candidate persistent undo IPC boundary', () => {
  it.each([
    [CANDIDATE_APPLY_IPC_CHANNELS.findUndoRecord, lookupCommand],
    [CANDIDATE_APPLY_IPC_CHANNELS.previewUndo, previewCommand],
    [CANDIDATE_APPLY_IPC_CHANNELS.undoApply, undoCommand],
  ] as const)('rejects extra fields on %s before Core', async (channel, command) => {
    const { handlers, invokeProjectOperation } = register();
    await expect(
      handlers.get(channel)?.(trustedEvent, {
        ...command,
        payload: { ...command.payload, injectedAuthority: true },
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'COMMON_INVALID_INPUT_001' } });
    expect(invokeProjectOperation).not.toHaveBeenCalled();
  });

  it.each([
    [
      CANDIDATE_APPLY_IPC_CHANNELS.findUndoRecord,
      lookupCommand,
      { operation: CANDIDATE_APPLY_COMMANDS.findUndoRecord, input: lookupCommand.payload },
    ],
    [
      CANDIDATE_APPLY_IPC_CHANNELS.previewUndo,
      previewCommand,
      { operation: CANDIDATE_APPLY_COMMANDS.previewUndo, input: previewCommand.payload },
    ],
    [
      CANDIDATE_APPLY_IPC_CHANNELS.undoApply,
      undoCommand,
      { operation: CANDIDATE_APPLY_COMMANDS.undoApply, input: undoCommand.payload },
    ],
  ] as const)('forwards the strict operation on %s', async (channel, command, operation) => {
    const { handlers, invokeProjectOperation } = register();
    await expect(handlers.get(channel)?.(trustedEvent, command)).resolves.toMatchObject({
      ok: false,
      requestId,
      error: { code: 'COMMON_NOT_FOUND_002' },
    });
    expect(invokeProjectOperation).toHaveBeenCalledWith(requestId, operation);
  });
});
