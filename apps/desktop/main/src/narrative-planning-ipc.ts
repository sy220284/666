import { randomUUID } from 'node:crypto';

import {
  NARRATIVE_PLANNING_COMMANDS,
  NARRATIVE_PLANNING_IPC_CHANNELS,
  STATE_PROPOSAL_COMMANDS,
  STATE_PROPOSAL_IPC_CHANNELS,
  VALIDATION_COMMANDS,
  VALIDATION_IPC_CHANNELS,
  SEARCH_TOOLS_COMMANDS,
  SEARCH_TOOLS_IPC_CHANNELS,
  RHYTHM_COMMANDS,
  RHYTHM_IPC_CHANNELS,
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
  StoryCommentAddCommandSchema,
  StoryCommentResolveCommandSchema,
  StoryTodoSaveCommandSchema,
  ValidationCatalogResultSchema,
  ValidationCreateTodoCommandSchema,
  ValidationListCommandSchema,
  ValidationRunRulesCommandSchema,
  ValidationUpdateIssueCommandSchema,
  ValidationExceptionDisableCommandSchema,
  ValidationExceptionRememberCommandSchema,
  SearchProjectCommandSchema,
  SearchProjectCommandResultSchema,
  SearchIndexStateCommandSchema,
  SearchIndexStateCommandResultSchema,
  SearchIndexRebuildCommandSchema,
  SearchIndexRebuildCommandResultSchema,
  ReplacePreviewCommandSchema,
  ReplacePreviewCommandResultSchema,
  ReplaceApplyCommandSchema,
  ReplaceApplyCommandResultSchema,
  ProjectDictionaryListCommandSchema,
  ProjectDictionaryUpsertCommandSchema,
  ProjectDictionaryDeleteCommandSchema,
  ProjectDictionaryCommandResultSchema,
  RhythmGetCommandSchema,
  RhythmRunCommandSchema,
  RhythmUpdateProfileCommandSchema,
  RhythmDashboardResultSchema,
  type ErrorCode,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import { registerIpcInvokeHandler } from './handler-guard.js';
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
    {
      channel: VALIDATION_IPC_CHANNELS.list,
      schema: ValidationListCommandSchema,
      operation: VALIDATION_COMMANDS.list,
      operationKind: 'query',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.runRules,
      schema: ValidationRunRulesCommandSchema,
      operation: VALIDATION_COMMANDS.runRules,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.updateIssue,
      schema: ValidationUpdateIssueCommandSchema,
      operation: VALIDATION_COMMANDS.updateIssue,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.createTodoFromIssue,
      schema: ValidationCreateTodoCommandSchema,
      operation: VALIDATION_COMMANDS.createTodoFromIssue,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.saveTodo,
      schema: StoryTodoSaveCommandSchema,
      operation: VALIDATION_COMMANDS.saveTodo,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.addComment,
      schema: StoryCommentAddCommandSchema,
      operation: VALIDATION_COMMANDS.addComment,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.resolveComment,
      schema: StoryCommentResolveCommandSchema,
      operation: VALIDATION_COMMANDS.resolveComment,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation operation could not be completed.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.rememberException,
      schema: ValidationExceptionRememberCommandSchema,
      operation: VALIDATION_COMMANDS.rememberException,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation exception could not be saved.',
    },
    {
      channel: VALIDATION_IPC_CHANNELS.disableException,
      schema: ValidationExceptionDisableCommandSchema,
      operation: VALIDATION_COMMANDS.disableException,
      operationKind: 'mutation',
      resultSchema: ValidationCatalogResultSchema,
      failureMessage: 'The validation exception could not be disabled.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.search,
      schema: SearchProjectCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.search,
      operationKind: 'query',
      resultSchema: SearchProjectCommandResultSchema,
      failureMessage: 'The project search could not be completed.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.getIndexState,
      schema: SearchIndexStateCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.getIndexState,
      operationKind: 'query',
      resultSchema: SearchIndexStateCommandResultSchema,
      failureMessage: 'The search index state could not be read.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.rebuildIndex,
      schema: SearchIndexRebuildCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.rebuildIndex,
      operationKind: 'mutation',
      resultSchema: SearchIndexRebuildCommandResultSchema,
      failureMessage: 'The search index could not be rebuilt.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.previewReplace,
      schema: ReplacePreviewCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.previewReplace,
      operationKind: 'mutation',
      resultSchema: ReplacePreviewCommandResultSchema,
      failureMessage: 'The replacement preview could not be created.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.applyReplace,
      schema: ReplaceApplyCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.applyReplace,
      operationKind: 'mutation',
      resultSchema: ReplaceApplyCommandResultSchema,
      failureMessage: 'The replacement plan could not be applied.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.listDictionary,
      schema: ProjectDictionaryListCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.listDictionary,
      operationKind: 'query',
      resultSchema: ProjectDictionaryCommandResultSchema,
      failureMessage: 'The project dictionary could not be read.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.upsertDictionary,
      schema: ProjectDictionaryUpsertCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.upsertDictionary,
      operationKind: 'mutation',
      resultSchema: ProjectDictionaryCommandResultSchema,
      failureMessage: 'The project dictionary could not be updated.',
    },
    {
      channel: SEARCH_TOOLS_IPC_CHANNELS.deleteDictionary,
      schema: ProjectDictionaryDeleteCommandSchema,
      operation: SEARCH_TOOLS_COMMANDS.deleteDictionary,
      operationKind: 'mutation',
      resultSchema: ProjectDictionaryCommandResultSchema,
      failureMessage: 'The project dictionary entry could not be deleted.',
    },
    {
      channel: RHYTHM_IPC_CHANNELS.get,
      schema: RhythmGetCommandSchema,
      operation: RHYTHM_COMMANDS.get,
      operationKind: 'query',
      resultSchema: RhythmDashboardResultSchema,
      failureMessage: 'The rhythm dashboard could not be read.',
    },
    {
      channel: RHYTHM_IPC_CHANNELS.run,
      schema: RhythmRunCommandSchema,
      operation: RHYTHM_COMMANDS.run,
      operationKind: 'mutation',
      resultSchema: RhythmDashboardResultSchema,
      failureMessage: 'The rhythm analysis could not be completed.',
    },
    {
      channel: RHYTHM_IPC_CHANNELS.updateProfile,
      schema: RhythmUpdateProfileCommandSchema,
      operation: RHYTHM_COMMANDS.updateProfile,
      operationKind: 'mutation',
      resultSchema: RhythmDashboardResultSchema,
      failureMessage: 'The rhythm profile could not be updated.',
    },
  ];

  for (const registration of registrations) {
    registerIpcInvokeHandler(options.ipcMain, registration.channel, async (event, raw) => {
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
