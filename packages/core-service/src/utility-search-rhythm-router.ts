import {
  RHYTHM_COMMANDS,
  SEARCH_TOOLS_COMMANDS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return { ok: true, operation, data } as CoreProjectResult;
}

export async function routeSearchRhythmOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- this router intentionally handles only search and rhythm operations
  switch (operation.operation) {
    case SEARCH_TOOLS_COMMANDS.search:
      return success(operation.operation, services.searchTools.search(operation.input));
    case SEARCH_TOOLS_COMMANDS.getIndexState:
      return success(
        operation.operation,
        services.searchTools.getIndexState(operation.input.projectId),
      );
    case SEARCH_TOOLS_COMMANDS.rebuildIndex:
      return success(
        operation.operation,
        await services.searchTools.rebuildIndex(requestId, operation.input.projectId),
      );
    case SEARCH_TOOLS_COMMANDS.previewReplace:
      return success(
        operation.operation,
        await services.searchTools.previewReplace(requestId, operation.input),
      );
    case SEARCH_TOOLS_COMMANDS.applyReplace:
      return success(
        operation.operation,
        await services.searchTools.applyReplace(requestId, operation.input),
      );
    case SEARCH_TOOLS_COMMANDS.listDictionary:
      return success(operation.operation, services.searchTools.listDictionary(operation.input));
    case SEARCH_TOOLS_COMMANDS.upsertDictionary:
      return success(
        operation.operation,
        await services.searchTools.upsertDictionary(requestId, operation.input),
      );
    case SEARCH_TOOLS_COMMANDS.deleteDictionary:
      return success(
        operation.operation,
        await services.searchTools.deleteDictionary(requestId, operation.input),
      );
    case RHYTHM_COMMANDS.get:
      return success(
        operation.operation,
        await services.rhythm.get(requestId, operation.input.projectId),
      );
    case RHYTHM_COMMANDS.run:
      return success(
        operation.operation,
        await services.rhythm.run(requestId, operation.input.projectId),
      );
    case RHYTHM_COMMANDS.updateProfile:
      return success(
        operation.operation,
        await services.rhythm.updateProfile(requestId, operation.input),
      );
    default:
      return null;
  }
}
