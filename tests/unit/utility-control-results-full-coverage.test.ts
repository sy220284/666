import {
  APP_DATA_COMMANDS,
  GENERATION_COMMANDS,
  PROJECT_WORKSPACE_COMMANDS,
  PROVIDER_CORE_OPERATIONS,
  PROTOCOL_VERSION,
  type CoreAppDataResult,
  type CoreGenerationResult,
  type CoreProjectResult,
  type CoreProviderResult,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import {
  appDataEvent,
  appDataHandlers,
  cancelledAppDataEvent,
  cancelledGenerationEvent,
  cancelledProjectEvent,
  cancelledProviderEvent,
  generationEvent,
  generationHandlers,
  projectEvent,
  projectHandlers,
  providerEvent,
  providerHandlers,
} from '../../packages/core-service/src/utility-control-results.js';

const requestId = '66666666-6666-4666-8666-666666666666';

describe('utility control result envelopes', () => {
  it('covers app-data success, internal failure and cancellation envelopes', () => {
    const result: CoreAppDataResult = {
      ok: false,
      operation: APP_DATA_COMMANDS.settingsGet,
      errorCode: 'COMMON_INTERNAL_999',
    };
    expect(appDataEvent(requestId, result)).toEqual({
      type: 'core.app-data.result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result,
    });
    const handlers = appDataHandlers(requestId, APP_DATA_COMMANDS.settingsGet);
    expect(handlers.failureEvent).toBe('app-data.operation.failed');
    expect(handlers.success(result)).toEqual(appDataEvent(requestId, result));
    expect(handlers.failure(new Error('boom'))).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_INTERNAL_999' },
    });
    expect(cancelledAppDataEvent(requestId, APP_DATA_COMMANDS.settingsGet)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_CANCELLED_004' },
    });
  });

  it('covers provider success, internal failure and cancellation envelopes', () => {
    const result: CoreProviderResult = {
      ok: false,
      operation: PROVIDER_CORE_OPERATIONS.list,
      errorCode: 'COMMON_INTERNAL_999',
    };
    expect(providerEvent(requestId, result)).toEqual({
      type: 'core.provider.result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result,
    });
    const handlers = providerHandlers(requestId, PROVIDER_CORE_OPERATIONS.list);
    expect(handlers.failureEvent).toBe('provider.operation.failed');
    expect(handlers.success(result)).toEqual(providerEvent(requestId, result));
    expect(handlers.failure('boom')).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_INTERNAL_999' },
    });
    expect(cancelledProviderEvent(requestId, PROVIDER_CORE_OPERATIONS.list)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_CANCELLED_004' },
    });
  });

  it('covers generation success, internal failure and cancellation envelopes', () => {
    const result: CoreGenerationResult = {
      ok: false,
      operation: GENERATION_COMMANDS.getRun,
      errorCode: 'COMMON_INTERNAL_999',
    };
    expect(generationEvent(requestId, result)).toEqual({
      type: 'core.generation.result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result,
    });
    const handlers = generationHandlers(requestId, GENERATION_COMMANDS.getRun);
    expect(handlers.failureEvent).toBe('generation.operation.failed');
    expect(handlers.success(result)).toEqual(generationEvent(requestId, result));
    expect(handlers.failure(null)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_INTERNAL_999' },
    });
    expect(cancelledGenerationEvent(requestId, GENERATION_COMMANDS.getRun)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_CANCELLED_004' },
    });
  });

  it('covers project success, internal failure and cancellation envelopes', () => {
    const result: CoreProjectResult = {
      ok: false,
      operation: PROJECT_WORKSPACE_COMMANDS.getActive,
      errorCode: 'COMMON_INTERNAL_999',
    };
    expect(projectEvent(requestId, result)).toEqual({
      type: 'core.project.result',
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      result,
    });
    const handlers = projectHandlers(requestId, PROJECT_WORKSPACE_COMMANDS.getActive);
    expect(handlers.failureEvent).toBe('project.operation.failed');
    expect(handlers.success(result)).toEqual(projectEvent(requestId, result));
    expect(handlers.failure(undefined)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_INTERNAL_999' },
    });
    expect(cancelledProjectEvent(requestId, PROJECT_WORKSPACE_COMMANDS.getActive)).toMatchObject({
      result: { ok: false, errorCode: 'COMMON_CANCELLED_004' },
    });
  });
});
