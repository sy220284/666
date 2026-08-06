import {
  CoreAppDataResultSchema,
  CoreGenerationResultSchema,
  CoreProjectResultSchema,
  CoreProviderResultSchema,
  PROJECT_WORKSPACE_COMMANDS,
  PROTOCOL_VERSION,
  type CoreControlMessage,
} from '@worldforge/contracts';

import { runWithCommandIdentity } from './command-identity-context.js';
import { executeAppDataOperation } from './utility-app-data-router.js';
import type { UtilityControlContext } from './utility-control-context.js';
import { executeGenerationOperation } from './utility-generation-router.js';
import { executeProjectOperation } from './utility-project-router.js';
import { executeProviderOperation } from './utility-provider-router.js';
import { derivedRequestId } from './utility-runtime-context.js';

export function dispatchUtilityOperation(
  context: UtilityControlContext,
  message: CoreControlMessage,
): boolean {
  const { options, state } = context;

  switch (message.type) {
    case 'core.app-data.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send({
          type: 'core.app-data.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreAppDataResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
        return true;
      }
      context.track(
        runWithCommandIdentity('core.app-data.command', operation, () =>
          executeAppDataOperation(options.appRuntime, requestId, operation),
        ),
        {
          success: (result) => ({
            type: 'core.app-data.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          }),
          failure: () => ({
            type: 'core.app-data.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreAppDataResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: 'COMMON_INTERNAL_999',
            }),
          }),
          failureEvent: 'app-data.operation.failed',
        },
      );
      return true;
    }
    case 'core.provider.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send({
          type: 'core.provider.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreProviderResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
        return true;
      }
      context.track(
        runWithCommandIdentity('core.provider.command', operation, () =>
          executeProviderOperation(options.appRuntime, requestId, operation),
        ),
        {
          success: (result) => ({
            type: 'core.provider.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          }),
          failure: () => ({
            type: 'core.provider.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreProviderResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: 'COMMON_INTERNAL_999',
            }),
          }),
          failureEvent: 'provider.operation.failed',
        },
      );
      return true;
    }
    case 'core.generation.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send({
          type: 'core.generation.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreGenerationResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
        return true;
      }
      context.track(
        runWithCommandIdentity('core.generation.command', operation, () =>
          executeGenerationOperation(options.generationServices, requestId, operation),
        ),
        {
          success: (result) => ({
            type: 'core.generation.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          }),
          failure: () => ({
            type: 'core.generation.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreGenerationResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: 'COMMON_INTERNAL_999',
            }),
          }),
          failureEvent: 'generation.operation.failed',
        },
      );
      return true;
    }
    case 'core.project.command': {
      const { requestId, operation } = message;
      if (!state.acceptingAppDataOperations) {
        context.send({
          type: 'core.project.result',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          result: CoreProjectResultSchema.parse({
            ok: false,
            operation: operation.operation,
            errorCode: 'COMMON_CANCELLED_004',
          }),
        });
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
        {
          success: (result) => ({
            type: 'core.project.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result,
          }),
          failure: () => ({
            type: 'core.project.result',
            protocolVersion: PROTOCOL_VERSION,
            requestId,
            result: CoreProjectResultSchema.parse({
              ok: false,
              operation: operation.operation,
              errorCode: 'COMMON_INTERNAL_999',
            }),
          }),
          failureEvent: 'project.operation.failed',
        },
      );
      return true;
    }
    default:
      return false;
  }
}
