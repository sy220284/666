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
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';

interface CandidatePreviewIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function previewFailure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The Candidate preview could not be loaded.',
    'query',
  );
  return CandidatePreviewResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function previewCancelFailure(requestId: string, code: ErrorCode) {
  return CandidatePreviewCancelResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: 'The Candidate preview could not be cancelled.',
      retryable: false,
    },
  });
}

function actionFailure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The Candidate action could not be completed.',
  );
  return CandidateApplyResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function lookupFailure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The Candidate ApplyRecord could not be found.',
    'query',
  );
  return CandidateUndoLookupResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function undoPreviewFailure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The Candidate undo preview could not be loaded.',
    'query',
  );
  return CandidateUndoPreviewResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function undoFailure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The Candidate application could not be undone.',
  );
  return CandidateUndoResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerCandidatePreviewIpc(options: CandidatePreviewIpcOptions): () => void {
  const previewChannel = CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate;
  const previewCancelChannel = CANDIDATE_APPLY_IPC_CHANNELS.cancelPreview;
  const actionChannel = CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate;
  const lookupChannel = CANDIDATE_APPLY_IPC_CHANNELS.findUndoRecord;
  const undoPreviewChannel = CANDIDATE_APPLY_IPC_CHANNELS.previewUndo;
  const undoChannel = CANDIDATE_APPLY_IPC_CHANNELS.undoApply;

  options.ipcMain.handle(previewChannel, async (event, raw) => {
    const parsed = CandidatePreviewCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return previewFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }

    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.previewCandidate,
      input: parsed.data.payload,
    });
    if (!result.ok) return previewFailure(parsed.data.requestId, result.errorCode);
    return CandidatePreviewResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  options.ipcMain.handle(previewCancelChannel, async (event, raw) => {
    const parsed = CandidatePreviewCancelCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return previewCancelFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }
    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.cancelPreview,
      input: parsed.data.payload,
    });
    if (!result.ok) return previewCancelFailure(parsed.data.requestId, result.errorCode);
    return CandidatePreviewCancelResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  options.ipcMain.handle(actionChannel, async (event, raw) => {
    const parsed = CandidateApplyCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return actionFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }

    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.applyCandidate,
      input: parsed.data.payload,
    });
    if (!result.ok) return actionFailure(parsed.data.requestId, result.errorCode);
    return CandidateApplyResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  options.ipcMain.handle(lookupChannel, async (event, raw) => {
    const parsed = CandidateUndoLookupCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return lookupFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }
    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.findUndoRecord,
      input: parsed.data.payload,
    });
    if (!result.ok) return lookupFailure(parsed.data.requestId, result.errorCode);
    return CandidateUndoLookupResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  options.ipcMain.handle(undoPreviewChannel, async (event, raw) => {
    const parsed = CandidateUndoPreviewCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return undoPreviewFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }
    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.previewUndo,
      input: parsed.data.payload,
    });
    if (!result.ok) return undoPreviewFailure(parsed.data.requestId, result.errorCode);
    return CandidateUndoPreviewResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  options.ipcMain.handle(undoChannel, async (event, raw) => {
    const parsed = CandidateUndoCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return undoFailure(requestId, 'COMMON_INVALID_INPUT_001');
    }
    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.undoApply,
      input: parsed.data.payload,
    });
    if (!result.ok) return undoFailure(parsed.data.requestId, result.errorCode);
    return CandidateUndoResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  return () => {
    options.ipcMain.removeHandler(undoChannel);
    options.ipcMain.removeHandler(undoPreviewChannel);
    options.ipcMain.removeHandler(lookupChannel);
    options.ipcMain.removeHandler(actionChannel);
    options.ipcMain.removeHandler(previewCancelChannel);
    options.ipcMain.removeHandler(previewChannel);
  };
}
