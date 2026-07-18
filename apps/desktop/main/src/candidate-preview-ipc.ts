import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidatePreviewCommandSchema,
  CandidatePreviewResultSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';

interface CandidatePreviewIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function failure(requestId: string, code: ErrorCode) {
  return CandidatePreviewResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: 'The Candidate preview could not be loaded.',
      retryable: ['COMMON_TIMEOUT_005', 'COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(
        code,
      ),
    },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerCandidatePreviewIpc(options: CandidatePreviewIpcOptions): () => void {
  const channel = CANDIDATE_APPLY_IPC_CHANNELS.previewCandidate;
  options.ipcMain.handle(channel, async (event, raw) => {
    const parsed = CandidatePreviewCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return failure(requestId, 'COMMON_INVALID_INPUT_001');
    }

    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.previewCandidate,
      input: parsed.data.payload,
    });
    if (!result.ok) return failure(parsed.data.requestId, result.errorCode);
    return CandidatePreviewResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  return () => options.ipcMain.removeHandler(channel);
}
