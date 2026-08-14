import { PROJECT_WORKSPACE_COMMANDS, type CoreControlMessage } from '@worldforge/contracts';

import { runWithCommandIdentity } from './command-identity-context.js';
import { executeAppDataOperation } from './utility-app-data-router.js';
import type { UtilityControlContext } from './utility-control-context.js';
import {
  appDataHandlers,
  cancelledAppDataEvent,
  cancelledGenerationEvent,
  cancelledProjectEvent,
  cancelledProviderEvent,
  generationHandlers,
  projectHandlers,
  providerHandlers,
} from './utility-control-results.js';
import { executeGenerationOperation } from './utility-generation-router.js';
import { executeProjectOperation } from './utility-project-router.js';
import { executeProviderOperation } from './utility-provider-router.js';
import { derivedRequestId } from './utility-runtime-context.js';

export function dispatchUtilityOperation(
  context: UtilityControlContext,
  message: CoreControlMessage,
): boolean {
  const { options, state } = context;
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- lifecycle messages are handled by dispatchUtilityLifecycle
  switch (message.type) {
    case 'core.app-data.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send(cancelledAppDataEvent(requestId, operation.operation));
        return true;
      }
      context.track(
        runWithCommandIdentity('core.app-data.command', operation, () =>
          executeAppDataOperation(options.appRuntime, requestId, operation),
        ),
        appDataHandlers(requestId, operation.operation),
      );
      return true;
    }
    case 'core.provider.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send(cancelledProviderEvent(requestId, operation.operation));
        return true;
      }
      context.track(
        runWithCommandIdentity('core.provider.command', operation, () =>
          executeProviderOperation(options.appRuntime, requestId, operation),
        ),
        providerHandlers(requestId, operation.operation),
      );
      return true;
    }
    case 'core.generation.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send(cancelledGenerationEvent(requestId, operation.operation));
        return true;
      }
      context.track(
        runWithCommandIdentity('core.generation.command', operation, () =>
          executeGenerationOperation(options.generationServices, requestId, operation),
        ),
        generationHandlers(requestId, operation.operation),
      );
      return true;
    }
    case 'core.project.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send(cancelledProjectEvent(requestId, operation.operation));
        return true;
      }
      context.track(
        runWithCommandIdentity('core.project.command', operation, () =>
          executeProjectOperation(options.services, requestId, operation).then(async (result) => {
            if (
              result.ok &&
              (operation.operation === PROJECT_WORKSPACE_COMMANDS.create ||
                operation.operation === PROJECT_WORKSPACE_COMMANDS.openRecent ||
                operation.operation === PROJECT_WORKSPACE_COMMANDS.openSelected) &&
              options.projectWorkspace.activeProject?.databaseMode === 'read-write'
            ) {
              try {
                await options.generationRuns.recoverInterrupted(
                  derivedRequestId(requestId, 'generation-recovery'),
                  options.projectWorkspace.activeProject.projectId,
                );
              } catch {
                context.report('generation.recovery.failed');
              }
            }
            return result;
          }),
        ),
        projectHandlers(requestId, operation.operation),
      );
      return true;
    }
    default:
      return false;
  }
}
