import {
  APP_COMMANDS,
  IPC_CHANNELS,
  ProjectActiveResultSchema,
  ProjectCloseCommandResultSchema,
  ProjectCloseCommandSchema,
  ProjectContinuationResultSchema,
  ProjectContinuationSaveResultSchema,
  ProjectCreateCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectGetContinuationCommandSchema,
  ProjectListRecentCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectMoveCommandResultSchema,
  ProjectMoveCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectPermanentDeleteCommandSchema,
  ProjectPreviewPermanentDeleteCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectSaveContinuationCommandSchema,
  ProjectStructureResultSchema,
  ProjectTrashEntriesResultSchema,
  ProjectTrashPermanentDeletePreviewResultSchema,
  ProjectTrashPermanentDeleteResultSchema,
  ProjectWorkspaceResultSchema,
  RecentProjectRemovalResultSchema,
  RecentProjectResultSchema,
  RecentProjectsResultSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { envelope, invoke } from './bridge-runtime.js';

export function createProjectBridge(): Pick<WorldforgeBridge, 'project' | 'trash'> {
  return {
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
      getContinuation: (projectId) =>
        invoke(
          IPC_CHANNELS.getContinuation,
          ProjectGetContinuationCommandSchema.parse(
            envelope(APP_COMMANDS.getContinuation, { projectId }),
          ),
          ProjectContinuationResultSchema,
        ),
      saveContinuation: (input) =>
        invoke(
          IPC_CHANNELS.saveContinuation,
          ProjectSaveContinuationCommandSchema.parse(
            envelope(APP_COMMANDS.saveContinuation, input),
          ),
          ProjectContinuationSaveResultSchema,
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
      previewPermanentDelete: (input) =>
        invoke(
          IPC_CHANNELS.previewPermanentDelete,
          ProjectPreviewPermanentDeleteCommandSchema.parse(
            envelope(APP_COMMANDS.previewPermanentDelete, input),
          ),
          ProjectTrashPermanentDeletePreviewResultSchema,
        ),
      permanentDelete: (input) =>
        invoke(
          IPC_CHANNELS.permanentDelete,
          ProjectPermanentDeleteCommandSchema.parse(envelope(APP_COMMANDS.permanentDelete, input)),
          ProjectTrashPermanentDeleteResultSchema,
        ),
    },
  };
}
