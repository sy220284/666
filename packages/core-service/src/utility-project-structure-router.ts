import {
  PROJECT_STRUCTURE_COMMANDS,
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

export async function routeStructureProjectOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  switch (operation.operation) {
    case PROJECT_STRUCTURE_COMMANDS.listStructure:
      return success(operation.operation, services.projectStructure.list(operation.projectId));
    case PROJECT_STRUCTURE_COMMANDS.createVolume:
      return success(
        operation.operation,
        await services.projectStructure.createVolume(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.updateVolume:
      return success(
        operation.operation,
        await services.projectStructure.updateVolume(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.moveVolume:
      return success(
        operation.operation,
        await services.projectStructure.moveVolume(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.deleteVolume:
      return success(
        operation.operation,
        await services.projectStructure.deleteVolume(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.createChapter:
      return success(
        operation.operation,
        await services.projectStructure.createChapter(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.updateChapter:
      return success(
        operation.operation,
        await services.projectStructure.updateChapter(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.moveChapter:
      return success(
        operation.operation,
        await services.projectStructure.moveChapter(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.deleteChapter:
      return success(
        operation.operation,
        await services.projectStructure.deleteChapter(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.listTrash:
      return success(operation.operation, services.projectStructure.listTrash(operation.projectId));
    case PROJECT_STRUCTURE_COMMANDS.restoreTrashEntry:
      return success(
        operation.operation,
        await services.projectStructure.restoreTrashEntry(requestId, operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.previewPermanentDelete:
      return success(
        operation.operation,
        services.structureOperations.previewPermanentDelete(operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.permanentDelete: {
      services.structureOperations.assertPermanentDeleteExecutable(operation.input);
      const checkpoint = await services.recovery.createOperationCheckpoint(
        services.checkpointRequestId(requestId),
        {
          projectId: operation.input.projectId,
          operation: 'permanent-delete',
        },
      );
      return success(
        operation.operation,
        await services.structureOperations.permanentDelete(
          requestId,
          operation.input,
          checkpoint.backupId,
        ),
      );
    }
    case PROJECT_STRUCTURE_COMMANDS.previewSplitChapter:
      return success(
        operation.operation,
        services.structureOperations.previewSplit(operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.splitChapter: {
      services.structureOperations.assertSplitExecutable(operation.input);
      const checkpoint = await services.recovery.createOperationCheckpoint(
        services.checkpointRequestId(requestId),
        {
          projectId: operation.input.projectId,
          operation: 'split-chapter',
        },
      );
      return success(
        operation.operation,
        await services.structureOperations.executeSplit(
          requestId,
          operation.input,
          checkpoint.backupId,
        ),
      );
    }
    case PROJECT_STRUCTURE_COMMANDS.previewMergeChapters:
      return success(
        operation.operation,
        services.structureOperations.previewMerge(operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.mergeChapters: {
      services.structureOperations.assertMergeExecutable(operation.input);
      const checkpoint = await services.recovery.createOperationCheckpoint(
        services.checkpointRequestId(requestId),
        {
          projectId: operation.input.projectId,
          operation: 'merge-chapter',
        },
      );
      return success(
        operation.operation,
        await services.structureOperations.executeMerge(
          requestId,
          operation.input,
          checkpoint.backupId,
        ),
      );
    }
    case PROJECT_STRUCTURE_COMMANDS.previewMoveBlocks:
      return success(
        operation.operation,
        services.structureOperations.previewMove(operation.input),
      );
    case PROJECT_STRUCTURE_COMMANDS.moveBlocks: {
      services.structureOperations.assertMoveExecutable(operation.input);
      const checkpoint = await services.recovery.createOperationCheckpoint(
        services.checkpointRequestId(requestId),
        {
          projectId: operation.input.projectId,
          operation: 'move-blocks',
        },
      );
      return success(
        operation.operation,
        await services.structureOperations.executeMove(
          requestId,
          operation.input,
          checkpoint.backupId,
        ),
      );
    }
    default:
      return null;
  }
}
