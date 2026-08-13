import {
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import { DraftServiceError } from './draft.js';
import { projectOperationError } from './utility-errors.js';
import { routeContentProjectOperation } from './utility-project-content-router.js';
import { routeLongformAiOperation } from './utility-longform-ai-router.js';
import { routeIdeaOperation } from './utility-project-idea-router.js';
import { routeNarrativePlanningOperation } from './utility-project-narrative-router.js';
import { routePrimaryProjectOperation } from './utility-project-primary-router.js';
import type { UtilityProjectServices } from './utility-project-services.js';
import { routeStructureProjectOperation } from './utility-project-structure-router.js';
import { routeValidationOperation } from './utility-validation-router.js';
import { routeSearchRhythmOperation } from './utility-search-rhythm-router.js';

export async function executeProjectOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult> {
  try {
    const result =
      (await routePrimaryProjectOperation(services, requestId, operation)) ??
      (await routeNarrativePlanningOperation(services, requestId, operation)) ??
      (await routeValidationOperation(services, requestId, operation)) ??
      (await routeLongformAiOperation(services, requestId, operation)) ??
      (await routeSearchRhythmOperation(services, requestId, operation)) ??
      (await routeIdeaOperation(services, requestId, operation)) ??
      (await routeStructureProjectOperation(services, requestId, operation)) ??
      (await routeContentProjectOperation(services, requestId, operation));
    if (!result) throw new Error(`CORE_PROJECT_OPERATION_UNROUTED:${operation.operation}`);
    return CoreProjectResultSchema.parse(result);
  } catch (error) {
    return CoreProjectResultSchema.parse({
      ok: false,
      operation: operation.operation,
      errorCode: projectOperationError(error),
      ...(error instanceof DraftServiceError && error.lockConflict
        ? { details: { lockConflict: error.lockConflict } }
        : {}),
    });
  }
}
