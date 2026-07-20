import {
  CoreProjectResultSchema,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import { DraftServiceError } from './draft.js';
import { projectOperationError } from './utility-errors.js';
import { routeContentProjectOperation } from './utility-project-content-router.js';
import { routeNarrativePlanningOperation } from './utility-project-narrative-router.js';
import { routePrimaryProjectOperation } from './utility-project-primary-router.js';
import type { UtilityProjectServices } from './utility-project-services.js';
import { routeStructureProjectOperation } from './utility-project-structure-router.js';

export async function executeProjectOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult> {
  try {
    const result =
      (await routePrimaryProjectOperation(services, requestId, operation)) ??
      (await routeNarrativePlanningOperation(services, requestId, operation)) ??
      (await routeStructureProjectOperation(services, requestId, operation)) ??
      (await routeContentProjectOperation(services, requestId, operation));
    if (!result) throw new Error(`CORE_PROJECT_OPERATION_UNROUTED:${operation.operation}`);
    return result;
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
