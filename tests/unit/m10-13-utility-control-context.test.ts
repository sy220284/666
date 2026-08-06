import { PROTOCOL_VERSION, type CoreEvent } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  createUtilityControlContext,
  type UtilityControlRouterOptions,
} from '../../packages/core-service/src/utility-control-context.js';
import type { UtilityParentPort } from '../../packages/core-service/src/utility-runtime-context.js';

function event(requestId = '550e8400-e29b-41d4-a716-446655440000'): CoreEvent {
  return {
    type: 'core.health',
    protocolVersion: PROTOCOL_VERSION,
    requestId,
    status: 'healthy',
    uptimeMs: 1,
  };
}

function contextFor(parentPort: UtilityParentPort) {
  return createUtilityControlContext({ parentPort } as unknown as UtilityControlRouterOptions);
}

describe('M10-13 Utility control context', () => {
  it('turns parent-port send failures into a safe false result', () => {
    const context = contextFor({
      on: () => undefined,
      postMessage: () => {
        throw new Error('parent closed');
      },
    });

    expect(context.send(event())).toBe(false);
  });

  it('converts a rejected operation into one structured failure event', async () => {
    const postMessage = vi.fn();
    const context = contextFor({ on: () => undefined, postMessage });
    const failure = event('550e8400-e29b-41d4-a716-446655440001');

    context.track(Promise.reject(new Error('operation failed')), {
      success: () => event(),
      failure: () => failure,
      failureEvent: 'test.operation.failed',
    });
    const [tracked] = context.state.activeAppDataOperations;
    expect(tracked).toBeDefined();
    await tracked;

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(failure);
    expect(context.state.activeAppDataOperations.size).toBe(0);
  });

  it('falls back to failure when success result construction throws', async () => {
    const postMessage = vi.fn();
    const context = contextFor({ on: () => undefined, postMessage });
    const failure = event('550e8400-e29b-41d4-a716-446655440002');

    context.track(Promise.resolve('ok'), {
      success: () => {
        throw new Error('schema construction failed');
      },
      failure: () => failure,
      failureEvent: 'test.success-build.failed',
    });
    const [tracked] = context.state.activeAppDataOperations;
    expect(tracked).toBeDefined();
    await tracked;

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage).toHaveBeenCalledWith(failure);
    expect(context.state.activeAppDataOperations.size).toBe(0);
  });
});
