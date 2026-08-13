import {
  CoreProjectResultSchema,
  LONGFORM_AI_COMMANDS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';

function success(operation: string, data: unknown): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: true, operation, data });
}

export async function routeLongformAiOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- partial router
  switch (operation.operation) {
    case LONGFORM_AI_COMMANDS.getSettings:
      return success(
        operation.operation,
        services.longformAi.getSettings(operation.input.projectId),
      );
    case LONGFORM_AI_COMMANDS.updateSettings:
      return success(
        operation.operation,
        await services.longformAi.updateSettings(requestId, operation.input),
      );
    case LONGFORM_AI_COMMANDS.listDigests:
      return success(operation.operation, services.longformAi.listDigests(operation.input));
    case LONGFORM_AI_COMMANDS.rebuildDigests:
      return success(
        operation.operation,
        await services.longformAi.rebuild(requestId, operation.input),
      );
    case LONGFORM_AI_COMMANDS.evaluateStyle:
      return success(operation.operation, services.longformAi.evaluateStyle(operation.input));
    case LONGFORM_AI_COMMANDS.resolveTaskRoute:
      return success(operation.operation, services.longformAi.resolveTaskRoute(operation.input));
    default:
      return null;
  }
}
