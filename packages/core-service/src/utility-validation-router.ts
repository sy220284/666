import {
  VALIDATION_COMMANDS,
  type CoreProjectOperation,
  type CoreProjectResult,
} from '@worldforge/contracts';

import type { UtilityProjectServices } from './utility-project-services.js';
import { ValidationService } from './validation.js';

function success(
  operation: (typeof VALIDATION_COMMANDS)[keyof typeof VALIDATION_COMMANDS],
  data: unknown,
): CoreProjectResult {
  return { ok: true, operation, data } as CoreProjectResult;
}

export async function routeValidationOperation(
  services: UtilityProjectServices,
  requestId: string,
  operation: CoreProjectOperation,
): Promise<CoreProjectResult | null> {
  const validation = new ValidationService(services.projectWorkspace);
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- This partial router returns null so unmatched operations can be delegated.
  switch (operation.operation) {
    case VALIDATION_COMMANDS.list:
      return success(operation.operation, validation.list(operation.input));
    case VALIDATION_COMMANDS.runRules:
      return success(operation.operation, await validation.runRules(requestId, operation.input));
    case VALIDATION_COMMANDS.updateIssue:
      return success(operation.operation, await validation.updateIssue(requestId, operation.input));
    case VALIDATION_COMMANDS.createTodoFromIssue:
      return success(
        operation.operation,
        await validation.createTodoFromIssue(requestId, operation.input),
      );
    case VALIDATION_COMMANDS.saveTodo:
      return success(operation.operation, await validation.saveTodo(requestId, operation.input));
    case VALIDATION_COMMANDS.addComment:
      return success(operation.operation, await validation.addComment(requestId, operation.input));
    case VALIDATION_COMMANDS.resolveComment:
      return success(
        operation.operation,
        await validation.resolveComment(requestId, operation.input),
      );
    default:
      return null;
  }
}
