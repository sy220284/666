import { z } from 'zod';

import {
  APP_DATA_COMMANDS,
  APP_DATA_IPC_CHANNELS,
  ProjectListRecentCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  SettingsGetCommandSchema,
  SettingsResetCommandSchema,
  SettingsSetCommandSchema,
} from './app-data.js';
import {
  PROVIDER_COMMANDS,
  PROVIDER_IPC_CHANNELS,
  ProviderListCommandSchema,
  ProviderRemoveCommandSchema,
  ProviderSaveCommandSchema,
  ProviderTestConnectionCommandSchema,
} from './provider.js';
import {
  TASK_PROTOCOL_VERSION,
  TaskCancelCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskListActiveCommandSchema,
} from './task-protocol.js';
import {
  PROJECT_WORKSPACE_COMMANDS,
  PROJECT_WORKSPACE_IPC_CHANNELS,
  ProjectCloseCommandSchema,
  ProjectCreateCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectGetContinuationCommandSchema,
  ProjectMoveCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectSaveContinuationCommandSchema,
} from './project-workspace.js';
import {
  PROJECT_STRUCTURE_COMMANDS,
  PROJECT_STRUCTURE_IPC_CHANNELS,
  ProjectCreateChapterCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectUpdateVolumeCommandSchema,
} from './project-structure.js';
import {
  PROJECT_PLANNING_COMMANDS,
  PROJECT_PLANNING_IPC_CHANNELS,
  ProjectCreatePlotNodeCommandSchema,
  ProjectDeletePlotNodeCommandSchema,
  ProjectGetBriefCommandSchema,
  ProjectListPlotNodesCommandSchema,
  ProjectMovePlotNodeCommandSchema,
  ProjectUpdateBriefCommandSchema,
  ProjectUpdatePlotNodeCommandSchema,
} from './project-planning.js';
import {
  SCENE_BEAT_COMMANDS,
  SCENE_BEAT_IPC_CHANNELS,
  SceneBeatConvertBlocksCommandSchema,
  SceneBeatCreateCommandSchema,
  SceneBeatDeleteCommandSchema,
  SceneBeatListCommandSchema,
  SceneBeatMoveAcrossChaptersCommandSchema,
  SceneBeatMoveCommandSchema,
  SceneBeatPreviewCrossChapterMoveCommandSchema,
  SceneBeatRestoreCommandSchema,
  SceneBeatSetBlockLinksCommandSchema,
  SceneBeatUpdateCommandSchema,
} from './scene-beat.js';
import {
  ENTITY_CANON_COMMANDS,
  ENTITY_CANON_IPC_CHANNELS,
  CanonFactSetCommandSchema,
  EntityArchiveCommandSchema,
  EntityCreateCommandSchema,
  EntityDeleteCommandSchema,
  EntityDeletePreviewCommandSchema,
  EntityListCommandSchema,
  EntityUpdateCommandSchema,
  SceneBeatEntityLinkCommandSchema,
} from './entity-canon.js';
import {
  DRAFT_COMMANDS,
  DRAFT_IPC_CHANNELS,
  DraftApplyPatchCommandSchema,
  DraftOpenCommandSchema,
} from './draft.js';
import { VERSION_COMMANDS, VERSION_IPC_CHANNELS } from './version.js';
import { RECOVERY_COMMANDS, RECOVERY_IPC_CHANNELS } from './recovery.js';
import {
  TEXT_IO_COMMANDS,
  TEXT_IO_IPC_CHANNELS,
  ExportVersionListCommandSchema,
  ExportVersionsCommandSchema,
  ImportCommitCommandSchema,
  ImportPreviewCommandSchema,
} from './import-export.js';

export const contractsLayer = {
  name: '@worldforge/contracts',
  responsibility: 'cross-process-schemas-and-types',
} as const;

export const PROTOCOL_VERSION = TASK_PROTOCOL_VERSION;

export const IPC_CHANNELS = {
  ...APP_DATA_IPC_CHANNELS,
  ...PROVIDER_IPC_CHANNELS,
  ...PROJECT_WORKSPACE_IPC_CHANNELS,
  ...PROJECT_STRUCTURE_IPC_CHANNELS,
  ...PROJECT_PLANNING_IPC_CHANNELS,
  ...SCENE_BEAT_IPC_CHANNELS,
  ...ENTITY_CANON_IPC_CHANNELS,
  ...DRAFT_IPC_CHANNELS,
  ...VERSION_IPC_CHANNELS,
  ...RECOVERY_IPC_CHANNELS,
  ...TEXT_IO_IPC_CHANNELS,
  appGetInfo: 'worldforge:app:get-info',
  appGetCoreStatus: 'worldforge:app:get-core-status',
  appRestartCore: 'worldforge:app:restart-core',
  appGetWindowPreferences: 'worldforge:app:get-window-preferences',
  appSetAppearancePreferences: 'worldforge:app:set-appearance-preferences',
  appPreviewDiagnostics: 'worldforge:app:preview-diagnostics',
  appExportDiagnostics: 'worldforge:app:export-diagnostics',
  aiSetCredential: 'worldforge:ai:set-credential',
  aiRemoveCredential: 'worldforge:ai:remove-credential',
  aiHasCredential: 'worldforge:ai:has-credential',
  taskGetSnapshot: 'worldforge:task:get-snapshot',
  taskCancel: 'worldforge:task:cancel',
  taskListActive: 'worldforge:task:list-active',
  taskConnectEvents: 'worldforge:task:connect-events',
} as const;

export const APP_COMMANDS = {
  ...APP_DATA_COMMANDS,
  ...PROVIDER_COMMANDS,
  ...PROJECT_WORKSPACE_COMMANDS,
  ...PROJECT_STRUCTURE_COMMANDS,
  ...PROJECT_PLANNING_COMMANDS,
  ...SCENE_BEAT_COMMANDS,
  ...ENTITY_CANON_COMMANDS,
  ...DRAFT_COMMANDS,
  ...VERSION_COMMANDS,
  ...RECOVERY_COMMANDS,
  ...TEXT_IO_COMMANDS,
  getInfo: 'app.getInfo',
  getCoreStatus: 'app.getCoreStatus',
  restartCore: 'app.restartCore',
  getWindowPreferences: 'app.getWindowPreferences',
  setAppearancePreferences: 'app.setAppearancePreferences',
  previewDiagnostics: 'app.previewDiagnostics',
  exportDiagnostics: 'app.exportDiagnostics',
  setCredential: 'ai.provider.setCredential',
  removeCredential: 'ai.provider.removeCredential',
  hasCredential: 'ai.provider.hasCredential',
  taskGetSnapshot: 'task.getSnapshot',
  taskCancel: 'task.cancel',
  taskListActive: 'task.listActive',
} as const;

export const RequestIdSchema = z.uuid();
export const EmptyPayloadSchema = z.strictObject({});
export const ProviderIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/);
export const CredentialRefSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^cred_[0-9a-f-]{36}$/);

export const WorkspaceAlignmentSchema = z.enum(['center', 'left', 'right']);
export const ContentWidthPreferenceSchema = z.enum(['narrow', 'normal', 'wide', 'adaptive']);
export const UiScalePercentSchema = z
  .number()
  .int()
  .min(90)
  .max(150)
  .refine((value) => value % 10 === 0, 'UI scale must use 10% steps.');
export const AppearancePreferencesSchema = z.strictObject({
  workspaceAlignment: WorkspaceAlignmentSchema,
  uiScalePercent: UiScalePercentSchema,
  bodyFontSize: z.number().int().min(14).max(28),
  contentWidth: ContentWidthPreferenceSchema,
});
export const WindowBoundsDipSchema = z.strictObject({
  x: z.number().int().min(-100_000).max(100_000),
  y: z.number().int().min(-100_000).max(100_000),
  width: z.number().int().min(320).max(16_384),
  height: z.number().int().min(240).max(16_384),
});
export const WindowPreferencesSchema = AppearancePreferencesSchema.extend({
  displayId: z.string().min(1).max(128),
  boundsDip: WindowBoundsDipSchema,
  scaleFactor: z.number().finite().min(0.5).max(8),
  maximized: z.boolean(),
}).strict();

export const DEFAULT_APPEARANCE_PREFERENCES = {
  workspaceAlignment: 'center',
  uiScalePercent: 100,
  bodyFontSize: 18,
  contentWidth: 'normal',
} as const satisfies z.infer<typeof AppearancePreferencesSchema>;

const envelopeBase = {
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: RequestIdSchema,
  sentAt: z.iso.datetime(),
};

export const AppGetInfoCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getInfo),
  payload: EmptyPayloadSchema,
});

export const AppGetCoreStatusCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getCoreStatus),
  payload: EmptyPayloadSchema,
});

export const AppRestartCoreCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.restartCore),
  payload: EmptyPayloadSchema,
});

export const AppGetWindowPreferencesCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.getWindowPreferences),
  payload: EmptyPayloadSchema,
});

export const AppSetAppearancePreferencesCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.setAppearancePreferences),
  payload: AppearancePreferencesSchema,
});

export const AppPreviewDiagnosticsCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.previewDiagnostics),
  payload: EmptyPayloadSchema,
});

export const AppExportDiagnosticsCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.exportDiagnostics),
  payload: z.strictObject({ confirmation: z.literal(true) }),
});

export const AiSetCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.setCredential),
  payload: z.strictObject({
    providerId: ProviderIdSchema,
    credential: z.string().min(1).max(32_768),
  }),
});

export const AiRemoveCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.removeCredential),
  payload: z.strictObject({ credentialRef: CredentialRefSchema }),
});

export const AiHasCredentialCommandSchema = z.strictObject({
  ...envelopeBase,
  command: z.literal(APP_COMMANDS.hasCredential),
  payload: z.strictObject({ credentialRef: CredentialRefSchema }),
});

export const RegisteredCommandSchema = z.discriminatedUnion('command', [
  AppGetInfoCommandSchema,
  AppGetCoreStatusCommandSchema,
  AppRestartCoreCommandSchema,
  AppGetWindowPreferencesCommandSchema,
  AppSetAppearancePreferencesCommandSchema,
  AppPreviewDiagnosticsCommandSchema,
  AppExportDiagnosticsCommandSchema,
  SettingsGetCommandSchema,
  SettingsSetCommandSchema,
  SettingsResetCommandSchema,
  ProjectListRecentCommandSchema,
  ProjectRelocateRecentCommandSchema,
  ProjectRemoveRecentCommandSchema,
  ProviderListCommandSchema,
  ProviderSaveCommandSchema,
  ProviderRemoveCommandSchema,
  ProviderTestConnectionCommandSchema,
  ProjectGetActiveCommandSchema,
  ProjectGetContinuationCommandSchema,
  ProjectSaveContinuationCommandSchema,
  ProjectCreateCommandSchema,
  ProjectOpenSelectedCommandSchema,
  ProjectOpenRecentCommandSchema,
  ProjectCloseCommandSchema,
  ProjectMoveCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectUpdateVolumeCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectCreateChapterCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectListTrashCommandSchema,
  ProjectRestoreTrashEntryCommandSchema,
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
  EntityListCommandSchema,
  EntityCreateCommandSchema,
  EntityUpdateCommandSchema,
  EntityArchiveCommandSchema,
  CanonFactSetCommandSchema,
  SceneBeatEntityLinkCommandSchema,
  EntityDeletePreviewCommandSchema,
  EntityDeleteCommandSchema,
  DraftOpenCommandSchema,
  DraftApplyPatchCommandSchema,
  ImportPreviewCommandSchema,
  ImportCommitCommandSchema,
  ExportVersionListCommandSchema,
  ExportVersionsCommandSchema,
  AiSetCredentialCommandSchema,
  AiRemoveCredentialCommandSchema,
  AiHasCredentialCommandSchema,
  TaskGetSnapshotCommandSchema,
  TaskCancelCommandSchema,
  TaskListActiveCommandSchema,
]);
