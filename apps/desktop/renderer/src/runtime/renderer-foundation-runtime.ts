import type { CoreStatus } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';
import type { LegacyCompatibilityLoader } from '../compat/legacy-loader.js';
import type { RendererLifecycleRegistry } from './lifecycle-registry.js';
import {
  createRendererStartupDiagnostic,
  type RendererStartupContext,
  type RendererStartupDiagnostic,
  type RendererStartupFailure,
} from './startup-diagnostics.js';
import type { RendererStatusArbitrator } from './status-arbitrator.js';

export type RendererFoundationState =
  'idle' | 'starting' | 'running' | 'failed' | 'disposing' | 'disposed';

export type RendererFoundationStartResult =
  { readonly ok: true } | { readonly ok: false; readonly diagnostic: RendererStartupDiagnostic };

interface RendererFoundationBridge {
  readonly app: Pick<RendererBridgeAdapter['app'], 'getCoreStatus'>;
  readonly cancelAll: () => void;
}

export interface RendererFoundationRuntimeOptions {
  readonly bridge: RendererFoundationBridge;
  readonly legacy: LegacyCompatibilityLoader;
  readonly lifecycle: RendererLifecycleRegistry;
  readonly statuses: RendererStatusArbitrator;
  readonly rendererVersion: string;
  readonly protocolVersion: number;
  readonly now?: () => number;
}

export interface RendererFoundationRuntime {
  readonly state: RendererFoundationState;
  readonly diagnostic: RendererStartupDiagnostic | null;
  start(): Promise<RendererFoundationStartResult>;
  dispose(): Promise<void>;
}

const STARTING_STATUS_ID = 'renderer-foundation-starting';
const READY_STATUS_ID = 'renderer-foundation-ready';
const FAILED_STATUS_ID = 'renderer-foundation-failed';

export function createRendererFoundationRuntime(
  options: RendererFoundationRuntimeOptions,
): RendererFoundationRuntime {
  const now = options.now ?? Date.now;
  let state: RendererFoundationState = 'idle';
  let diagnostic: RendererStartupDiagnostic | null = null;
  let startPromise: Promise<RendererFoundationStartResult> | null = null;
  let disposePromise: Promise<void> | null = null;
  let shutdownRequested = false;

  const startupContext = (phase: RendererStartupContext['phase']): RendererStartupContext => ({
    occurredAt: new Date(now()).toISOString(),
    rendererVersion: options.rendererVersion,
    protocolVersion: options.protocolVersion,
    phase,
  });

  const fail = (
    failure: RendererStartupFailure,
    phase: RendererStartupContext['phase'],
  ): RendererFoundationStartResult => {
    diagnostic = createRendererStartupDiagnostic(failure, startupContext(phase));
    state = 'failed';
    options.statuses.publish({
      id: FAILED_STATUS_ID,
      priority: 'P0',
      message: diagnostic.message,
      persistence: 'sticky',
      createdAt: now(),
      replaces: [STARTING_STATUS_ID, READY_STATUS_ID],
    });
    return { ok: false, diagnostic };
  };

  const start = (): Promise<RendererFoundationStartResult> => {
    if (state === 'running') return Promise.resolve({ ok: true });
    if (state === 'disposed' || state === 'disposing') {
      return Promise.reject(new Error('Renderer foundation runtime is disposed.'));
    }
    if (startPromise) return startPromise;

    shutdownRequested = false;
    state = 'starting';
    diagnostic = null;
    options.statuses.publish({
      id: STARTING_STATUS_ID,
      priority: 'P2',
      message: 'Renderer foundation is starting.',
      persistence: 'sticky',
      createdAt: now(),
      replaces: [FAILED_STATUS_ID, READY_STATUS_ID],
    });

    startPromise = Promise.resolve()
      .then(async () => {
        const core = await options.bridge.app.getCoreStatus({ mode: 'replace' });
        if (shutdownRequested) {
          return fail(
            {
              code: 'RENDERER_START_CANCELLED',
              message: 'Renderer startup was cancelled during shutdown.',
              retryable: true,
            },
            'bridge',
          );
        }
        const bridgeFailure = failureFromCoreOutcome(core);
        if (bridgeFailure) return fail(bridgeFailure, 'bridge');

        try {
          await options.legacy.load();
        } catch (error) {
          return fail(
            {
              code: 'LEGACY_COMPATIBILITY_FAILED',
              message:
                error instanceof Error
                  ? error.message
                  : 'Legacy compatibility initialization failed.',
              retryable: false,
            },
            'legacy-compatibility',
          );
        }
        if (shutdownRequested) {
          await options.legacy.dispose();
          return fail(
            {
              code: 'RENDERER_START_CANCELLED',
              message: 'Renderer startup was cancelled during shutdown.',
              retryable: true,
            },
            'legacy-compatibility',
          );
        }

        state = 'running';
        options.statuses.publish({
          id: READY_STATUS_ID,
          priority: 'P3',
          message: 'Renderer foundation is ready.',
          persistence: 'transient',
          createdAt: now(),
          replaces: [STARTING_STATUS_ID, FAILED_STATUS_ID],
        });
        return { ok: true } as const;
      })
      .catch((error: unknown) =>
        fail(
          {
            code: 'RENDERER_FOUNDATION_FAILED',
            message: error instanceof Error ? error.message : 'Renderer foundation startup failed.',
            retryable: true,
          },
          'bridge',
        ),
      )
      .finally(() => {
        startPromise = null;
      });
    return startPromise;
  };

  const dispose = (): Promise<void> => {
    if (state === 'disposed') return Promise.resolve();
    if (disposePromise) return disposePromise;

    shutdownRequested = true;
    options.bridge.cancelAll();
    state = 'disposing';
    disposePromise = Promise.resolve()
      .then(async () => {
        if (startPromise) await startPromise;
        const results = await Promise.allSettled([
          options.legacy.dispose(),
          options.lifecycle.disposeAll(),
        ]);
        options.statuses.clearAll();
        state = 'disposed';
        const failures = results
          .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
          .map((result) => result.reason);
        if (failures.length > 0) {
          throw new AggregateError(failures, 'Renderer foundation disposal failed.');
        }
      })
      .finally(() => {
        disposePromise = null;
      });
    return disposePromise;
  };

  return {
    get state() {
      return state;
    },
    get diagnostic() {
      return diagnostic;
    },
    start,
    dispose,
  };
}

function failureFromCoreOutcome(
  outcome: BridgeRequestOutcome<CoreStatus>,
): RendererStartupFailure | null {
  if (outcome.state === 'failure') {
    return {
      ...outcome.error,
      details: outcome.error.details ?? undefined,
    };
  }
  if (outcome.state === 'cancelled') {
    return {
      code: 'CORE_STATUS_CANCELLED',
      message: 'Core status request was cancelled.',
      retryable: true,
    };
  }
  if (outcome.state === 'stale') {
    return {
      code: 'CORE_STATUS_STALE',
      message: 'Core status response was superseded by a newer request.',
      retryable: true,
    };
  }
  if (outcome.data.status !== 'healthy') {
    return {
      code: outcome.data.lastErrorCode ?? 'CORE_UNAVAILABLE',
      message: `Core is ${outcome.data.status}.`,
      retryable: true,
      diagnosticId: outcome.data.diagnosticId ?? undefined,
      userAction: 'Copy diagnostics, restart Core, or close the application safely.',
    };
  }
  return null;
}
