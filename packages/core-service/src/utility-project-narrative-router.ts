import {
  NARRATIVE_PLANNING_COMMANDS,
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import { ContinuityServiceError } from './continuity.js';
import { NarrativePlanningService, NarrativePlanningServiceError } from './narrative-planning.js';
import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

function translate(error: unknown): never {
  if (error instanceof NarrativePlanningServiceError) {
    const code =
      error.code === 'NARRATIVE_NOT_FOUND'
        ? 'CONTINUITY_NOT_FOUND'
        : error.code === 'NARRATIVE_CONFLICT'
          ? 'CONTINUITY_CONFLICT'
          : error.code === 'NARRATIVE_AUTHOR_REQUIRED' || error.code === 'NARRATIVE_INVALID'
            ? 'CONTINUITY_INVALID'
            : 'CONTINUITY_INVARIANT';
    throw new ContinuityServiceError(code, error.message, { cause: error });
  }
  throw error;
}

export async function routeNarrativePlanningOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  const narrativePlanning = new NarrativePlanningService(services.projectWorkspace);
  try {
    switch (operation.operation) {
      case NARRATIVE_PLANNING_COMMANDS.list:
        return success(operation.operation, narrativePlanning.list(operation.input));
      case NARRATIVE_PLANNING_COMMANDS.saveForeshadowing:
        return success(
          operation.operation,
          await narrativePlanning.saveForeshadowing(requestId, operation.input),
        );
      case NARRATIVE_PLANNING_COMMANDS.transitionForeshadowing:
        return success(
          operation.operation,
          await narrativePlanning.transitionForeshadowing(requestId, operation.input),
        );
      case NARRATIVE_PLANNING_COMMANDS.saveCharacterArc:
        return success(
          operation.operation,
          await narrativePlanning.saveCharacterArc(requestId, operation.input),
        );
      case NARRATIVE_PLANNING_COMMANDS.saveArcMilestone:
        return success(
          operation.operation,
          await narrativePlanning.saveArcMilestone(requestId, operation.input),
        );
      case NARRATIVE_PLANNING_COMMANDS.transitionArcMilestone:
        return success(
          operation.operation,
          await narrativePlanning.transitionArcMilestone(requestId, operation.input),
        );
      default:
        return null;
    }
  } catch (error) {
    translate(error);
  }
}
