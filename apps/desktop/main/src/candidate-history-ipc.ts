import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CANDIDATE_UNDO_LOOKUP_CHANNEL,
  CANDIDATE_UNDO_LOOKUP_COMMAND,
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

interface CandidateHistoryIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function retryable(code: ErrorCode): boolean {
  return ['COMMON_TIMEOUT_005', 'COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(code);
}

function trusted(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerCandidateHistoryIpc(options: CandidateHistoryIpcOptions): () => void {
  const lookupChannel = CANDIDATE_UNDO_LOOKUP_CHANNEL;
  const previewChannel = CANDIDATE_APPLY_IPC_CHANNELS.previewUndo;
  const actionChannel = CANDIDATE_APPLY_IPC_CHANNELS.undoApply;

  options.ipcMain.handle(lookupChannel, async (event, raw) => {
    const parsed = CandidateUndoLookupCommandSchema.safeParse(raw);
    const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
    if (!parsed.success || !trusted(event, options.rendererUrl)) {
      return CandidateUndoLookupResultSchema.parse({
        ok: false,
        requestId,
        error: {
          code: 'COMMON_INVALID_INPUT_001',
          message: 'The persisted Candidate record could not be found.',
          retryable: false,
        },
      });
    }
    const result = await options.supervisor.invokeProjectOperation(requestId, {
      operation: CANDIDATE_UNDO_LOOKUP_COMMAND,
      input: parsed.data.payload,
    });
    return result.ok
      ? CandidateUndoLookupResultSchema.parse({ ok: true, requestId, data: result.data })
      : CandidateUndoLookupResultSchema.parse({
          ok: false,
          requestId,
          error: {
            code: result.errorCode,
            message: 'The persisted Candidate record could not be found.',
            retryable: retryable(result.errorCode),
          },
        });
  });

  options.ipcMain.handle(previewChannel, async (event, raw) => {
    const parsed = CandidateUndoPreviewCommandSchema.safeParse(raw);
    const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
    if (!parsed.success || !trusted(event, options.rendererUrl)) {
      return CandidateUndoPreviewResultSchema.parse({
        ok: false,
        requestId,
        error: {
          code: 'COMMON_INVALID_INPUT_001',
          message: 'The Candidate history preview could not be loaded.',
          retryable: false,
        },
      });
    }
    const result = await options.supervisor.invokeProjectOperation(requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.previewUndo,
      input: parsed.data.payload,
    });
    return result.ok
      ? CandidateUndoPreviewResultSchema.parse({ ok: true, requestId, data: result.data })
      : CandidateUndoPreviewResultSchema.parse({
          ok: false,
          requestId,
          error: {
            code: result.errorCode,
            message: 'The Candidate history preview could not be loaded.',
            retryable: retryable(result.errorCode),
          },
        });
  });

  options.ipcMain.handle(actionChannel, async (event, raw) => {
    const parsed = CandidateUndoCommandSchema.safeParse(raw);
    const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
    if (!parsed.success || !trusted(event, options.rendererUrl)) {
      return CandidateUndoResultSchema.parse({
        ok: false,
        requestId,
        error: {
          code: 'COMMON_INVALID_INPUT_001',
          message: 'The Candidate history action could not be completed.',
          retryable: false,
        },
      });
    }
    const result = await options.supervisor.invokeProjectOperation(requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.undoApply,
      input: parsed.data.payload,
    });
    return result.ok
      ? CandidateUndoResultSchema.parse({ ok: true, requestId, data: result.data })
      : CandidateUndoResultSchema.parse({
          ok: false,
          requestId,
          error: {
            code: result.errorCode,
            message: 'The Candidate history action could not be completed.',
            retryable: retryable(result.errorCode),
          },
        });
  });

  return () => {
    options.ipcMain.removeHandler(actionChannel);
    options.ipcMain.removeHandler(previewChannel);
    options.ipcMain.removeHandler(lookupChannel);
  };
}
