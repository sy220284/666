import { describe, expect, it, vi } from 'vitest';

import type { CoreStatus } from '@worldforge/contracts';

import type { BridgeRequestOutcome } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import { createLegacyCompatibilityLoader } from '../../apps/desktop/renderer/src/compat/legacy-loader.js';
import { createRendererFoundationRuntime } from '../../apps/desktop/renderer/src/runtime/renderer-foundation-runtime.js';
import { RendererLifecycleRegistry } from '../../apps/desktop/renderer/src/runtime/lifecycle-registry.js';
import { RendererStatusArbitrator } from '../../apps/desktop/renderer/src/runtime/status-arbitrator.js';

const healthyCore = (): BridgeRequestOutcome<CoreStatus> => ({
  state: 'success',
  generation: 1,
  requestId: 'core-status',
  data: {
    status: 'healthy',
    pid: 123,
    restartCount: 0,
    lastErrorCode: null,
    diagnosticId: null,
  },
});

describe('M3-07 renderer foundation runtime', () => {
  it('starts bridge and legacy compatibility once for concurrent callers', async () => {
    const getCoreStatus = vi.fn(async () => healthyCore());
    const loadLegacy = vi.fn(async () => undefined);
    const runtime = createRendererFoundationRuntime({
      bridge: { app: { getCoreStatus }, cancelAll: vi.fn() },
      legacy: createLegacyCompatibilityLoader(loadLegacy),
      lifecycle: new RendererLifecycleRegistry(),
      statuses: new RendererStatusArbitrator(),
      rendererVersion: '0.1.0',
      protocolVersion: 1,
      now: () => 1_000,
    });

    await expect(Promise.all([runtime.start(), runtime.start(), runtime.start()])).resolves.toEqual(
      [{ ok: true }, { ok: true }, { ok: true }],
    );
    expect(getCoreStatus).toHaveBeenCalledTimes(1);
    expect(loadLegacy).toHaveBeenCalledTimes(1);
    expect(runtime.state).toBe('running');
    expect(runtime.diagnostic).toBeNull();
  });

  it('converts contract failure metadata into a P0 startup diagnostic', async () => {
    const statuses = new RendererStatusArbitrator();
    const loadLegacy = vi.fn(async () => undefined);
    const runtime = createRendererFoundationRuntime({
      bridge: {
        app: {
          getCoreStatus: vi.fn(async () => ({
            state: 'failure',
            generation: 1,
            requestId: 'core-status',
            error: {
              code: 'CORE_PROTOCOL_MISMATCH',
              message: 'Core protocol mismatch.',
              retryable: false,
              diagnosticId: 'diag-core-protocol',
              userAction: 'Update the application.',
            },
          })),
        },
        cancelAll: vi.fn(),
      },
      legacy: createLegacyCompatibilityLoader(loadLegacy),
      lifecycle: new RendererLifecycleRegistry(),
      statuses,
      rendererVersion: '0.1.0',
      protocolVersion: 1,
      now: () => Date.parse('2026-07-21T12:00:00.000Z'),
    });

    await expect(runtime.start()).resolves.toMatchObject({
      ok: false,
      diagnostic: {
        severity: 'P0',
        code: 'CORE_PROTOCOL_MISMATCH',
        diagnosticId: 'diag-core-protocol',
        userAction: 'Update the application.',
      },
    });
    expect(loadLegacy).not.toHaveBeenCalled();
    expect(runtime.state).toBe('failed');
    expect(statuses.current()).toMatchObject({ priority: 'P0', id: 'renderer-foundation-failed' });
  });

  it('refuses a non-healthy Core before loading the legacy business surface', async () => {
    const loadLegacy = vi.fn(async () => undefined);
    const runtime = createRendererFoundationRuntime({
      bridge: {
        app: {
          getCoreStatus: vi.fn(async () => ({
            ...healthyCore(),
            data: {
              status: 'crashed',
              pid: null,
              restartCount: 2,
              lastErrorCode: 'CORE_CRASHED',
              diagnosticId: 'diag-core-crashed',
            },
          })),
        },
        cancelAll: vi.fn(),
      },
      legacy: createLegacyCompatibilityLoader(loadLegacy),
      lifecycle: new RendererLifecycleRegistry(),
      statuses: new RendererStatusArbitrator(),
      rendererVersion: '0.1.0',
      protocolVersion: 1,
    });

    await expect(runtime.start()).resolves.toMatchObject({
      ok: false,
      diagnostic: {
        code: 'CORE_CRASHED',
        retryable: true,
        diagnosticId: 'diag-core-crashed',
      },
    });
    expect(loadLegacy).not.toHaveBeenCalled();
  });

  it('cancels bridge requests and disposes legacy and registered resources once', async () => {
    const cancelAll = vi.fn();
    const disposeLegacy = vi.fn(async () => undefined);
    const cleanup = vi.fn(async () => undefined);
    const lifecycle = new RendererLifecycleRegistry();
    lifecycle.register('react-root', 'subscription:status', cleanup);
    const runtime = createRendererFoundationRuntime({
      bridge: { app: { getCoreStatus: vi.fn(async () => healthyCore()) }, cancelAll },
      legacy: createLegacyCompatibilityLoader(async () => undefined, disposeLegacy),
      lifecycle,
      statuses: new RendererStatusArbitrator(),
      rendererVersion: '0.1.0',
      protocolVersion: 1,
    });

    await runtime.start();
    await Promise.all([runtime.dispose(), runtime.dispose()]);

    expect(cancelAll).toHaveBeenCalledTimes(1);
    expect(disposeLegacy).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(runtime.state).toBe('disposed');
    expect(lifecycle.size).toBe(0);
  });
});
