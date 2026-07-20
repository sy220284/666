import {
  CONTINUITY_COMMANDS,
  ENTITY_CANON_COMMANDS,
  PROJECT_PLANNING_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  SCENE_BEAT_COMMANDS,
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

export async function routePrimaryProjectOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  switch (operation.operation) {
    case PROJECT_WORKSPACE_COMMANDS.getActive:
      return success(operation.operation, services.projectWorkspace.activeProject);
    case PROJECT_WORKSPACE_COMMANDS.create:
      return success(
        operation.operation,
        await services.projectWorkspace.create(
          requestId,
          operation.input,
          operation.parentDirectory,
        ),
      );
    case PROJECT_WORKSPACE_COMMANDS.openSelected:
      return success(
        operation.operation,
        await services.projectWorkspace.open(requestId, {
          workspacePath: operation.workspacePath,
        }),
      );
    case PROJECT_WORKSPACE_COMMANDS.openRecent:
      return success(
        operation.operation,
        await services.projectWorkspace.open(requestId, {
          recentProjectId: operation.projectId,
        }),
      );
    case PROJECT_WORKSPACE_COMMANDS.close:
      return success(
        operation.operation,
        await services.projectWorkspace.close(requestId, operation.projectId),
      );
    case PROJECT_WORKSPACE_COMMANDS.move:
      return success(
        operation.operation,
        await services.projectWorkspace.move(
          requestId,
          operation.projectId,
          operation.targetParentDirectory,
        ),
      );
    case PROJECT_PLANNING_COMMANDS.getBrief:
      return success(operation.operation, services.projectPlanning.getBrief(operation.projectId));
    case PROJECT_PLANNING_COMMANDS.updateBrief:
      return success(
        operation.operation,
        await services.projectPlanning.updateBrief(requestId, operation.input),
      );
    case PROJECT_PLANNING_COMMANDS.listPlotNodes:
      return success(
        operation.operation,
        services.projectPlanning.listPlotNodes(operation.projectId),
      );
    case PROJECT_PLANNING_COMMANDS.createPlotNode:
      return success(
        operation.operation,
        await services.projectPlanning.createPlotNode(requestId, operation.input),
      );
    case PROJECT_PLANNING_COMMANDS.updatePlotNode:
      return success(
        operation.operation,
        await services.projectPlanning.updatePlotNode(requestId, operation.input),
      );
    case PROJECT_PLANNING_COMMANDS.movePlotNode:
      return success(
        operation.operation,
        await services.projectPlanning.movePlotNode(requestId, operation.input),
      );
    case PROJECT_PLANNING_COMMANDS.deletePlotNode:
      return success(
        operation.operation,
        await services.projectPlanning.deletePlotNode(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.listSceneBeats:
      return success(operation.operation, services.sceneBeats.list(operation.input));
    case SCENE_BEAT_COMMANDS.createSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.create(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.updateSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.update(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.moveSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.move(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.previewMoveSceneBeat:
      return success(
        operation.operation,
        services.sceneBeats.previewCrossChapterMove(operation.input),
      );
    case SCENE_BEAT_COMMANDS.moveSceneBeatAcrossChapters:
      return success(
        operation.operation,
        await services.sceneBeats.moveAcrossChapters(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.deleteSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.delete(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.restoreSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.restore(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.setSceneBeatBlockLinks:
      return success(
        operation.operation,
        await services.sceneBeats.setBlockLinks(requestId, operation.input),
      );
    case SCENE_BEAT_COMMANDS.convertBlocksToSceneBeat:
      return success(
        operation.operation,
        await services.sceneBeats.convertBlocks(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.listEntities:
      return success(operation.operation, services.entityCanon.list(operation.input));
    case ENTITY_CANON_COMMANDS.createEntity:
      return success(
        operation.operation,
        await services.entityCanon.create(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.updateEntity:
      return success(
        operation.operation,
        await services.entityCanon.update(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.archiveEntity:
      return success(
        operation.operation,
        await services.entityCanon.archive(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.setCanonFact:
      return success(
        operation.operation,
        await services.entityCanon.setFact(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.linkSceneBeatEntity:
      return success(
        operation.operation,
        await services.entityCanon.linkSceneBeat(requestId, operation.input),
      );
    case ENTITY_CANON_COMMANDS.previewDeleteEntity:
      return success(operation.operation, services.entityCanon.previewDelete(operation.input));
    case ENTITY_CANON_COMMANDS.deleteEntity:
      return success(
        operation.operation,
        await services.entityCanon.delete(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.list:
      return success(operation.operation, services.continuity.list(operation.input));
    case CONTINUITY_COMMANDS.setEntityState:
      return success(
        operation.operation,
        await services.continuity.setEntityState(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.invalidateEntityState:
      return success(
        operation.operation,
        await services.continuity.invalidateEntityState(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.saveTimelineEvent:
      return success(
        operation.operation,
        await services.continuity.saveTimelineEvent(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.archiveTimelineEvent:
      return success(
        operation.operation,
        await services.continuity.archiveTimelineEvent(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.setKnowledgeState:
      return success(
        operation.operation,
        await services.continuity.setKnowledgeState(requestId, operation.input),
      );
    case CONTINUITY_COMMANDS.invalidateKnowledgeState:
      return success(
        operation.operation,
        await services.continuity.invalidateKnowledgeState(requestId, operation.input),
      );
    default:
      return null;
  }
}
