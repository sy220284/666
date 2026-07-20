import { randomUUID } from 'node:crypto';

import {
  NARRATIVE_PLANNING_COMMANDS,
  NARRATIVE_PLANNING_IPC_CHANNELS,
  ArcMilestoneSaveCommandSchema,
  ArcMilestoneTransitionCommandSchema,
  CharacterArcSaveCommandSchema,
  CoreProjectOperationSchema,
  ForeshadowingSaveCommandSchema,
  ForeshadowingTransitionCommandSchema,
  NarrativePlanningCatalogResultSchema,
  NarrativePlanningListCommandSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';

export interface NarrativePlanningIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

function failure(requestId: string, code: ErrorCode) {
  return NarrativePlanningCatalogResultSchema.parse({
    ok: false,
    requestId,
    error: {
      code,
      message: 'The narrative planning operation could not be completed.',
      retryable: ['COMMON_TIMEOUT_005', 'COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(
        code,
      ),
    },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerNarrativePlanningIpc(options: NarrativePlanningIpcOptions): () => void {
  const registrations = [
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.list,
      schema: NarrativePlanningListCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.list,
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveForeshadowing,
      schema: ForeshadowingSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveForeshadowing,
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionForeshadowing,
      schema: ForeshadowingTransitionCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing,
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveCharacterArc,
      schema: CharacterArcSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveCharacterArc,
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveArcMilestone,
      schema: ArcMilestoneSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveArcMilestone,
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionArcMilestone,
      schema: ArcMilestoneTransitionCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone,
    },
  ] as const;

  for (const registration of registrations) {
    options.ipcMain.handle(registration.channel, async (event, raw) => {
      const parsed = registration.schema.safeParse(raw);
      if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
        return failure(
          parsed.success ? parsed.data.requestId : randomUUID(),
          'COMMON_INVALID_INPUT_001',
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
      if (!result.ok) return failure(parsed.data.requestId, result.errorCode);
      return NarrativePlanningCatalogResultSchema.parse({
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
