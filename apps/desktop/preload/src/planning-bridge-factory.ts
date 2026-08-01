import {
  APP_COMMANDS,
  CanonFactSetCommandSchema,
  EntityArchiveCommandSchema,
  EntityCatalogResultSchema,
  EntityCreateCommandSchema,
  EntityDeleteCommandSchema,
  EntityDeletePreviewCommandSchema,
  EntityDeletePreviewResultSchema,
  EntityDeleteResultEnvelopeSchema,
  EntityListCommandSchema,
  EntityUpdateCommandSchema,
  IPC_CHANNELS,
  ProjectBriefResultSchema,
  ProjectCreateChapterCommandSchema,
  ProjectCreatePlotNodeCommandSchema,
  ProjectCreateVolumeCommandSchema,
  ProjectDeleteChapterCommandSchema,
  ProjectDeletePlotNodeCommandSchema,
  ProjectDeleteVolumeCommandSchema,
  ProjectGetBriefCommandSchema,
  ProjectListPlotNodesCommandSchema,
  ProjectListStructureCommandSchema,
  ProjectMergeChaptersCommandSchema,
  ProjectMoveBlocksCommandSchema,
  ProjectMoveChapterCommandSchema,
  ProjectMovePlotNodeCommandSchema,
  ProjectMoveVolumeCommandSchema,
  ProjectPlotNodeListResultSchema,
  ProjectPreviewMergeChaptersCommandSchema,
  ProjectPreviewMoveBlocksCommandSchema,
  ProjectPreviewSplitChapterCommandSchema,
  ProjectSplitChapterCommandSchema,
  ProjectStructureOperationPreviewResultSchema,
  ProjectStructureOperationResultSchema,
  ProjectStructureResultSchema,
  ProjectUpdateBriefCommandSchema,
  ProjectUpdateChapterCommandSchema,
  ProjectUpdatePlotNodeCommandSchema,
  ProjectUpdateVolumeCommandSchema,
  SceneBeatConvertBlocksCommandSchema,
  SceneBeatCreateCommandSchema,
  SceneBeatDeleteCommandSchema,
  SceneBeatEntityLinkCommandSchema,
  SceneBeatListCommandSchema,
  SceneBeatListResultSchema,
  SceneBeatMoveAcrossChaptersCommandSchema,
  SceneBeatMoveCommandSchema,
  SceneBeatMovePreviewResultSchema,
  SceneBeatPreviewCrossChapterMoveCommandSchema,
  SceneBeatRestoreCommandSchema,
  SceneBeatSetBlockLinksCommandSchema,
  SceneBeatUpdateCommandSchema,
  type WorldforgeBridge,
} from '@worldforge/contracts';
import { envelope, invoke } from './bridge-runtime.js';

export function createPlanningBridge(): Pick<WorldforgeBridge, 'planning' | 'canon'> {
  return {
    planning: {
      getBrief: (projectId) =>
        invoke(
          IPC_CHANNELS.getBrief,
          ProjectGetBriefCommandSchema.parse(envelope(APP_COMMANDS.getBrief, { projectId })),
          ProjectBriefResultSchema,
        ),
      updateBrief: (input) =>
        invoke(
          IPC_CHANNELS.updateBrief,
          ProjectUpdateBriefCommandSchema.parse(envelope(APP_COMMANDS.updateBrief, input)),
          ProjectBriefResultSchema,
        ),
      listPlotNodes: (projectId) =>
        invoke(
          IPC_CHANNELS.listPlotNodes,
          ProjectListPlotNodesCommandSchema.parse(
            envelope(APP_COMMANDS.listPlotNodes, { projectId }),
          ),
          ProjectPlotNodeListResultSchema,
        ),
      createPlotNode: (input) =>
        invoke(
          IPC_CHANNELS.createPlotNode,
          ProjectCreatePlotNodeCommandSchema.parse(envelope(APP_COMMANDS.createPlotNode, input)),
          ProjectPlotNodeListResultSchema,
        ),
      updatePlotNode: (input) =>
        invoke(
          IPC_CHANNELS.updatePlotNode,
          ProjectUpdatePlotNodeCommandSchema.parse(envelope(APP_COMMANDS.updatePlotNode, input)),
          ProjectPlotNodeListResultSchema,
        ),
      movePlotNode: (input) =>
        invoke(
          IPC_CHANNELS.movePlotNode,
          ProjectMovePlotNodeCommandSchema.parse(envelope(APP_COMMANDS.movePlotNode, input)),
          ProjectPlotNodeListResultSchema,
        ),
      deletePlotNode: (input) =>
        invoke(
          IPC_CHANNELS.deletePlotNode,
          ProjectDeletePlotNodeCommandSchema.parse(envelope(APP_COMMANDS.deletePlotNode, input)),
          ProjectPlotNodeListResultSchema,
        ),
      listSceneBeats: (input) =>
        invoke(
          IPC_CHANNELS.listSceneBeats,
          SceneBeatListCommandSchema.parse(envelope(APP_COMMANDS.listSceneBeats, input)),
          SceneBeatListResultSchema,
        ),
      createSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.createSceneBeat,
          SceneBeatCreateCommandSchema.parse(envelope(APP_COMMANDS.createSceneBeat, input)),
          SceneBeatListResultSchema,
        ),
      updateSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.updateSceneBeat,
          SceneBeatUpdateCommandSchema.parse(envelope(APP_COMMANDS.updateSceneBeat, input)),
          SceneBeatListResultSchema,
        ),
      moveSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.moveSceneBeat,
          SceneBeatMoveCommandSchema.parse(envelope(APP_COMMANDS.moveSceneBeat, input)),
          SceneBeatListResultSchema,
        ),
      previewMoveSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.previewMoveSceneBeat,
          SceneBeatPreviewCrossChapterMoveCommandSchema.parse(
            envelope(APP_COMMANDS.previewMoveSceneBeat, input),
          ),
          SceneBeatMovePreviewResultSchema,
        ),
      moveSceneBeatAcrossChapters: (input) =>
        invoke(
          IPC_CHANNELS.moveSceneBeatAcrossChapters,
          SceneBeatMoveAcrossChaptersCommandSchema.parse(
            envelope(APP_COMMANDS.moveSceneBeatAcrossChapters, input),
          ),
          SceneBeatListResultSchema,
        ),
      deleteSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.deleteSceneBeat,
          SceneBeatDeleteCommandSchema.parse(envelope(APP_COMMANDS.deleteSceneBeat, input)),
          SceneBeatListResultSchema,
        ),
      restoreSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.restoreSceneBeat,
          SceneBeatRestoreCommandSchema.parse(envelope(APP_COMMANDS.restoreSceneBeat, input)),
          SceneBeatListResultSchema,
        ),
      setSceneBeatBlockLinks: (input) =>
        invoke(
          IPC_CHANNELS.setSceneBeatBlockLinks,
          SceneBeatSetBlockLinksCommandSchema.parse(
            envelope(APP_COMMANDS.setSceneBeatBlockLinks, input),
          ),
          SceneBeatListResultSchema,
        ),
      convertBlocksToSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.convertBlocksToSceneBeat,
          SceneBeatConvertBlocksCommandSchema.parse(
            envelope(APP_COMMANDS.convertBlocksToSceneBeat, input),
          ),
          SceneBeatListResultSchema,
        ),
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
      previewSplitChapter: (input) =>
        invoke(
          IPC_CHANNELS.previewSplitChapter,
          ProjectPreviewSplitChapterCommandSchema.parse(
            envelope(APP_COMMANDS.previewSplitChapter, input),
          ),
          ProjectStructureOperationPreviewResultSchema,
        ),
      splitChapter: (input) =>
        invoke(
          IPC_CHANNELS.splitChapter,
          ProjectSplitChapterCommandSchema.parse(envelope(APP_COMMANDS.splitChapter, input)),
          ProjectStructureOperationResultSchema,
        ),
      previewMergeChapters: (input) =>
        invoke(
          IPC_CHANNELS.previewMergeChapters,
          ProjectPreviewMergeChaptersCommandSchema.parse(
            envelope(APP_COMMANDS.previewMergeChapters, input),
          ),
          ProjectStructureOperationPreviewResultSchema,
        ),
      mergeChapters: (input) =>
        invoke(
          IPC_CHANNELS.mergeChapters,
          ProjectMergeChaptersCommandSchema.parse(envelope(APP_COMMANDS.mergeChapters, input)),
          ProjectStructureOperationResultSchema,
        ),
      previewMoveBlocks: (input) =>
        invoke(
          IPC_CHANNELS.previewMoveBlocks,
          ProjectPreviewMoveBlocksCommandSchema.parse(
            envelope(APP_COMMANDS.previewMoveBlocks, input),
          ),
          ProjectStructureOperationPreviewResultSchema,
        ),
      moveBlocks: (input) =>
        invoke(
          IPC_CHANNELS.moveBlocks,
          ProjectMoveBlocksCommandSchema.parse(envelope(APP_COMMANDS.moveBlocks, input)),
          ProjectStructureOperationResultSchema,
        ),
    },
    canon: {
      list: (input) =>
        invoke(
          IPC_CHANNELS.listEntities,
          EntityListCommandSchema.parse(envelope(APP_COMMANDS.listEntities, input)),
          EntityCatalogResultSchema,
        ),
      create: (input) =>
        invoke(
          IPC_CHANNELS.createEntity,
          EntityCreateCommandSchema.parse(envelope(APP_COMMANDS.createEntity, input)),
          EntityCatalogResultSchema,
        ),
      update: (input) =>
        invoke(
          IPC_CHANNELS.updateEntity,
          EntityUpdateCommandSchema.parse(envelope(APP_COMMANDS.updateEntity, input)),
          EntityCatalogResultSchema,
        ),
      archive: (input) =>
        invoke(
          IPC_CHANNELS.archiveEntity,
          EntityArchiveCommandSchema.parse(envelope(APP_COMMANDS.archiveEntity, input)),
          EntityCatalogResultSchema,
        ),
      setFact: (input) =>
        invoke(
          IPC_CHANNELS.setCanonFact,
          CanonFactSetCommandSchema.parse(envelope(APP_COMMANDS.setCanonFact, input)),
          EntityCatalogResultSchema,
        ),
      linkSceneBeat: (input) =>
        invoke(
          IPC_CHANNELS.linkSceneBeatEntity,
          SceneBeatEntityLinkCommandSchema.parse(envelope(APP_COMMANDS.linkSceneBeatEntity, input)),
          EntityCatalogResultSchema,
        ),
      previewDelete: (input) =>
        invoke(
          IPC_CHANNELS.previewDeleteEntity,
          EntityDeletePreviewCommandSchema.parse(envelope(APP_COMMANDS.previewDeleteEntity, input)),
          EntityDeletePreviewResultSchema,
        ),
      delete: (input) =>
        invoke(
          IPC_CHANNELS.deleteEntity,
          EntityDeleteCommandSchema.parse(envelope(APP_COMMANDS.deleteEntity, input)),
          EntityDeleteResultEnvelopeSchema,
        ),
    },
  };
}
