import { randomUUID } from 'node:crypto';

import {
  STORY_KNOWLEDGE_COMMANDS,
  STORY_KNOWLEDGE_IPC_CHANNELS,
  CoreProjectOperationSchema,
  StoryKnowledgeProjectCommandSchema,
  StoryKnowledgeProjectionResultSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { registerIpcInvokeHandler } from './handler-guard.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';
import { projectOperationKind } from './project-operation-semantics.js';

export interface StoryKnowledgeIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

function failure(requestId: string, code: ErrorCode) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The story knowledge projection could not be read.',
    projectOperationKind(STORY_KNOWLEDGE_COMMANDS.project),
  );
  return StoryKnowledgeProjectionResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

export function registerStoryKnowledgeIpc(options: StoryKnowledgeIpcOptions): () => void {
  registerIpcInvokeHandler(options.ipcMain, STORY_KNOWLEDGE_IPC_CHANNELS.project, async (event, raw) => {
    const parsed = StoryKnowledgeProjectCommandSchema.safeParse(raw);
    if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
      return failure(parsed.success ? parsed.data.requestId : randomUUID(), 'COMMON_INVALID_INPUT_001');
    }
    const coreOperation = CoreProjectOperationSchema.parse({
      operation: STORY_KNOWLEDGE_COMMANDS.project,
      input: parsed.data.payload,
    });
    const result = await options.supervisor.invokeProjectOperation(parsed.data.requestId, coreOperation);
    if (!result.ok) return failure(parsed.data.requestId, result.errorCode);
    return StoryKnowledgeProjectionResultSchema.parse({
      ok: true,
      requestId: parsed.data.requestId,
      data: result.data,
    });
  });

  return () => options.ipcMain.removeHandler(STORY_KNOWLEDGE_IPC_CHANNELS.project);
}
