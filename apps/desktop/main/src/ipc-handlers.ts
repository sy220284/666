import { randomUUID } from 'node:crypto';

import {
  APP_COMMANDS,
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  RequestIdSchema,
  ProjectListRecentCommandSchema,
  ProjectListStructureCommandSchema,
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
import { createDiagnosticId, type PrivacyLogger } from './privacy-logger.js';

interface IpcHandlerOptions {
  readonly ipcMain: IpcMain;
  readonly supervisor: CoreSupervisor;
  readonly credentialBroker: CredentialBroker;
  readonly rendererUrl: string;
  readonly version: string;
  readonly platform: string;
  readonly logger: PrivacyLogger;
  readonly getWindowPreferences: () => WindowPreferences;
  readonly setAppearancePreferences: (
    preferences: AppearancePreferences,
  ) => Promise<WindowPreferences>;
  readonly chooseRecentLocation: () => Promise<string | null>;
  readonly chooseProjectCreateParent: () => Promise<string | null>;
  readonly chooseProjectToOpen: () => Promise<string | null>;
  readonly chooseProjectMoveParent: () => Promise<string | null>;
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
): CommandFailure {
  return {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable,
      ...(diagnosticId ? { diagnosticId } : {}),
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

  const appDataFailure = (requestId: string, code: ErrorCode): CommandFailure =>
    failure(
      requestId,
      code,
      'The local application data operation could not be completed.',
      ['COMMON_TIMEOUT_005', 'COMMON_INTERNAL_999', 'DB_BUSY_TIMEOUT_002'].includes(code),
    );

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
      : appDataFailure(requestId, result.errorCode);
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
