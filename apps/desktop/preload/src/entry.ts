import './index.js';

import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidateApplyCommandSchema,
  CandidateApplyResultSchema,
  CandidatePreviewCommandSchema,
  CandidatePreviewResultSchema,
  PROTOCOL_VERSION,
  type CandidateApplyInput,
  type CandidateApplyOutcome,
  type CandidatePreview,
  type CandidatePreviewInput,
  type CommandResult,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

const candidateActionBridge = {
  preview: async (input: CandidatePreviewInput): Promise<CommandResult<CandidatePreview>> => {
    const command = CandidatePreviewCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
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
  apply: async (input: CandidateApplyInput): Promise<CommandResult<CandidateApplyOutcome>> => {
    const command = CandidateApplyCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      requestId: globalThis.crypto.randomUUID(),
      command: CANDIDATE_APPLY_COMMANDS.applyCandidate,
      payload: input,
      sentAt: new Date().toISOString(),
    });
    const result: unknown = await ipcRenderer.invoke(
      CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate,
      command,
    );
    return CandidateApplyResultSchema.parse(result);
  },
} as const;

contextBridge.exposeInMainWorld('worldforgeCandidatePreview', candidateActionBridge);
