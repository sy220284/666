import {
  CoreAppDataResultSchema,
  CoreGenerationResultSchema,
  CoreProjectResultSchema,
  CoreProviderResultSchema,
  PROTOCOL_VERSION,
  type CoreAppDataOperation,
  type CoreAppDataResult,
  type CoreEvent,
  type CoreGenerationOperation,
  type CoreGenerationResult,
  type CoreProjectOperation,
  type CoreProjectResult,
  type CoreProviderOperation,
  type CoreProviderResult,
  type ErrorCode,
} from '@worldforge/contracts';

import type { TrackedOperationHandlers } from './utility-control-context.js';

function failureResult(
  schema:
    | typeof CoreAppDataResultSchema
    | typeof CoreProviderResultSchema
    | typeof CoreGenerationResultSchema
    | typeof CoreProjectResultSchema,
  operation: string,
  errorCode: ErrorCode,
) {
  return schema.parse({ ok: false, operation, errorCode });
}

export function appDataEvent(
  requestId: string,
  operation: CoreAppDataOperation['operation'],
  result: CoreAppDataResult,
): CoreEvent {
  return { type: 'core.app-data.result', protocolVersion: PROTOCOL_VERSION, requestId, result };
}

export function appDataHandlers(
  requestId: string,
  operation: CoreAppDataOperation['operation'],
): TrackedOperationHandlers<CoreAppDataResult> {
  return {
    success: (result) => appDataEvent(requestId, operation, result),
    failure: () =>
      appDataEvent(
        requestId,
        operation,
        failureResult(CoreAppDataResultSchema, operation, 'COMMON_INTERNAL_999'),
      ),
    failureEvent: 'app-data.operation.failed',
  };
}

export function providerEvent(
  requestId: string,
  operation: CoreProviderOperation['operation'],
  result: CoreProviderResult,
): CoreEvent {
  return { type: 'core.provider.result', protocolVersion: PROTOCOL_VERSION, requestId, result };
}

export function providerHandlers(
  requestId: string,
  operation: CoreProviderOperation['operation'],
): TrackedOperationHandlers<CoreProviderResult> {
  return {
    success: (result) => providerEvent(requestId, operation, result),
    failure: () =>
      providerEvent(
        requestId,
        operation,
        failureResult(CoreProviderResultSchema, operation, 'COMMON_INTERNAL_999'),
      ),
    failureEvent: 'provider.operation.failed',
  };
}

export function generationEvent(
  requestId: string,
  operation: CoreGenerationOperation['operation'],
  result: CoreGenerationResult,
): CoreEvent {
  return { type: 'core.generation.result', protocolVersion: PROTOCOL_VERSION, requestId, result };
}

export function generationHandlers(
  requestId: string,
  operation: CoreGenerationOperation['operation'],
): TrackedOperationHandlers<CoreGenerationResult> {
  return {
    success: (result) => generationEvent(requestId, operation, result),
    failure: () =>
      generationEvent(
        requestId,
        operation,
        failureResult(CoreGenerationResultSchema, operation, 'COMMON_INTERNAL_999'),
      ),
    failureEvent: 'generation.operation.failed',
  };
}

export function projectEvent(
  requestId: string,
  operation: CoreProjectOperation['operation'],
  result: CoreProjectResult,
): CoreEvent {
  return { type: 'core.project.result', protocolVersion: PROTOCOL_VERSION, requestId, result };
}

export function projectHandlers(
  requestId: string,
  operation: CoreProjectOperation['operation'],
): TrackedOperationHandlers<CoreProjectResult> {
  return {
    success: (result) => projectEvent(requestId, operation, result),
    failure: () =>
      projectEvent(
        requestId,
        operation,
        failureResult(CoreProjectResultSchema, operation, 'COMMON_INTERNAL_999'),
      ),
    failureEvent: 'project.operation.failed',
  };
}

export function cancelledOperationEvent(
  requestId: string,
  operation:
    | CoreAppDataOperation['operation']
    | CoreProviderOperation['operation']
    | CoreGenerationOperation['operation']
    | CoreProjectOperation['operation'],
  kind: 'app-data' | 'provider' | 'generation' | 'project',
): CoreEvent {
  switch (kind) {
    case 'app-data':
      return appDataEvent(
        requestId,
        operation as CoreAppDataOperation['operation'],
        failureResult(CoreAppDataResultSchema, operation, 'COMMON_CANCELLED_004'),
      );
    case 'provider':
      return providerEvent(
        requestId,
        operation as CoreProviderOperation['operation'],
        failureResult(CoreProviderResultSchema, operation, 'COMMON_CANCELLED_004'),
      );
    case 'generation':
      return generationEvent(
        requestId,
        operation as CoreGenerationOperation['operation'],
        failureResult(CoreGenerationResultSchema, operation, 'COMMON_CANCELLED_004'),
      );
    case 'project':
      return projectEvent(
        requestId,
        operation as CoreProjectOperation['operation'],
        failureResult(CoreProjectResultSchema, operation, 'COMMON_CANCELLED_004'),
      );
  }
}
