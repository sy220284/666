import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_APPLY_IPC_CHANNELS,
  CandidateApplyCommandSchema,
  CandidateApplyResultSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';

interface CandidateApplyIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function failure(requestId: string, code: ErrorCode) {
  return CandidateApplyResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: 'The Candidate could not be applied.',
      retryable: ['COMMON_TIMEOUT_005', 'COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(
        code,
      ),
    },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerCandidateApplyIpc(options: CandidateApplyIpcOptions): () => void {
  const channel = CANDIDATE_APPLY_IPC_CHANNELS.applyCandidate;
  options.ipcMain.handle(channel, async (event, raw) => {
    const parsed = CandidateApplyCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      const requestId = parsed.success ? parsed.data.requestId : crypto.randomUUID();
      return failure(requestId, 'COMMON_INVALID_INPUT_001');
    }

    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, {
      operation: CANDIDATE_APPLY_COMMANDS.applyCandidate,
      input: parsed.data.payload,
    });
    if (!result.ok) return failure(parsed.data.requestId, result.errorCode);
    return CandidateApplyResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  return () => options.ipcMain.removeHandler(channel);
}
