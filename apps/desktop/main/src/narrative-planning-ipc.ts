import { randomUUID } from 'node:crypto';

import {
  NARRATIVE_PLANNING_COMMANDS,
  NARRATIVE_PLANNING_IPC_CHANNELS,
  STATE_PROPOSAL_COMMANDS,
  STATE_PROPOSAL_IPC_CHANNELS,
  ArcMilestoneSaveCommandSchema,
  ArcMilestoneTransitionCommandSchema,
  CharacterArcSaveCommandSchema,
  CoreProjectOperationSchema,
  DerivedInvalidationCommandSchema,
  DerivedInvalidationResultEnvelopeSchema,
  EndingSnapshotReadCommandSchema,
  EndingSnapshotReadResultEnvelopeSchema,
  EndingSnapshotRefreshCommandSchema,
  EndingSnapshotResultSchema,
  ForeshadowingSaveCommandSchema,
  ForeshadowingTransitionCommandSchema,
  NarrativePlanningCatalogResultSchema,
  NarrativePlanningListCommandSchema,
  StateProposalCatalogResultSchema,
  StateProposalGenerateCommandSchema,
  StateProposalListCommandSchema,
  StateProposalResolveCommandSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { coreOperationFailureSemantics, type CoreOperationKind } from './ipc-error-semantics.js';

export interface NarrativePlanningIpcOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly rendererUrl: string;
}

interface ParsedCommand {
  readonly requestId: string;
  readonly payload: unknown;
}

interface CommandSchema {
  safeParse(
    input: unknown,
  ): { readonly success: true; readonly data: ParsedCommand } | { readonly success: false };
}

interface ResultSchema {
  parse(input: unknown): unknown;
}

interface Registration {
  readonly channel: string;
  readonly schema: CommandSchema;
  readonly operation: string;
  readonly operationKind: CoreOperationKind;
  readonly resultSchema: ResultSchema;
  readonly failureMessage: string;
}

function failure(
  resultSchema: ResultSchema,
  requestId: string,
  code: ErrorCode,
  message: string,
  operationKind: CoreOperationKind,
): unknown {
  const semantics = coreOperationFailureSemantics(code, message, operationKind);
  return resultSchema.parse({
    ok: false,
    requestId,
    error: { code, ...semantics },
  });
}

function trustedSender(event: IpcMainInvokeEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

export function registerNarrativePlanningIpc(options: NarrativePlanningIpcOptions): () => void {
  const narrativeResult = NarrativePlanningCatalogResultSchema;
  const registrations: readonly Registration[] = [
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.list,
      schema: NarrativePlanningListCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.list,
      operationKind: 'query',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveForeshadowing,
      schema: ForeshadowingSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveForeshadowing,
      operationKind: 'mutation',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionForeshadowing,
      schema: ForeshadowingTransitionCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing,
      operationKind: 'mutation',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveCharacterArc,
      schema: CharacterArcSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveCharacterArc,
      operationKind: 'mutation',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.saveArcMilestone,
      schema: ArcMilestoneSaveCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.saveArcMilestone,
      operationKind: 'mutation',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: NARRATIVE_PLANNING_IPC_CHANNELS.transitionArcMilestone,
      schema: ArcMilestoneTransitionCommandSchema,
      operation: NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone,
      operationKind: 'mutation',
      resultSchema: narrativeResult,
      failureMessage: 'The narrative planning operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.list,
      schema: StateProposalListCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.list,
      operationKind: 'query',
      resultSchema: StateProposalCatalogResultSchema,
      failureMessage: 'The state proposal operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.generate,
      schema: StateProposalGenerateCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.generate,
      operationKind: 'mutation',
      resultSchema: StateProposalCatalogResultSchema,
      failureMessage: 'The state proposal operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.resolve,
      schema: StateProposalResolveCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.resolve,
      operationKind: 'mutation',
      resultSchema: StateProposalCatalogResultSchema,
      failureMessage: 'The state proposal operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.refreshSnapshot,
      schema: EndingSnapshotRefreshCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.refreshSnapshot,
      operationKind: 'mutation',
      resultSchema: EndingSnapshotResultSchema,
      failureMessage: 'The ending snapshot operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.readSnapshot,
      schema: EndingSnapshotReadCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.readSnapshot,
      operationKind: 'query',
      resultSchema: EndingSnapshotReadResultEnvelopeSchema,
      failureMessage: 'The ending snapshot operation could not be completed.',
    },
    {
      channel: STATE_PROPOSAL_IPC_CHANNELS.invalidateDerived,
      schema: DerivedInvalidationCommandSchema,
      operation: STATE_PROPOSAL_COMMANDS.invalidateDerived,
      operationKind: 'mutation',
      resultSchema: DerivedInvalidationResultEnvelopeSchema,
      failureMessage: 'The derived invalidation operation could not be completed.',
    },
  ];

  for (const registration of registrations) {
    options.ipcMain.handle(registration.channel, async (event, raw) => {
      const parsed = registration.schema.safeParse(raw);
      if (!parsed.success || !trustedSender(event, options.rendererUrl)) {
        return failure(
          registration.resultSchema,
          parsed.success ? parsed.data.requestId : randomUUID(),
          'COMMON_INVALID_INPUT_001',
          registration.failureMessage,
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
        return failure(
          registration.resultSchema,
          parsed.data.requestId,
          result.errorCode,
          registration.failureMessage,
          registration.operationKind,
        );
      }
      return registration.resultSchema.parse({
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
