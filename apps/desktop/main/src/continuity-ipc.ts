import { randomUUID } from 'node:crypto';

import {
  CONTINUITY_COMMANDS,
  CONTINUITY_IPC_CHANNELS,
  ContinuityCatalogResultSchema,
  CoreProjectOperationSchema,
  ContinuityListCommandSchema,
  EntityStateInvalidateCommandSchema,
  EntityStateSetCommandSchema,
  KnowledgeStateInvalidateCommandSchema,
  KnowledgeStateSetCommandSchema,
  TimelineEventArchiveCommandSchema,
  TimelineEventSaveCommandSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import {
  coreOperationFailureSemantics,
  type CoreOperationKind,
} from './ipc-error-semantics.js';

export interface ContinuityIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function failure(requestId: string, code: ErrorCode, operationKind: CoreOperationKind) {
  const semantics = coreOperationFailureSemantics(
    code,
    'The continuity operation could not be completed.',
    operationKind,
  );
  return ContinuityCatalogResultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerContinuityIpc(options: ContinuityIpcOptions): () => void {
  const registrations = [
    {
      channel: CONTINUITY_IPC_CHANNELS.list,
      schema: ContinuityListCommandSchema,
      operation: CONTINUITY_COMMANDS.list,
      operationKind: 'query',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.setEntityState,
      schema: EntityStateSetCommandSchema,
      operation: CONTINUITY_COMMANDS.setEntityState,
      operationKind: 'mutation',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.invalidateEntityState,
      schema: EntityStateInvalidateCommandSchema,
      operation: CONTINUITY_COMMANDS.invalidateEntityState,
      operationKind: 'mutation',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.saveTimelineEvent,
      schema: TimelineEventSaveCommandSchema,
      operation: CONTINUITY_COMMANDS.saveTimelineEvent,
      operationKind: 'mutation',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.archiveTimelineEvent,
      schema: TimelineEventArchiveCommandSchema,
      operation: CONTINUITY_COMMANDS.archiveTimelineEvent,
      operationKind: 'mutation',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.setKnowledgeState,
      schema: KnowledgeStateSetCommandSchema,
      operation: CONTINUITY_COMMANDS.setKnowledgeState,
      operationKind: 'mutation',
    },
    {
      channel: CONTINUITY_IPC_CHANNELS.invalidateKnowledgeState,
      schema: KnowledgeStateInvalidateCommandSchema,
      operation: CONTINUITY_COMMANDS.invalidateKnowledgeState,
      operationKind: 'mutation',
    },
  ] as const;

  for (const registration of registrations) {
    options.ipcMain.handle(registration.channel, async (event, raw) => {
      const parsed = registration.schema.safeParse(raw);
      if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
        return failure(
          parsed.success ? parsed.data.requestId : randomUUID(),
          'COMMON_INVALID_INPUT_001',
          registration.operationKind,
        );
      }
      const coreOperation = CoreProjectOperationSchema.parse({
        operation: registration.operation,
        input: parsed.data.payload,
      });
      const result = await options.supervisor.invokeProjectOperation(
        parsed.data.requestId,
        coreOperation,
      );
      if (!result.ok) {
        return failure(parsed.data.requestId, result.errorCode, registration.operationKind);
      }
      return ContinuityCatalogResultSchema.parse({
        ok: true,
        requestId: parsed.data.requestId,
        data: result.data,
      });
    });
  }

  return () => {
    for (const registration of registrations) options.ipcMain.removeHandler(registration.channel);
  };
}
