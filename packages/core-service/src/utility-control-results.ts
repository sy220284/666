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

function appDataFailure(
  operation: CoreAppDataOperation['operation'],
  errorCode: ErrorCode,
): CoreAppDataResult {
  return CoreAppDataResultSchema.parse({ ok: false, operation, errorCode });
}

function providerFailure(
  operation: CoreProviderOperation['operation'],
  errorCode: ErrorCode,
): CoreProviderResult {
  return CoreProviderResultSchema.parse({ ok: false, operation, errorCode });
}

function generationFailure(
  operation: CoreGenerationOperation['operation'],
  errorCode: ErrorCode,
): CoreGenerationResult {
  return CoreGenerationResultSchema.parse({ ok: false, operation, errorCode });
}

function projectFailure(
  operation: CoreProjectOperation['operation'],
  errorCode: ErrorCode,
): CoreProjectResult {
  return CoreProjectResultSchema.parse({ ok: false, operation, errorCode });
}

export function appDataEvent(requestId: string, result: CoreAppDataResult): CoreEvent {
  return {
    type: 'core.app-data.result',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    result,
  };
}

export function appDataHandlers(
  requestId: string,
  operation: CoreAppDataOperation['operation'],
): TrackedOperationHandlers<CoreAppDataResult> {
  return {
    success: (result) => appDataEvent(requestId, result),
    failure: () => appDataEvent(requestId, appDataFailure(operation, 'COMMON_INTERNAL_999')),
    failureEvent: 'app-data.operation.failed',
  };
}

export function cancelledAppDataEvent(
  requestId: string,
  operation: CoreAppDataOperation['operation'],
): CoreEvent {
  return appDataEvent(requestId, appDataFailure(operation, 'COMMON_CANCELLED_004'));
}

export function providerEvent(requestId: string, result: CoreProviderResult): CoreEvent {
  return {
    type: 'core.provider.result',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    result,
  };
}

export function providerHandlers(
  requestId: string,
  operation: CoreProviderOperation['operation'],
): TrackedOperationHandlers<CoreProviderResult> {
  return {
    success: (result) => providerEvent(requestId, result),
    failure: () => providerEvent(requestId, providerFailure(operation, 'COMMON_INTERNAL_999')),
    failureEvent: 'provider.operation.failed',
  };
}

export function cancelledProviderEvent(
  requestId: string,
  operation: CoreProviderOperation['operation'],
): CoreEvent {
  return providerEvent(requestId, providerFailure(operation, 'COMMON_CANCELLED_004'));
}

export function generationEvent(requestId: string, result: CoreGenerationResult): CoreEvent {
  return {
    type: 'core.generation.result',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    result,
  };
}

export function generationHandlers(
  requestId: string,
  operation: CoreGenerationOperation['operation'],
): TrackedOperationHandlers<CoreGenerationResult> {
  return {
    success: (result) => generationEvent(requestId, result),
    failure: () => generationEvent(requestId, generationFailure(operation, 'COMMON_INTERNAL_999')),
    failureEvent: 'generation.operation.failed',
  };
}

export function cancelledGenerationEvent(
  requestId: string,
  operation: CoreGenerationOperation['operation'],
): CoreEvent {
  return generationEvent(requestId, generationFailure(operation, 'COMMON_CANCELLED_004'));
}

export function projectEvent(requestId: string, result: CoreProjectResult): CoreEvent {
  return {
    type: 'core.project.result',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    result,
  };
}

export function projectHandlers(
  requestId: string,
  operation: CoreProjectOperation['operation'],
): TrackedOperationHandlers<CoreProjectResult> {
  return {
    success: (result) => projectEvent(requestId, result),
    failure: () => projectEvent(requestId, projectFailure(operation, 'COMMON_INTERNAL_999')),
    failureEvent: 'project.operation.failed',
  };
}

export function cancelledProjectEvent(
  requestId: string,
  operation: CoreProjectOperation['operation'],
): CoreEvent {
  return projectEvent(requestId, projectFailure(operation, 'COMMON_CANCELLED_004'));
}
