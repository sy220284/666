import {
  AppSettingsSnapshotResultSchema,
  AiHasCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiSetCredentialCommandSchema,
  APP_COMMANDS,
  AppGetCoreStatusCommandSchema,
  AppGetInfoCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppInfoResultSchema,
  AppRestartCoreCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  CoreOperationResultSchema,
  CoreStatusResultSchema,
  CredentialPresenceResultSchema,
  CredentialReferenceResultSchema,
  DraftApplyPatchCommandSchema,
  DraftDocumentResultSchema,
  DraftOpenCommandSchema,
  DraftSaveSnapshotCommandSchema,
  IPC_CHANNELS,
  PROTOCOL_VERSION,
  ProjectActiveResultSchema,
  ProjectCreateChapterCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectCloseCommandResultSchema,
  ProjectCloseCommandSchema,
  ProjectCreateCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectListRecentCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectMoveCommandResultSchema,
  ProjectMoveCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  RecentProjectRemovalResultSchema,
  RecentProjectResultSchema,
  RecentProjectsResultSchema,
  ProjectWorkspaceResultSchema,
  ProjectStructureResultSchema,
  ProjectTrashEntriesResultSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectUpdateVolumeCommandSchema,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
  TaskCancelCommandSchema,
  TaskCancelResultSchema,
  TaskEventAckSchema,
  TaskEventCursor,
  TaskEventEnvelopeSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
  TaskListActiveResultSchema,
  TaskPortConnectSchema,
  TaskSnapshotResultSchema,
  WindowPreferencesResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { contextBridge, ipcRenderer } from 'electron';

interface Parser<Result> {
  parse(input: unknown): Result;
}

interface IsolatedMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface IsolatedMessageChannel {
  readonly port1: IsolatedMessagePort;
  readonly port2: IsolatedMessagePort;
}

const MessageChannelConstructor = (
  globalThis as unknown as {
    readonly MessageChannel: new () => IsolatedMessageChannel;
  }
).MessageChannel;

function envelope(command: string, payload: unknown, projectId?: string): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    ...(projectId ? { projectId } : {}),
    payload,
    sentAt: new Date().toISOString(),
  };
}

async function invoke<Result>(
  channel: string,
  command: unknown,
  resultSchema: Parser<Result>,
): Promise<Result> {
  const raw: unknown = await ipcRenderer.invoke(channel, command);
  return resultSchema.parse(raw);
}

const bridge: WorldforgeBridge = {
  app: {
    getInfo: () =>
      invoke(
        IPC_CHANNELS.appGetInfo,
        AppGetInfoCommandSchema.parse(envelope(APP_COMMANDS.getInfo, {})),
        AppInfoResultSchema,
      ),
    getCoreStatus: () =>
      invoke(
        IPC_CHANNELS.appGetCoreStatus,
        AppGetCoreStatusCommandSchema.parse(envelope(APP_COMMANDS.getCoreStatus, {})),
        CoreStatusResultSchema,
      ),
    restartCore: () =>
      invoke(
        IPC_CHANNELS.appRestartCore,
        AppRestartCoreCommandSchema.parse(envelope(APP_COMMANDS.restartCore, {})),
        CoreOperationResultSchema,
      ),
    getWindowPreferences: () =>
      invoke(
        IPC_CHANNELS.appGetWindowPreferences,
        AppGetWindowPreferencesCommandSchema.parse(envelope(APP_COMMANDS.getWindowPreferences, {})),
        WindowPreferencesResultSchema,
      ),
    setAppearancePreferences: (preferences) =>
      invoke(
        IPC_CHANNELS.appSetAppearancePreferences,
        AppSetAppearancePreferencesCommandSchema.parse(
          envelope(APP_COMMANDS.setAppearancePreferences, preferences),
        ),
        WindowPreferencesResultSchema,
      ),
  },
  settings: {
    get: () =>
      invoke(
        IPC_CHANNELS.settingsGet,
        SettingsGetCommandSchema.parse(envelope(APP_COMMANDS.settingsGet, {})),
        AppSettingsSnapshotResultSchema,
      ),
    set: (settings) =>
      invoke(
        IPC_CHANNELS.settingsSet,
        SettingsSetCommandSchema.parse(envelope(APP_COMMANDS.settingsSet, settings)),
        AppSettingsSnapshotResultSchema,
      ),
    reset: () =>
      invoke(
        IPC_CHANNELS.settingsReset,
        SettingsResetCommandSchema.parse(envelope(APP_COMMANDS.settingsReset, {})),
        AppSettingsSnapshotResultSchema,
      ),
  },
  project: {
    listRecent: () =>
      invoke(
        IPC_CHANNELS.projectListRecent,
        ProjectListRecentCommandSchema.parse(envelope(APP_COMMANDS.projectListRecent, {})),
        RecentProjectsResultSchema,
      ),
    relocateRecent: (projectId) =>
      invoke(
        IPC_CHANNELS.projectRelocateRecent,
        ProjectRelocateRecentCommandSchema.parse(
          envelope(APP_COMMANDS.projectRelocateRecent, { projectId }),
        ),
        RecentProjectResultSchema,
      ),
    removeRecent: (projectId) =>
      invoke(
        IPC_CHANNELS.projectRemoveRecent,
        ProjectRemoveRecentCommandSchema.parse(
          envelope(APP_COMMANDS.projectRemoveRecent, { projectId }),
        ),
        RecentProjectRemovalResultSchema,
      ),
    getActive: () =>
      invoke(
        IPC_CHANNELS.getActive,
        ProjectGetActiveCommandSchema.parse(envelope(APP_COMMANDS.getActive, {})),
        ProjectActiveResultSchema,
      ),
    create: (input) =>
      invoke(
        IPC_CHANNELS.create,
        ProjectCreateCommandSchema.parse(envelope(APP_COMMANDS.create, input)),
        ProjectWorkspaceResultSchema,
      ),
    openSelected: () =>
      invoke(
        IPC_CHANNELS.openSelected,
        ProjectOpenSelectedCommandSchema.parse(envelope(APP_COMMANDS.openSelected, {})),
        ProjectWorkspaceResultSchema,
      ),
    openRecent: (projectId) =>
      invoke(
        IPC_CHANNELS.openRecent,
        ProjectOpenRecentCommandSchema.parse(envelope(APP_COMMANDS.openRecent, { projectId })),
        ProjectWorkspaceResultSchema,
      ),
    close: (projectId) =>
      invoke(
        IPC_CHANNELS.close,
        ProjectCloseCommandSchema.parse(envelope(APP_COMMANDS.close, { projectId })),
        ProjectCloseCommandResultSchema,
      ),
    move: (projectId) =>
      invoke(
        IPC_CHANNELS.move,
        ProjectMoveCommandSchema.parse(envelope(APP_COMMANDS.move, { projectId })),
        ProjectMoveCommandResultSchema,
      ),
  },
  planning: {
    listStructure: (projectId) =>
      invoke(
        IPC_CHANNELS.listStructure,
        ProjectListStructureCommandSchema.parse(
          envelope(APP_COMMANDS.listStructure, { projectId }),
        ),
        ProjectStructureResultSchema,
      ),
    createVolume: (input) =>
      invoke(
        IPC_CHANNELS.createVolume,
        ProjectCreateVolumeCommandSchema.parse(envelope(APP_COMMANDS.createVolume, input)),
        ProjectStructureResultSchema,
      ),
    updateVolume: (input) =>
      invoke(
        IPC_CHANNELS.updateVolume,
        ProjectUpdateVolumeCommandSchema.parse(envelope(APP_COMMANDS.updateVolume, input)),
        ProjectStructureResultSchema,
      ),
    moveVolume: (input) =>
      invoke(
        IPC_CHANNELS.moveVolume,
        ProjectMoveVolumeCommandSchema.parse(envelope(APP_COMMANDS.moveVolume, input)),
        ProjectStructureResultSchema,
      ),
    deleteVolume: (input) =>
      invoke(
        IPC_CHANNELS.deleteVolume,
        ProjectDeleteVolumeCommandSchema.parse(envelope(APP_COMMANDS.deleteVolume, input)),
        ProjectStructureResultSchema,
      ),
    createChapter: (input) =>
      invoke(
        IPC_CHANNELS.createChapter,
        ProjectCreateChapterCommandSchema.parse(envelope(APP_COMMANDS.createChapter, input)),
        ProjectStructureResultSchema,
      ),
    updateChapter: (input) =>
      invoke(
        IPC_CHANNELS.updateChapter,
        ProjectUpdateChapterCommandSchema.parse(envelope(APP_COMMANDS.updateChapter, input)),
        ProjectStructureResultSchema,
      ),
    moveChapter: (input) =>
      invoke(
        IPC_CHANNELS.moveChapter,
        ProjectMoveChapterCommandSchema.parse(envelope(APP_COMMANDS.moveChapter, input)),
        ProjectStructureResultSchema,
      ),
    deleteChapter: (input) =>
      invoke(
        IPC_CHANNELS.deleteChapter,
        ProjectDeleteChapterCommandSchema.parse(envelope(APP_COMMANDS.deleteChapter, input)),
        ProjectStructureResultSchema,
      ),
  },
  trash: {
    list: (projectId) =>
      invoke(
        IPC_CHANNELS.listTrash,
        ProjectListTrashCommandSchema.parse(envelope(APP_COMMANDS.listTrash, { projectId })),
        ProjectTrashEntriesResultSchema,
      ),
    restore: (input) =>
      invoke(
        IPC_CHANNELS.restoreTrashEntry,
        ProjectRestoreTrashEntryCommandSchema.parse(
          envelope(APP_COMMANDS.restoreTrashEntry, input),
        ),
        ProjectStructureResultSchema,
      ),
  },
  draft: {
    open: (input) =>
      invoke(
        IPC_CHANNELS.openDraft,
        DraftOpenCommandSchema.parse(envelope(APP_COMMANDS.openDraft, input)),
        DraftDocumentResultSchema,
      ),
    applyPatch: (input) =>
      invoke(
        IPC_CHANNELS.applyPatch,
        DraftApplyPatchCommandSchema.parse(envelope(APP_COMMANDS.applyPatch, input)),
        DraftDocumentResultSchema,
      ),
    saveSnapshot: (input) =>
      invoke(
        IPC_CHANNELS.saveDraftSnapshot,
        DraftSaveSnapshotCommandSchema.parse(envelope(APP_COMMANDS.saveDraftSnapshot, input)),
        DraftDocumentResultSchema,
      ),
  },
  ai: {
    setCredential: (providerId, credential) =>
      invoke(
        IPC_CHANNELS.aiSetCredential,
        AiSetCredentialCommandSchema.parse(
          envelope(APP_COMMANDS.setCredential, { providerId, credential }),
        ),
        CredentialReferenceResultSchema,
      ),
    removeCredential: (credentialRef) =>
      invoke(
        IPC_CHANNELS.aiRemoveCredential,
        AiRemoveCredentialCommandSchema.parse(
          envelope(APP_COMMANDS.removeCredential, { credentialRef }),
        ),
        CredentialPresenceResultSchema,
      ),
    hasCredential: (credentialRef) =>
      invoke(
        IPC_CHANNELS.aiHasCredential,
        AiHasCredentialCommandSchema.parse(envelope(APP_COMMANDS.hasCredential, { credentialRef })),
        CredentialPresenceResultSchema,
      ),
  },
  task: {
    getSnapshot: (taskId, projectId) =>
      invoke(
        IPC_CHANNELS.taskGetSnapshot,
        TaskGetSnapshotCommandSchema.parse(
          envelope(APP_COMMANDS.taskGetSnapshot, { taskId }, projectId),
        ),
        TaskSnapshotResultSchema,
      ),
    cancel: (taskId, projectId) =>
      invoke(
        IPC_CHANNELS.taskCancel,
        TaskCancelCommandSchema.parse(envelope(APP_COMMANDS.taskCancel, { taskId }, projectId)),
        TaskCancelResultSchema,
      ),
    listActive: (projectId) =>
      invoke(
        IPC_CHANNELS.taskListActive,
        TaskListActiveCommandSchema.parse(envelope(APP_COMMANDS.taskListActive, {}, projectId)),
        TaskListActiveResultSchema,
      ),
    subscribe: (listener, projectId) => {
      const channel = new MessageChannelConstructor();
      const cursor = new TaskEventCursor();
      const recoveries = new Set<string>();
      let closed = false;

      channel.port1.onmessage = ({ data }) => {
        const parsed = TaskEventEnvelopeSchema.safeParse(data);
        if (!parsed.success || closed) return;
        const acknowledge = () =>
          channel.port1.postMessage(
            TaskEventAckSchema.parse({
              protocolVersion: PROTOCOL_VERSION,
              type: 'task.ack',
              eventId: parsed.data.eventId,
            }),
          );
        const disposition = cursor.accept(parsed.data);
        if (disposition.kind === 'accepted') {
          try {
            listener({ kind: 'event', event: parsed.data });
          } finally {
            acknowledge();
          }
          return;
        }
        if (disposition.kind !== 'gap' || recoveries.has(parsed.data.taskId)) {
          acknowledge();
          return;
        }

        recoveries.add(parsed.data.taskId);
        void bridge.task
          .getSnapshot(parsed.data.taskId, parsed.data.projectId)
          .then((result) => {
            if (!result.ok || closed) return;
            cursor.restore(result.data);
            listener({ kind: 'snapshot', snapshot: result.data, reason: 'sequence-gap' });
          })
          .finally(() => recoveries.delete(parsed.data.taskId));
        acknowledge();
      };
      channel.port1.start();
      ipcRenderer.postMessage(
        IPC_CHANNELS.taskConnectEvents,
        TaskPortConnectSchema.parse({
          protocolVersion: PROTOCOL_VERSION,
          connectionId: globalThis.crypto.randomUUID(),
          ...(projectId ? { projectId } : {}),
        }),
        [channel.port2 as never],
      );

      return () => {
        if (closed) return;
        closed = true;
        recoveries.clear();
        channel.port1.onmessage = null;
        channel.port1.close();
      };
    },
  },
};

contextBridge.exposeInMainWorld('worldforge', bridge);

export const preloadLayer = {
  name: '@worldforge/preload',
  responsibility: 'validated-minimal-renderer-bridge',
} as const;
