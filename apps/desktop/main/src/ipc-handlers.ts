import { randomUUID } from 'node:crypto';

import {
  APP_COMMANDS,
  DRAFT_COMMANDS,
  CANDIDATE_COMMANDS,
  CANDIDATE_IPC_CHANNELS,
  VERSION_COMMANDS,
  RECOVERY_COMMANDS,
  TEXT_IO_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_PLANNING_COMMANDS,
  SCENE_BEAT_COMMANDS,
  ENTITY_CANON_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  DraftApplyPatchCommandSchema,
  DraftOpenCommandSchema,
  CandidateCreateFixtureCommandSchema,
  CandidateDiscardCommandSchema,
  CandidateGetCommandSchema,
  CandidateListCommandSchema,
  VersionCreateCommandSchema,
  VersionGetCommandSchema,
  VersionListCommandSchema,
  VersionRestoreCommandSchema,
  VersionSetFinalCommandSchema,
  RecoveryCreateCommandSchema,
  RecoveryOverviewCommandSchema,
  RecoveryRestoreCommandSchema,
  RecoveryExportCommandSchema,
  ImportPreviewCommandSchema,
  ImportCommitCommandSchema,
  ExportVersionListCommandSchema,
  ExportVersionsCommandSchema,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  RequestIdSchema,
  ProjectListRecentCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectGetBriefCommandSchema,
  ProjectUpdateBriefCommandSchema,
  ProjectListPlotNodesCommandSchema,
  ProjectCreatePlotNodeCommandSchema,
  ProjectUpdatePlotNodeCommandSchema,
  ProjectMovePlotNodeCommandSchema,
  ProjectDeletePlotNodeCommandSchema,
  SceneBeatListCommandSchema,
  SceneBeatCreateCommandSchema,
  SceneBeatUpdateCommandSchema,
  SceneBeatMoveCommandSchema,
  SceneBeatPreviewCrossChapterMoveCommandSchema,
  SceneBeatMoveAcrossChaptersCommandSchema,
  SceneBeatDeleteCommandSchema,
  SceneBeatRestoreCommandSchema,
  SceneBeatSetBlockLinksCommandSchema,
  SceneBeatConvertBlocksCommandSchema,
  CanonFactSetCommandSchema,
  EntityArchiveCommandSchema,
  EntityCreateCommandSchema,
  EntityDeleteCommandSchema,
  EntityDeletePreviewCommandSchema,
  EntityListCommandSchema,
  EntityUpdateCommandSchema,
  SceneBeatEntityLinkCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectCloseCommandSchema,
  ProjectCreateCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectMoveCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectCreateChapterCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectPreviewPermanentDeleteCommandSchema,
  ProjectPermanentDeleteCommandSchema,
  ProjectPreviewSplitChapterCommandSchema,
  ProjectSplitChapterCommandSchema,
  ProjectPreviewMergeChaptersCommandSchema,
  ProjectMergeChaptersCommandSchema,
  ProjectPreviewMoveBlocksCommandSchema,
  ProjectMoveBlocksCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectUpdateVolumeCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
  TaskCancelCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskPortConnectSchema,
  type CommandFailure,
  type CommandResult,
  type ErrorCode,
  type AppearancePreferences,
  type WindowPreferences,
} from '@worldforge/contracts';
import type { IpcMain, IpcMainEvent, IpcMainInvokeEvent } from 'electron';

import type { CoreSupervisor } from './core-supervisor.js';
import type { CredentialBroker } from './credential-broker.js';
import { coreOperationFailureSemantics } from './ipc-error-semantics.js';
import { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';

interface IpcHandlerOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly version: string;
  readonly platform: string;
  readonly enableTestFixtures?: boolean;
  readonly logger: PrivacyLogger;
  readonly getWindowPreferences: () => WindowPreferences;
  readonly setAppearancePreferences: (
    preferences: AppearancePreferences,
  ) => Promise<WindowPreferences>;
  readonly chooseRecentLocation: () => Promise<string | null>;
  readonly chooseProjectCreateParent: () => Promise<string | null>;
  readonly chooseProjectToOpen: () => Promise<string | null>;
  readonly chooseProjectMoveParent: () => Promise<string | null>;
  readonly chooseRecoveryRestoreParent: () => Promise<string | null>;
  readonly chooseRecoveryExportDirectory: () => Promise<string | null>;
  readonly chooseTextImportFile: () => Promise<string | null>;
  readonly chooseTextExportDirectory: () => Promise<string | null>;
}

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

function failure(
  requestId: string,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  diagnosticId?: string,
  details?: CommandFailure['error']['details'],
  userAction?: string,
): CommandFailure {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(diagnosticId ? { diagnosticId } : {}),
      ...(details ? { details } : {}),
      ...(userAction ? { userAction } : {}),
    },
  };
}

function trustedSender(event: IpcMainInvokeEvent | IpcMainEvent, rendererUrl: string): boolean {
  return event.senderFrame?.url === rendererUrl;
}

function requestIdFrom(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'requestId' in raw) {
    const parsed = RequestIdSchema.safeParse(raw.requestId);
    if (parsed.success) return parsed.data;
  }
  return randomUUID();
}

export function registerIpcHandlers(options: IpcHandlerOptions): () => void {
  const invokeChannels = [
    IPC_CHANNELS.appGetInfo,
    IPC_CHANNELS.appGetCoreStatus,
    IPC_CHANNELS.appRestartCore,
    IPC_CHANNELS.appGetWindowPreferences,
    IPC_CHANNELS.appSetAppearancePreferences,
    IPC_CHANNELS.settingsGet,
    IPC_CHANNELS.settingsSet,
    IPC_CHANNELS.settingsReset,
    IPC_CHANNELS.projectListRecent,
    IPC_CHANNELS.projectRelocateRecent,
    IPC_CHANNELS.projectRemoveRecent,
    IPC_CHANNELS.getActive,
    IPC_CHANNELS.create,
    IPC_CHANNELS.openSelected,
    IPC_CHANNELS.openRecent,
    IPC_CHANNELS.close,
    IPC_CHANNELS.move,
    IPC_CHANNELS.getBrief,
    IPC_CHANNELS.updateBrief,
    IPC_CHANNELS.listPlotNodes,
    IPC_CHANNELS.createPlotNode,
    IPC_CHANNELS.updatePlotNode,
    IPC_CHANNELS.movePlotNode,
    IPC_CHANNELS.deletePlotNode,
    IPC_CHANNELS.listSceneBeats,
    IPC_CHANNELS.createSceneBeat,
    IPC_CHANNELS.updateSceneBeat,
    IPC_CHANNELS.moveSceneBeat,
    IPC_CHANNELS.previewMoveSceneBeat,
    IPC_CHANNELS.moveSceneBeatAcrossChapters,
    IPC_CHANNELS.deleteSceneBeat,
    IPC_CHANNELS.restoreSceneBeat,
    IPC_CHANNELS.setSceneBeatBlockLinks,
    IPC_CHANNELS.convertBlocksToSceneBeat,
    IPC_CHANNELS.listEntities,
    IPC_CHANNELS.createEntity,
    IPC_CHANNELS.updateEntity,
    IPC_CHANNELS.archiveEntity,
    IPC_CHANNELS.setCanonFact,
    IPC_CHANNELS.linkSceneBeatEntity,
    IPC_CHANNELS.previewDeleteEntity,
    IPC_CHANNELS.deleteEntity,
    IPC_CHANNELS.listStructure,
    IPC_CHANNELS.createVolume,
    IPC_CHANNELS.updateVolume,
    IPC_CHANNELS.moveVolume,
    IPC_CHANNELS.deleteVolume,
    IPC_CHANNELS.createChapter,
    IPC_CHANNELS.updateChapter,
    IPC_CHANNELS.moveChapter,
    IPC_CHANNELS.deleteChapter,
    IPC_CHANNELS.listTrash,
    IPC_CHANNELS.restoreTrashEntry,
    IPC_CHANNELS.previewPermanentDelete,
    IPC_CHANNELS.permanentDelete,
    IPC_CHANNELS.previewSplitChapter,
    IPC_CHANNELS.splitChapter,
    IPC_CHANNELS.previewMergeChapters,
    IPC_CHANNELS.mergeChapters,
    IPC_CHANNELS.previewMoveBlocks,
    IPC_CHANNELS.moveBlocks,
    IPC_CHANNELS.openDraft,
    IPC_CHANNELS.applyPatch,
    CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
    CANDIDATE_IPC_CHANNELS.listCandidates,
    CANDIDATE_IPC_CHANNELS.getCandidate,
    CANDIDATE_IPC_CHANNELS.discardCandidate,
    IPC_CHANNELS.createVersion,
    IPC_CHANNELS.listVersions,
    IPC_CHANNELS.getVersion,
    IPC_CHANNELS.setFinalVersion,
    IPC_CHANNELS.restoreVersion,
    IPC_CHANNELS.createCheckpoint,
    IPC_CHANNELS.getOverview,
    IPC_CHANNELS.restoreCheckpoint,
    IPC_CHANNELS.exportVersion,
    IPC_CHANNELS.previewImport,
    IPC_CHANNELS.commitImport,
    IPC_CHANNELS.listExportVersions,
    IPC_CHANNELS.exportVersions,
    IPC_CHANNELS.aiSetCredential,
    IPC_CHANNELS.aiRemoveCredential,
    IPC_CHANNELS.aiHasCredential,
    IPC_CHANNELS.taskGetSnapshot,
    IPC_CHANNELS.taskCancel,
    IPC_CHANNELS.taskListActive,
  ] as const;
  const register = (
    channel: string,
    handler: (event: IpcMainInvokeEvent, input: unknown) => Promise<unknown> | unknown,
  ): void => {
    if (
      channel === CANDIDATE_IPC_CHANNELS.createFixtureCandidate &&
      options.enableTestFixtures !== true
    ) {
      return;
    }
    options.ipcMain.handle(channel, handler);
  };

  const rejectUntrusted = (event: IpcMainInvokeEvent, raw: unknown): CommandFailure | null => {
    if (trustedSender(event, options.rendererUrl)) return null;
    return failure(
      requestIdFrom(raw),
      'COMMON_INVALID_INPUT_001',
      'The request origin is not trusted.',
      false,
    );
  };

  const invalidRequest = (raw: unknown): CommandFailure =>
    failure(requestIdFrom(raw), 'COMMON_INVALID_INPUT_001', 'The request was invalid.', false);

  register(IPC_CHANNELS.appGetInfo, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetInfoCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, {
      version: options.version,
      platform: options.platform,
      protocolVersion: PROTOCOL_VERSION,
    });
  });

  register(IPC_CHANNELS.appGetCoreStatus, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetCoreStatusCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, options.supervisor.getStatus());
  });

  register(IPC_CHANNELS.appRestartCore, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppRestartCoreCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.restart();
    return success(parsed.data.requestId, {
      accepted: result.ok,
      status: options.supervisor.getStatus(),
    });
  });

  register(IPC_CHANNELS.appGetWindowPreferences, (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppGetWindowPreferencesCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return success(parsed.data.requestId, options.getWindowPreferences());
  });

  register(IPC_CHANNELS.appSetAppearancePreferences, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AppSetAppearancePreferencesCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    try {
      return success(
        parsed.data.requestId,
        await options.setAppearancePreferences(parsed.data.payload),
      );
    } catch {
      const diagnosticId = createDiagnosticId();
      await options.logger.log('error', 'window.preferences.save.failed', {
        errorCode: 'COMMON_INTERNAL_999',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'COMMON_INTERNAL_999',
        'The window preferences could not be saved.',
        true,
        diagnosticId,
      );
    }
  });

  const appDataFailure = (
    requestId: string,
    code: ErrorCode,
    details?: CommandFailure['error']['details'],
  ): CommandFailure => {
    const semantics = coreOperationFailureSemantics(
      code,
      'The local application data operation could not be completed.',
    );
    return failure(
      requestId,
      code,
      semantics.message,
      semantics.retryable,
      undefined,
      details,
      semantics.userAction,
    );
  };

  register(IPC_CHANNELS.settingsGet, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsGetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsGet,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.settingsSet, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsSetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsSet,
      settings: parsed.data.payload,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.settingsReset, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = SettingsResetCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.settingsReset,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectListRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectListRecent,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectRelocateRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRelocateRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let workspacePath: string | null;
    try {
      workspacePath = await options.chooseRecentLocation();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!workspacePath) {
      return failure(
        parsed.data.requestId,
        'COMMON_CANCELLED_004',
        'The relocation was cancelled.',
        false,
      );
    }
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectRelocateRecent,
      projectId: parsed.data.payload.projectId,
      workspacePath,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  register(IPC_CHANNELS.projectRemoveRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRemoveRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const result = await options.supervisor.invokeAppDataOperation(parsed.data.requestId, {
      operation: APP_COMMANDS.projectRemoveRecent,
      projectId: parsed.data.payload.projectId,
    });
    return result.ok
      ? success(parsed.data.requestId, result.data)
      : appDataFailure(parsed.data.requestId, result.errorCode);
  });

  const cancelledSelection = (requestId: string): CommandFailure =>
    failure(requestId, 'COMMON_CANCELLED_004', 'The folder selection was cancelled.', false);

  const invokeProject = async (
    requestId: string,
    operation: Parameters<CoreSupervisor['invokeProjectOperation']>[1],
  ): Promise<CommandResult<unknown>> => {
    const result = await options.supervisor.invokeProjectOperation(requestId, operation);
    return result.ok
      ? success(requestId, result.data)
      : appDataFailure(
          requestId,
          result.errorCode,
          'details' in result ? result.details : undefined,
        );
  };

  register(IPC_CHANNELS.getActive, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectGetActiveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.getActive,
    });
  });

  register(IPC_CHANNELS.create, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let parentDirectory: string | null;
    try {
      parentDirectory = await options.chooseProjectCreateParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!parentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.create,
      input: parsed.data.payload,
      parentDirectory,
    });
  });

  register(IPC_CHANNELS.openSelected, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectOpenSelectedCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let workspacePath: string | null;
    try {
      workspacePath = await options.chooseProjectToOpen();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!workspacePath) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.openSelected,
      workspacePath,
    });
  });

  register(IPC_CHANNELS.openRecent, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectOpenRecentCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.openRecent,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.close, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCloseCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.close,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.move, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetParentDirectory: string | null;
    try {
      targetParentDirectory = await options.chooseProjectMoveParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetParentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_WORKSPACE_COMMANDS.move,
      projectId: parsed.data.payload.projectId,
      targetParentDirectory,
    });
  });

  register(IPC_CHANNELS.createCheckpoint, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryCreateCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.createCheckpoint,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.getOverview, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryOverviewCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.getOverview,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.restoreCheckpoint, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryRestoreCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetParentDirectory: string | null;
    try {
      targetParentDirectory = await options.chooseRecoveryRestoreParent();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetParentDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.restoreCheckpoint,
      input: parsed.data.payload,
      targetParentDirectory,
    });
  });

  register(IPC_CHANNELS.exportVersion, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = RecoveryExportCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetDirectory: string | null;
    try {
      targetDirectory = await options.chooseRecoveryExportDirectory();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: RECOVERY_COMMANDS.exportVersion,
      input: parsed.data.payload,
      targetDirectory,
    });
  });

  register(IPC_CHANNELS.previewImport, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ImportPreviewCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let sourcePath: string | null;
    try {
      sourcePath = await options.chooseTextImportFile();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!sourcePath) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.previewImport,
      input: parsed.data.payload,
      sourcePath,
    });
  });

  register(IPC_CHANNELS.commitImport, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ImportCommitCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.commitImport,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.listExportVersions, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ExportVersionListCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.listExportVersions,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.exportVersions, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ExportVersionsCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    let targetDirectory: string | null;
    try {
      targetDirectory = await options.chooseTextExportDirectory();
    } catch {
      return appDataFailure(parsed.data.requestId, 'COMMON_INTERNAL_999');
    }
    if (!targetDirectory) return cancelledSelection(parsed.data.requestId);
    return invokeProject(parsed.data.requestId, {
      operation: TEXT_IO_COMMANDS.exportVersions,
      input: parsed.data.payload,
      targetDirectory,
    });
  });

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.getBrief, ProjectGetBriefCommandSchema, PROJECT_PLANNING_COMMANDS.getBrief],
    [
      IPC_CHANNELS.listPlotNodes,
      ProjectListPlotNodesCommandSchema,
      PROJECT_PLANNING_COMMANDS.listPlotNodes,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        projectId: parsed.data.payload.projectId,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.listSceneBeats, SceneBeatListCommandSchema, SCENE_BEAT_COMMANDS.listSceneBeats],
    [
      IPC_CHANNELS.previewMoveSceneBeat,
      SceneBeatPreviewCrossChapterMoveCommandSchema,
      SCENE_BEAT_COMMANDS.previewMoveSceneBeat,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.updateBrief,
      ProjectUpdateBriefCommandSchema,
      PROJECT_PLANNING_COMMANDS.updateBrief,
    ],
    [
      IPC_CHANNELS.createPlotNode,
      ProjectCreatePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.createPlotNode,
    ],
    [
      IPC_CHANNELS.updatePlotNode,
      ProjectUpdatePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.updatePlotNode,
    ],
    [
      IPC_CHANNELS.movePlotNode,
      ProjectMovePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.movePlotNode,
    ],
    [
      IPC_CHANNELS.deletePlotNode,
      ProjectDeletePlotNodeCommandSchema,
      PROJECT_PLANNING_COMMANDS.deletePlotNode,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.createSceneBeat,
      SceneBeatCreateCommandSchema,
      SCENE_BEAT_COMMANDS.createSceneBeat,
    ],
    [
      IPC_CHANNELS.updateSceneBeat,
      SceneBeatUpdateCommandSchema,
      SCENE_BEAT_COMMANDS.updateSceneBeat,
    ],
    [IPC_CHANNELS.moveSceneBeat, SceneBeatMoveCommandSchema, SCENE_BEAT_COMMANDS.moveSceneBeat],
    [
      IPC_CHANNELS.moveSceneBeatAcrossChapters,
      SceneBeatMoveAcrossChaptersCommandSchema,
      SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters,
    ],
    [
      IPC_CHANNELS.deleteSceneBeat,
      SceneBeatDeleteCommandSchema,
      SCENE_BEAT_COMMANDS.deleteSceneBeat,
    ],
    [
      IPC_CHANNELS.restoreSceneBeat,
      SceneBeatRestoreCommandSchema,
      SCENE_BEAT_COMMANDS.restoreSceneBeat,
    ],
    [
      IPC_CHANNELS.setSceneBeatBlockLinks,
      SceneBeatSetBlockLinksCommandSchema,
      SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks,
    ],
    [
      IPC_CHANNELS.convertBlocksToSceneBeat,
      SceneBeatConvertBlocksCommandSchema,
      SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.listEntities, EntityListCommandSchema, ENTITY_CANON_COMMANDS.listEntities],
    [IPC_CHANNELS.createEntity, EntityCreateCommandSchema, ENTITY_CANON_COMMANDS.createEntity],
    [IPC_CHANNELS.updateEntity, EntityUpdateCommandSchema, ENTITY_CANON_COMMANDS.updateEntity],
    [IPC_CHANNELS.archiveEntity, EntityArchiveCommandSchema, ENTITY_CANON_COMMANDS.archiveEntity],
    [IPC_CHANNELS.setCanonFact, CanonFactSetCommandSchema, ENTITY_CANON_COMMANDS.setCanonFact],
    [
      IPC_CHANNELS.linkSceneBeatEntity,
      SceneBeatEntityLinkCommandSchema,
      ENTITY_CANON_COMMANDS.linkSceneBeatEntity,
    ],
    [
      IPC_CHANNELS.previewDeleteEntity,
      EntityDeletePreviewCommandSchema,
      ENTITY_CANON_COMMANDS.previewDeleteEntity,
    ],
    [IPC_CHANNELS.deleteEntity, EntityDeleteCommandSchema, ENTITY_CANON_COMMANDS.deleteEntity],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  register(IPC_CHANNELS.listStructure, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListStructureCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.listStructure,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.createVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.createVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.updateVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectUpdateVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.updateVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.moveVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.moveVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.deleteVolume, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectDeleteVolumeCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.deleteVolume,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.createChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectCreateChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.createChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.updateChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectUpdateChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.updateChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.moveChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectMoveChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.moveChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.deleteChapter, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectDeleteChapterCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.deleteChapter,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.listTrash, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectListTrashCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.listTrash,
      projectId: parsed.data.payload.projectId,
    });
  });

  register(IPC_CHANNELS.restoreTrashEntry, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = ProjectRestoreTrashEntryCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [
    [
      IPC_CHANNELS.previewPermanentDelete,
      ProjectPreviewPermanentDeleteCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete,
    ],
    [
      IPC_CHANNELS.permanentDelete,
      ProjectPermanentDeleteCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.permanentDelete,
    ],
    [
      IPC_CHANNELS.previewSplitChapter,
      ProjectPreviewSplitChapterCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewSplitChapter,
    ],
    [
      IPC_CHANNELS.splitChapter,
      ProjectSplitChapterCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.splitChapter,
    ],
    [
      IPC_CHANNELS.previewMergeChapters,
      ProjectPreviewMergeChaptersCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewMergeChapters,
    ],
    [
      IPC_CHANNELS.mergeChapters,
      ProjectMergeChaptersCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.mergeChapters,
    ],
    [
      IPC_CHANNELS.previewMoveBlocks,
      ProjectPreviewMoveBlocksCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks,
    ],
    [
      IPC_CHANNELS.moveBlocks,
      ProjectMoveBlocksCommandSchema,
      PROJECT_STRUCTURE_COMMANDS.moveBlocks,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  register(IPC_CHANNELS.openDraft, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftOpenCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.openDraft,
      input: parsed.data.payload,
    });
  });

  register(IPC_CHANNELS.applyPatch, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = DraftApplyPatchCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return invokeProject(parsed.data.requestId, {
      operation: DRAFT_COMMANDS.applyPatch,
      input: parsed.data.payload,
    });
  });

  for (const [channel, schema, operation] of [
    [
      CANDIDATE_IPC_CHANNELS.createFixtureCandidate,
      CandidateCreateFixtureCommandSchema,
      CANDIDATE_COMMANDS.createFixtureCandidate,
    ],
    [
      CANDIDATE_IPC_CHANNELS.listCandidates,
      CandidateListCommandSchema,
      CANDIDATE_COMMANDS.listCandidates,
    ],
    [
      CANDIDATE_IPC_CHANNELS.getCandidate,
      CandidateGetCommandSchema,
      CANDIDATE_COMMANDS.getCandidate,
    ],
    [
      CANDIDATE_IPC_CHANNELS.discardCandidate,
      CandidateDiscardCommandSchema,
      CANDIDATE_COMMANDS.discardCandidate,
    ],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  for (const [channel, schema, operation] of [
    [IPC_CHANNELS.createVersion, VersionCreateCommandSchema, VERSION_COMMANDS.createVersion],
    [IPC_CHANNELS.listVersions, VersionListCommandSchema, VERSION_COMMANDS.listVersions],
    [IPC_CHANNELS.getVersion, VersionGetCommandSchema, VERSION_COMMANDS.getVersion],
    [IPC_CHANNELS.setFinalVersion, VersionSetFinalCommandSchema, VERSION_COMMANDS.setFinalVersion],
    [IPC_CHANNELS.restoreVersion, VersionRestoreCommandSchema, VERSION_COMMANDS.restoreVersion],
  ] as const) {
    register(channel, async (event, raw) => {
      const rejected = rejectUntrusted(event, raw);
      if (rejected) return rejected;
      const parsed = schema.safeParse(raw);
      if (!parsed.success) return invalidRequest(raw);
      return invokeProject(parsed.data.requestId, {
        operation,
        input: parsed.data.payload,
      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);
    });
  }

  register(IPC_CHANNELS.aiSetCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiSetCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    try {
      const credentialRef = await options.credentialBroker.store(
        parsed.data.payload.providerId,
        parsed.data.payload.credential,
      );
      return success(parsed.data.requestId, { credentialRef });
    } catch {
      const diagnosticId = createDiagnosticId();
      await options.logger.log('error', 'credential.store.failed', {
        providerId: parsed.data.payload.providerId,
        errorCode: 'AI_CREDENTIAL_MISSING_002',
        diagnosticId,
      });
      return failure(
        parsed.data.requestId,
        'AI_CREDENTIAL_MISSING_002',
        'The credential could not be stored securely.',
        true,
        diagnosticId,
      );
    }
  });

  register(IPC_CHANNELS.aiRemoveCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiRemoveCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.remove(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  register(IPC_CHANNELS.aiHasCredential, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = AiHasCredentialCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    const exists = await options.credentialBroker.has(parsed.data.payload.credentialRef);
    return success(parsed.data.requestId, { exists });
  });

  register(IPC_CHANNELS.taskGetSnapshot, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskGetSnapshotCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  register(IPC_CHANNELS.taskCancel, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskCancelCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  register(IPC_CHANNELS.taskListActive, async (event, raw) => {
    const rejected = rejectUntrusted(event, raw);
    if (rejected) return rejected;
    const parsed = TaskListActiveCommandSchema.safeParse(raw);
    if (!parsed.success) return invalidRequest(raw);
    return options.supervisor.invokeTaskCommand(parsed.data);
  });

  const connectTaskEvents = (event: IpcMainEvent, raw: unknown): void => {
    const port = event.ports[0];
    if (!trustedSender(event, options.rendererUrl) || !port || event.ports.length !== 1) {
      for (const receivedPort of event.ports) receivedPort.close();
      return;
    }
    const parsed = TaskPortConnectSchema.safeParse(raw);
    if (!parsed.success || !options.supervisor.attachTaskPort(parsed.data.connectionId, port).ok) {
      port.close();
    }
  };
  options.ipcMain.on(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);

  return () => {
    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);
    options.ipcMain.removeListener(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);
  };
}
