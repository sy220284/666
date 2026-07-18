import './index.js';

import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidateApplyCommandSchema,
  CandidateApplyResultSchema,
  CandidatePreviewCommandSchema,
  CandidatePreviewCancelCommandSchema,
  CandidatePreviewCancelResultSchema,
  CandidatePreviewResultSchema,
  CandidateUndoCommandSchema,
  CandidateUndoLookupCommandSchema,
  CandidateUndoLookupResultSchema,
  CandidateUndoPreviewCommandSchema,
  CandidateUndoPreviewResultSchema,
  CandidateUndoResultSchema,
  PROTOCOL_VERSION,
  type CandidateApplyInput,
  type CandidateApplyOutcome,
  type CandidatePreview,
  type CandidatePreviewCancel,
  type CandidatePreviewInput,
  type CandidateUndoInput,
  type CandidateUndoLookup,
  type CandidateUndoLookupInput,
  type CandidateUndoOutcome,
  type CandidateUndoPreview,
  type CandidateUndoPreviewInput,
  type CommandResult,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

function commandEnvelope(command: string, payload: unknown) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    payload,
    sentAt: new Date().toISOString(),
  };
}

const candidateActionBridge = {
  preview: async (
    input: CandidatePreviewInput,
    requestId = globalThis.crypto.randomUUID(),
  ): Promise<CommandResult<CandidatePreview>> => {
    const command = CandidatePreviewCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      command: CANDIDATE_APPLY_COMMANDS.previewCandidate,
      payload: input,
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate,
      command,
    );
    return CandidatePreviewResultSchema.parse(result);
  },
  cancelPreview: async (
    previewRequestId: string,
  ): Promise<CommandResult<CandidatePreviewCancel>> => {
    const command = CandidatePreviewCancelCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
      command: CANDIDATE_APPLY_COMMANDS.cancelPreview,
      payload: { previewRequestId },
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.cancelPreview,
      command,
    );
    return CandidatePreviewCancelResultSchema.parse(result);
  },
  apply: async (input: CandidateApplyInput): Promise<CommandResult<CandidateApplyOutcome>> => {
    const command = CandidateApplyCommandSchema.parse(
      commandEnvelope(CANDIDATE_APPLY_COMMANDS.applyCandidate, input),
    );
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate,
      command,
    );
    return CandidateApplyResultSchema.parse(result);
  },
  findUndoRecord: async (
    input: CandidateUndoLookupInput,
  ): Promise<CommandResult<CandidateUndoLookup>> => {
    const command = CandidateUndoLookupCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
      command: CANDIDATE_APPLY_COMMANDS.findUndoRecord,
      payload: input,
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.findUndoRecord,
      command,
    );
    return CandidateUndoLookupResultSchema.parse(result);
  },
  previewUndo: async (
    input: CandidateUndoPreviewInput,
  ): Promise<CommandResult<CandidateUndoPreview>> => {
    const command = CandidateUndoPreviewCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
      command: CANDIDATE_APPLY_COMMANDS.previewUndo,
      payload: input,
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.previewUndo,
      command,
    );
    return CandidateUndoPreviewResultSchema.parse(result);
  },
  undo: async (input: CandidateUndoInput): Promise<CommandResult<CandidateUndoOutcome>> => {
    const command = CandidateUndoCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
      command: CANDIDATE_APPLY_COMMANDS.undoApply,
      payload: input,
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.undoApply,
      command,
    );
    return CandidateUndoResultSchema.parse(result);
  },
} as const;

contextBridge.exposeInMainWorld('worldforgeCandidatePreview', candidateActionBridge);
