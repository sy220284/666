import './index.js';

import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CANDIDATE_UNDO_LOOKUP_CHANNEL,
  CANDIDATE_UNDO_LOOKUP_COMMAND,
  CandidateApplyCommandSchema,
  CandidateApplyResultSchema,
  CandidatePreviewCommandSchema,
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
  preview: async (input: CandidatePreviewInput): Promise<CommandResult<CandidatePreview>> => {
    const command = CandidatePreviewCommandSchema.parse(
      commandEnvelope(CANDIDATE_APPLY_COMMANDS.previewCandidate, input),
    );
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate,
      command,
    );
    return CandidatePreviewResultSchema.parse(result);
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
  findHistory: async (
    input: CandidateUndoLookupInput,
  ): Promise<CommandResult<CandidateUndoLookup>> => {
    const command = CandidateUndoLookupCommandSchema.parse(
      commandEnvelope(CANDIDATE_UNDO_LOOKUP_COMMAND, input),
    );
    const result: unknown = await ipcRenderer.invoke(CANDIDATE_UNDO_LOOKUP_CHANNEL, command);
    return CandidateUndoLookupResultSchema.parse(result);
  },
  previewHistory: async (
    input: CandidateUndoPreviewInput,
  ): Promise<CommandResult<CandidateUndoPreview>> => {
    const command = CandidateUndoPreviewCommandSchema.parse(
      commandEnvelope(CANDIDATE_APPLY_COMMANDS.previewUndo, input),
    );
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.previewUndo,
      command,
    );
    return CandidateUndoPreviewResultSchema.parse(result);
  },
  restoreHistory: async (
    input: CandidateUndoInput,
  ): Promise<CommandResult<CandidateUndoOutcome>> => {
    const command = CandidateUndoCommandSchema.parse(
      commandEnvelope(CANDIDATE_APPLY_COMMANDS.undoApply, input),
    );
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.undoApply,
      command,
    );
    return CandidateUndoResultSchema.parse(result);
  },
} as const;

contextBridge.exposeInMainWorld('worldforgeCandidatePreview', candidateActionBridge);
