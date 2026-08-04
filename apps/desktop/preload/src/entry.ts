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
import { contextBridge } from 'electron';

import { invokeCommand } from './bridge-runtime.js';

const candidateActionBridge = {
  preview: (
    input: CandidatePreviewInput,
    requestId = globalThis.crypto.randomUUID(),
  ): Promise<CommandResult<CandidatePreview>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate,
      CandidatePreviewCommandSchema,
      CandidatePreviewResultSchema,
      CANDIDATE_APPLY_COMMANDS.previewCandidate,
      input,
      { requestId },
    ),
  cancelPreview: (previewRequestId: string): Promise<CommandResult<CandidatePreviewCancel>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.cancelPreview,
      CandidatePreviewCancelCommandSchema,
      CandidatePreviewCancelResultSchema,
      CANDIDATE_APPLY_COMMANDS.cancelPreview,
      { previewRequestId },
    ),
  apply: (input: CandidateApplyInput): Promise<CommandResult<CandidateApplyOutcome>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate,
      CandidateApplyCommandSchema,
      CandidateApplyResultSchema,
      CANDIDATE_APPLY_COMMANDS.applyCandidate,
      input,
    ),
  findUndoRecord: (
    input: CandidateUndoLookupInput,
  ): Promise<CommandResult<CandidateUndoLookup>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.findUndoRecord,
      CandidateUndoLookupCommandSchema,
      CandidateUndoLookupResultSchema,
      CANDIDATE_APPLY_COMMANDS.findUndoRecord,
      input,
    ),
  previewUndo: (
    input: CandidateUndoPreviewInput,
  ): Promise<CommandResult<CandidateUndoPreview>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.previewUndo,
      CandidateUndoPreviewCommandSchema,
      CandidateUndoPreviewResultSchema,
      CANDIDATE_APPLY_COMMANDS.previewUndo,
      input,
    ),
  undo: (input: CandidateUndoInput): Promise<CommandResult<CandidateUndoOutcome>> =>
    invokeCommand(
      CANDIDATE_APPLY_IPC_CHANNELS.undoApply,
      CandidateUndoCommandSchema,
      CandidateUndoResultSchema,
      CANDIDATE_APPLY_COMMANDS.undoApply,
      input,
    ),
} as const;

contextBridge.exposeInMainWorld('worldforgeCandidatePreview', candidateActionBridge);
