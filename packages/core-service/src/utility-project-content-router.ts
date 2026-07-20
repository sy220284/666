import {
  CANDIDATE_APPLY_COMMANDS,
  CANDIDATE_COMMANDS,
  DRAFT_COMMANDS,
  RECOVERY_COMMANDS,
  TEXT_IO_COMMANDS,
  VERSION_COMMANDS,
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

export async function routeContentProjectOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  switch (operation.operation) {
    case DRAFT_COMMANDS.openDraft:
      return success(operation.operation, await services.drafts.open(requestId, operation.input));
    case DRAFT_COMMANDS.applyPatch:
      return success(
        operation.operation,
        await services.drafts.applyPatch(requestId, operation.input),
      );
    case CANDIDATE_COMMANDS.createFixtureCandidate:
      return success(
        operation.operation,
        await services.candidates.createFixture(requestId, operation.input),
      );
    case CANDIDATE_COMMANDS.listCandidates:
      return success(operation.operation, services.candidates.list(operation.input));
    case CANDIDATE_COMMANDS.getCandidate:
      return success(operation.operation, services.candidates.get(operation.input));
    case CANDIDATE_COMMANDS.discardCandidate:
      return success(
        operation.operation,
        await services.candidates.discard(requestId, operation.input),
      );
    case CANDIDATE_APPLY_COMMANDS.previewCandidate:
      return success(
        operation.operation,
        await services.candidateApply.previewProgressively(requestId, operation.input),
      );
    case CANDIDATE_APPLY_COMMANDS.cancelPreview:
      return success(operation.operation, services.candidateApply.cancelPreview(operation.input));
    case CANDIDATE_APPLY_COMMANDS.applyCandidate:
      return success(
        operation.operation,
        await services.candidateApply.apply(requestId, operation.input),
      );
    case CANDIDATE_APPLY_COMMANDS.previewUndo:
      return success(operation.operation, services.candidateApply.previewUndo(operation.input));
    case CANDIDATE_APPLY_COMMANDS.undoApply:
      return success(
        operation.operation,
        await services.candidateApply.undo(requestId, operation.input),
      );
    case CANDIDATE_APPLY_COMMANDS.findUndoRecord:
      return success(operation.operation, services.candidateApply.findUndoRecord(operation.input));
    case VERSION_COMMANDS.createVersion:
      return success(
        operation.operation,
        await services.versions.create(requestId, operation.input),
      );
    case VERSION_COMMANDS.listVersions:
      return success(operation.operation, services.versions.list(operation.input));
    case VERSION_COMMANDS.getVersion:
      return success(operation.operation, services.versions.get(operation.input));
    case VERSION_COMMANDS.setFinalVersion:
      return success(
        operation.operation,
        await services.versions.setFinal(requestId, operation.input),
      );
    case VERSION_COMMANDS.restoreVersion:
      return success(
        operation.operation,
        await services.versions.restore(requestId, operation.input),
      );
    case RECOVERY_COMMANDS.createCheckpoint:
      return success(
        operation.operation,
        await services.recovery.createOperationCheckpoint(requestId, operation.input),
      );
    case RECOVERY_COMMANDS.getOverview:
      return success(
        operation.operation,
        await services.recovery.getOverview(operation.input.projectId),
      );
    case RECOVERY_COMMANDS.restoreCheckpoint:
      return success(
        operation.operation,
        await services.recovery.restoreCheckpoint(
          requestId,
          operation.input,
          operation.targetParentDirectory,
        ),
      );
    case RECOVERY_COMMANDS.exportVersion:
      return success(
        operation.operation,
        await services.recovery.exportVersion(operation.input, operation.targetDirectory),
      );
    case TEXT_IO_COMMANDS.previewImport:
      return success(
        operation.operation,
        await services.textIo.previewImport(operation.input, operation.sourcePath),
      );
    case TEXT_IO_COMMANDS.commitImport:
      return success(
        operation.operation,
        await services.textIo.commitImport(requestId, operation.input),
      );
    case TEXT_IO_COMMANDS.listExportVersions:
      return success(
        operation.operation,
        services.textIo.listExportVersions(operation.input.projectId),
      );
    case TEXT_IO_COMMANDS.exportVersions:
      return success(
        operation.operation,
        await services.textIo.exportVersions(operation.input, operation.targetDirectory),
      );
    default:
      return null;
  }
}
