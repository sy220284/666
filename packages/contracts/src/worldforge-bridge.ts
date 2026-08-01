import type { ErrorCode } from './error-codes.js';
import type { ModelSupportProfile } from './ai-output-protocol.js';
import type { AppSettingsSnapshot, AppSettingsUpdate, RecentProject } from './app-data.js';
import type {
  ProviderConnectionTestResult,
  ProviderSaveInput,
  ProviderSummary,
} from './provider.js';
import type {
  GenerationCancelInput,
  GenerationListRunsInput,
  GenerationModelSupportInput,
  GenerationPartialInput,
  GenerationRun,
  GenerationStartInput,
} from './generation.js';
import {
  ProjectIdSchema,
  TaskEventEnvelopeSchema,
  type TaskSnapshot,
} from './task-protocol.js';
import type { RendererLifecycleBridge } from './renderer-shutdown.js';
import type {
  ProjectCloseResult,
  ProjectContinuationInput,
  ProjectContinuationSnapshot,
  ProjectCreateInput,
  ProjectMoveResult,
  ProjectWorkspaceSummary,
} from './project-workspace.js';
import type {
  ChapterCreateInput,
  ChapterDeleteInput,
  ChapterMoveInput,
  ChapterSplitExecuteInput,
  ChapterSplitPreviewInput,
  ChapterUpdateInput,
  ChaptersMergeExecuteInput,
  ChaptersMergePreviewInput,
  CrossChapterMoveExecuteInput,
  CrossChapterMovePreviewInput,
  ProjectStructure,
  StructureOperationPreview,
  StructureOperationResult,
  TrashEntry,
  TrashPermanentDeleteInput,
  TrashPermanentDeletePreview,
  TrashPermanentDeletePreviewInput,
  TrashPermanentDeleteResult,
  TrashRestoreInput,
  VolumeCreateInput,
  VolumeDeleteInput,
  VolumeMoveInput,
  VolumeUpdateInput,
} from './project-structure.js';
import type {
  PlotNodeCreateInput,
  PlotNodeDeleteInput,
  PlotNodeList,
  PlotNodeMoveInput,
  PlotNodeUpdateInput,
  ProjectBrief,
  ProjectBriefUpdateInput,
} from './project-planning.js';
import type {
  SceneBeatConvertBlocksInput,
  SceneBeatCreateInput,
  SceneBeatCrossChapterMoveInput,
  SceneBeatCrossChapterMovePreview,
  SceneBeatCrossChapterMovePreviewInput,
  SceneBeatDeleteInput,
  SceneBeatList,
  SceneBeatListInput,
  SceneBeatMoveInput,
  SceneBeatRestoreInput,
  SceneBeatSetBlockLinksInput,
  SceneBeatUpdateInput,
} from './scene-beat.js';
import type {
  CanonFactSetInput,
  EntityArchiveInput,
  EntityCatalog,
  EntityCreateInput,
  EntityDeleteInput,
  EntityDeletePreview,
  EntityDeletePreviewInput,
  EntityDeleteResult,
  EntityListInput,
  EntityUpdateInput,
  SceneBeatEntityLinkInput,
} from './entity-canon.js';
import type { DraftApplyPatchInput, DraftDocument, DraftOpenInput } from './draft.js';
import type {
  VersionCreateInput,
  VersionDocument,
  VersionGetInput,
  VersionList,
  VersionRestoreInput,
  VersionSetFinalInput,
  VersionSummary,
} from './version.js';
import type {
  BackupCleanupPreview,
  BackupPolicy,
  BackupRecord,
  RecoveryCleanupApplyInput,
  RecoveryCleanupResult,
  RecoveryCreateInput,
  RecoveryDailyBackupInput,
  RecoveryExportInput,
  RecoveryNamedSnapshotInput,
  RecoveryOverview,
  RecoveryPolicyUpdateInput,
  RecoveryProtectionInput,
  RecoveryRestoredProject,
  RecoveryRestoreInput,
  RecoveryVersionExport,
} from './recovery.js';
import type {
  ExportVersionCatalog,
  ExportVersionsInput,
  ExportVersionsResult,
  ImportCommitInput,
  ImportCommitResult,
  ImportPlan,
  ImportPreviewInput,
} from './import-export.js';
import type {
  AppInfo,
  AppearancePreferences,
  CommandResult,
  CoreOperation,
  CoreStatus,
  DiagnosticExport,
  DiagnosticPreview,
  TaskCancelData,
  TaskListActiveData,
  TaskStreamUpdate,
  WindowPreferences,
} from './app-runtime-contracts.js';

export interface WorldforgeBridge {
  readonly lifecycle: RendererLifecycleBridge;
  readonly app: {
    readonly getInfo: () => Promise<CommandResult<AppInfo>>;
    readonly getCoreStatus: () => Promise<CommandResult<CoreStatus>>;
    readonly restartCore: () => Promise<CommandResult<CoreOperation>>;
    readonly getWindowPreferences: () => Promise<CommandResult<WindowPreferences>>;
    readonly setAppearancePreferences: (
      preferences: AppearancePreferences,
    ) => Promise<CommandResult<WindowPreferences>>;
    readonly previewDiagnostics: () => Promise<CommandResult<DiagnosticPreview>>;
    readonly exportDiagnostics: () => Promise<CommandResult<DiagnosticExport>>;
  };
  readonly settings: {
    readonly get: () => Promise<CommandResult<AppSettingsSnapshot>>;
    readonly set: (settings: AppSettingsUpdate) => Promise<CommandResult<AppSettingsSnapshot>>;
    readonly reset: () => Promise<CommandResult<AppSettingsSnapshot>>;
  };
  readonly project: {
    readonly listRecent: () => Promise<CommandResult<{ readonly projects: RecentProject[] }>>;
    readonly relocateRecent: (projectId: string) => Promise<CommandResult<RecentProject>>;
    readonly removeRecent: (
      projectId: string,
    ) => Promise<CommandResult<{ readonly removed: boolean }>>;
    readonly getActive: () => Promise<CommandResult<ProjectWorkspaceSummary | null>>;
    readonly getContinuation: (
      projectId: string,
    ) => Promise<CommandResult<ProjectContinuationSnapshot | null>>;
    readonly saveContinuation: (
      input: ProjectContinuationInput,
    ) => Promise<CommandResult<ProjectContinuationSnapshot>>;
    readonly create: (input: ProjectCreateInput) => Promise<CommandResult<ProjectWorkspaceSummary>>;
    readonly openSelected: () => Promise<CommandResult<ProjectWorkspaceSummary>>;
    readonly openRecent: (projectId: string) => Promise<CommandResult<ProjectWorkspaceSummary>>;
    readonly close: (projectId: string) => Promise<CommandResult<ProjectCloseResult>>;
    readonly move: (projectId: string) => Promise<CommandResult<ProjectMoveResult>>;
  };
  readonly recovery: {
    readonly createCheckpoint: (input: RecoveryCreateInput) => Promise<CommandResult<BackupRecord>>;
    readonly createDailyBackup: (
      input: RecoveryDailyBackupInput,
    ) => Promise<CommandResult<BackupRecord>>;
    readonly createNamedSnapshot: (
      input: RecoveryNamedSnapshotInput,
    ) => Promise<CommandResult<BackupRecord>>;
    readonly getOverview: (projectId: string) => Promise<CommandResult<RecoveryOverview>>;
    readonly updatePolicy: (
      input: RecoveryPolicyUpdateInput,
    ) => Promise<CommandResult<BackupPolicy>>;
    readonly setProtection: (
      input: RecoveryProtectionInput,
    ) => Promise<CommandResult<BackupRecord>>;
    readonly previewCleanup: (projectId: string) => Promise<CommandResult<BackupCleanupPreview>>;
    readonly applyCleanup: (
      input: RecoveryCleanupApplyInput,
    ) => Promise<CommandResult<RecoveryCleanupResult>>;
    readonly restoreCheckpoint: (
      input: RecoveryRestoreInput,
    ) => Promise<CommandResult<RecoveryRestoredProject>>;
    readonly exportVersion: (
      input: RecoveryExportInput,
    ) => Promise<CommandResult<RecoveryVersionExport>>;
  };
  readonly textIo: {
    readonly previewImport: (input: ImportPreviewInput) => Promise<CommandResult<ImportPlan>>;
    readonly commitImport: (input: ImportCommitInput) => Promise<CommandResult<ImportCommitResult>>;
    readonly listExportVersions: (
      projectId: string,
    ) => Promise<CommandResult<ExportVersionCatalog>>;
    readonly exportVersions: (
      input: ExportVersionsInput,
    ) => Promise<CommandResult<ExportVersionsResult>>;
  };
  readonly planning: {
    readonly getBrief: (projectId: string) => Promise<CommandResult<ProjectBrief>>;
    readonly updateBrief: (input: ProjectBriefUpdateInput) => Promise<CommandResult<ProjectBrief>>;
    readonly listPlotNodes: (projectId: string) => Promise<CommandResult<PlotNodeList>>;
    readonly createPlotNode: (input: PlotNodeCreateInput) => Promise<CommandResult<PlotNodeList>>;
    readonly updatePlotNode: (input: PlotNodeUpdateInput) => Promise<CommandResult<PlotNodeList>>;
    readonly movePlotNode: (input: PlotNodeMoveInput) => Promise<CommandResult<PlotNodeList>>;
    readonly deletePlotNode: (input: PlotNodeDeleteInput) => Promise<CommandResult<PlotNodeList>>;
    readonly listSceneBeats: (input: SceneBeatListInput) => Promise<CommandResult<SceneBeatList>>;
    readonly createSceneBeat: (
      input: SceneBeatCreateInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly updateSceneBeat: (
      input: SceneBeatUpdateInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly moveSceneBeat: (input: SceneBeatMoveInput) => Promise<CommandResult<SceneBeatList>>;
    readonly previewMoveSceneBeat: (
      input: SceneBeatCrossChapterMovePreviewInput,
    ) => Promise<CommandResult<SceneBeatCrossChapterMovePreview>>;
    readonly moveSceneBeatAcrossChapters: (
      input: SceneBeatCrossChapterMoveInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly deleteSceneBeat: (
      input: SceneBeatDeleteInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly restoreSceneBeat: (
      input: SceneBeatRestoreInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly setSceneBeatBlockLinks: (
      input: SceneBeatSetBlockLinksInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly convertBlocksToSceneBeat: (
      input: SceneBeatConvertBlocksInput,
    ) => Promise<CommandResult<SceneBeatList>>;
    readonly listStructure: (projectId: string) => Promise<CommandResult<ProjectStructure>>;
    readonly createVolume: (input: VolumeCreateInput) => Promise<CommandResult<ProjectStructure>>;
    readonly updateVolume: (input: VolumeUpdateInput) => Promise<CommandResult<ProjectStructure>>;
    readonly moveVolume: (input: VolumeMoveInput) => Promise<CommandResult<ProjectStructure>>;
    readonly deleteVolume: (input: VolumeDeleteInput) => Promise<CommandResult<ProjectStructure>>;
    readonly createChapter: (input: ChapterCreateInput) => Promise<CommandResult<ProjectStructure>>;
    readonly updateChapter: (input: ChapterUpdateInput) => Promise<CommandResult<ProjectStructure>>;
    readonly moveChapter: (input: ChapterMoveInput) => Promise<CommandResult<ProjectStructure>>;
    readonly deleteChapter: (input: ChapterDeleteInput) => Promise<CommandResult<ProjectStructure>>;
    readonly previewSplitChapter: (
      input: ChapterSplitPreviewInput,
    ) => Promise<CommandResult<StructureOperationPreview>>;
    readonly splitChapter: (
      input: ChapterSplitExecuteInput,
    ) => Promise<CommandResult<StructureOperationResult>>;
    readonly previewMergeChapters: (
      input: ChaptersMergePreviewInput,
    ) => Promise<CommandResult<StructureOperationPreview>>;
    readonly mergeChapters: (
      input: ChaptersMergeExecuteInput,
    ) => Promise<CommandResult<StructureOperationResult>>;
    readonly previewMoveBlocks: (
      input: CrossChapterMovePreviewInput,
    ) => Promise<CommandResult<StructureOperationPreview>>;
    readonly moveBlocks: (
      input: CrossChapterMoveExecuteInput,
    ) => Promise<CommandResult<StructureOperationResult>>;
  };
  readonly canon: {
    readonly list: (input: EntityListInput) => Promise<CommandResult<EntityCatalog>>;
    readonly create: (input: EntityCreateInput) => Promise<CommandResult<EntityCatalog>>;
    readonly update: (input: EntityUpdateInput) => Promise<CommandResult<EntityCatalog>>;
    readonly archive: (input: EntityArchiveInput) => Promise<CommandResult<EntityCatalog>>;
    readonly setFact: (input: CanonFactSetInput) => Promise<CommandResult<EntityCatalog>>;
    readonly linkSceneBeat: (
      input: SceneBeatEntityLinkInput,
    ) => Promise<CommandResult<EntityCatalog>>;
    readonly previewDelete: (
      input: EntityDeletePreviewInput,
    ) => Promise<CommandResult<EntityDeletePreview>>;
    readonly delete: (input: EntityDeleteInput) => Promise<CommandResult<EntityDeleteResult>>;
  };
  readonly trash: {
    readonly list: (
      projectId: string,
    ) => Promise<CommandResult<{ readonly entries: TrashEntry[] }>>;
    readonly restore: (input: TrashRestoreInput) => Promise<CommandResult<ProjectStructure>>;
    readonly previewPermanentDelete: (
      input: TrashPermanentDeletePreviewInput,
    ) => Promise<CommandResult<TrashPermanentDeletePreview>>;
    readonly permanentDelete: (
      input: TrashPermanentDeleteInput,
    ) => Promise<CommandResult<TrashPermanentDeleteResult>>;
  };
  readonly draft: {
    readonly open: (input: DraftOpenInput) => Promise<CommandResult<DraftDocument>>;
    readonly applyPatch: (input: DraftApplyPatchInput) => Promise<CommandResult<DraftDocument>>;
  };
  readonly version: {
    readonly create: (input: VersionCreateInput) => Promise<CommandResult<VersionDocument>>;
    readonly list: (projectId: string, chapterId: string) => Promise<CommandResult<VersionList>>;
    readonly get: (input: VersionGetInput) => Promise<CommandResult<VersionDocument>>;
    readonly setFinal: (input: VersionSetFinalInput) => Promise<CommandResult<VersionSummary>>;
    readonly restore: (input: VersionRestoreInput) => Promise<CommandResult<DraftDocument>>;
  };
  readonly providers: {
    readonly list: () => Promise<CommandResult<{ readonly providers: ProviderSummary[] }>>;
    readonly save: (input: ProviderSaveInput) => Promise<CommandResult<ProviderSummary>>;
    readonly remove: (providerId: string) => Promise<CommandResult<{ readonly removed: boolean }>>;
    readonly testConnection: (
      providerId: string,
    ) => Promise<CommandResult<ProviderConnectionTestResult>>;
  };
  readonly generation: {
    readonly start: (
      input: GenerationStartInput,
    ) => Promise<CommandResult<{ readonly run: GenerationRun; readonly taskId: string }>>;
    readonly getRun: (projectId: string, runId: string) => Promise<CommandResult<GenerationRun>>;
    readonly listRuns: (
      input: GenerationListRunsInput,
    ) => Promise<CommandResult<{ readonly runs: readonly GenerationRun[] }>>;
    readonly cancel: (input: GenerationCancelInput) => Promise<CommandResult<GenerationRun>>;
    readonly savePartial: (
      input: GenerationPartialInput,
    ) => Promise<
      CommandResult<{ readonly run: GenerationRun; readonly candidateId: string | null }>
    >;
    readonly discardPartial: (
      input: GenerationPartialInput,
    ) => Promise<
      CommandResult<{ readonly run: GenerationRun; readonly candidateId: string | null }>
    >;
    readonly getModelSupport: (
      input: GenerationModelSupportInput,
    ) => Promise<CommandResult<{ readonly profile: ModelSupportProfile }>>;
  };
  readonly ai: {
    readonly setCredential: (
      providerId: string,
      credential: string,
    ) => Promise<CommandResult<{ readonly credentialRef: string }>>;
    readonly removeCredential: (
      credentialRef: string,
    ) => Promise<CommandResult<{ readonly exists: boolean }>>;
    readonly hasCredential: (
      credentialRef: string,
    ) => Promise<CommandResult<{ readonly exists: boolean }>>;
  };
  readonly task: {
    readonly getSnapshot: (
      taskId: string,
      projectId?: string,
    ) => Promise<CommandResult<TaskSnapshot>>;
    readonly cancel: (taskId: string, projectId?: string) => Promise<CommandResult<TaskCancelData>>;
    readonly listActive: (projectId?: string) => Promise<CommandResult<TaskListActiveData>>;
    readonly subscribe: (
      listener: (update: TaskStreamUpdate) => void,
      projectId?: string,
    ) => () => void;
  };
}

export type StableErrorCode = ErrorCode;
export const ProtocolProjectIdSchema = ProjectIdSchema;
export const ProtocolTaskEventSchema = TaskEventEnvelopeSchema;
