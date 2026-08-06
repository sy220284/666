import { randomUUID } from 'node:crypto';

import { PROTOCOL_VERSION, type CoreEvent } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  requireCommandFingerprint,
  runWithoutCommandIdentity,
} from '../../packages/core-service/src/command-identity-context.js';
import {
  createUtilityControlContext,
  type UtilityControlRouterOptions,
} from '../../packages/core-service/src/utility-control-context.js';
import { dispatchUtilityLifecycle } from '../../packages/core-service/src/utility-control-lifecycle.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface RuntimeOverrides {
  readonly execute?: () => unknown;
  readonly savePreferences?: (requestId: string, preferences: unknown) => Promise<unknown>;
}

function options(
  postMessage: (message: CoreEvent) => void,
  overrides: RuntimeOverrides = {},
): UtilityControlRouterOptions {
  return {
    parentPort: { on: () => undefined, postMessage },
    startedAt: Date.now(),
    taskProtocol: {
      accepting: true,
      activeTaskCount: 0,
      beginDrain: async () => undefined,
      attachPort: () => () => undefined,
      close: () => undefined,
    },
    taskCommands: {
      execute:
        overrides.execute ?? (() => ({ ok: true, requestId: randomUUID(), data: { tasks: [] } })),
    },
    appRuntime: {
      windowPreferences: {
        get: () => null,
        save:
          overrides.savePreferences ??
          (async (_requestId: string, preferences: unknown) => preferences),
      },
      close: async () => undefined,
    },
    projectWorkspace: { shutdown: async () => undefined },
  } as unknown as UtilityControlRouterOptions;
}

function preferences() {
  return {
    displayId: 'display-1',
    boundsDip: { x: 0, y: 0, width: 1280, height: 800 },
    scaleFactor: 1,
    maximized: false,
    workspaceAlignment: 'left' as const,
    uiScalePercent: 100,
    bodyFontSize: 18,
    contentWidth: 'standard' as const,
  };
}

describe('M10-13 Utility lifecycle boundary', () => {
  it('returns a structured task failure when command execution throws', () => {
    const postMessage = vi.fn();
    const runtime = options(postMessage, {
      execute: () => {
        throw new Error('unexpected task router failure');
      },
    });
    const context = createUtilityControlContext(runtime);
    const requestId = randomUUID();

    dispatchUtilityLifecycle(
      context,
      {
        type: 'core.command',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        envelope: {
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          command: 'task.listActive',
          payload: {},
          sentAt: new Date().toISOString(),
        },
      },
      [],
    );

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'core.command-result',
      requestId,
      result: {
        ok: false,
        error: { code: 'COMMON_INTERNAL_999', retryable: true },
      },
    });
  });

  it('binds window preference persistence to a stable command identity', async () => {
    const postMessage = vi.fn();
    let fingerprint: string | null = null;
    const runtime = options(postMessage, {
      savePreferences: async (_requestId, value) => {
        fingerprint = requireCommandFingerprint();
        return value;
      },
    });
    const context = createUtilityControlContext(runtime);
    const requestId = randomUUID();

    runWithoutCommandIdentity(() =>
      dispatchUtilityLifecycle(
        context,
        {
          type: 'core.window-preferences.set',
          protocolVersion: PROTOCOL_VERSION,
          requestId,
          preferences: preferences(),
        },
        [],
      ),
    );
    const [tracked] = context.state.activeAppDataOperations;
    expect(tracked).toBeDefined();
    await tracked;

    expect(fingerprint).not.toBeNull();
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'core.window-preferences-result',
      requestId,
      result: { ok: true },
    });
  });

  it('tracks window preference persistence and returns its structured failure', async () => {
    const postMessage = vi.fn();
    const runtime = options(postMessage, {
      savePreferences: async () => Promise.reject(new Error('write failed')),
    });
    const context = createUtilityControlContext(runtime);
    const requestId = randomUUID();

    dispatchUtilityLifecycle(
      context,
      {
        type: 'core.window-preferences.set',
        protocolVersion: PROTOCOL_VERSION,
        requestId,
        preferences: preferences(),
      },
      [],
    );
    const [tracked] = context.state.activeAppDataOperations;
    expect(tracked).toBeDefined();
    await tracked;

    expect(postMessage).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]?.[0]).toMatchObject({
      type: 'core.window-preferences-result',
      requestId,
      result: { ok: false },
    });
    expect(context.state.activeAppDataOperations.size).toBe(0);
  });

  it('does not report drained until every tracked operation has settled', async () => {
    const postMessage = vi.fn();
    const runtime = options(postMessage);
    const gate = deferred<string>();
    const context = createUtilityControlContext(runtime);
    context.track(gate.promise, {
      success: () => ({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: randomUUID(),
        status: 'healthy',
        uptimeMs: 1,
      }),
      failure: () => ({
        type: 'core.health',
        protocolVersion: PROTOCOL_VERSION,
        requestId: randomUUID(),
        status: 'degraded',
        uptimeMs: 1,
      }),
      failureEvent: 'test.pending.failed',
    });
    const requestId = randomUUID();

    dispatchUtilityLifecycle(
      context,
      { type: 'core.drain', protocolVersion: PROTOCOL_VERSION, requestId },
      [],
    );
    await Promise.resolve();
    expect(postMessage.mock.calls.some(([message]) => message.type === 'core.drained')).toBe(false);

    gate.resolve('done');
    await Promise.all([...context.state.activeAppDataOperations]);
    await Promise.resolve();

    expect(postMessage.mock.calls.some(([message]) => message.type === 'core.drained')).toBe(true);
  });
});
