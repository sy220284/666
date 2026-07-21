import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

import {
  BridgeRequestCoordinator,
  DuplicateBridgeRequestError,
} from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import { createLegacyCompatibilityLoader } from '../../apps/desktop/renderer/src/compat/legacy-loader.js';
import { RendererLifecycleRegistry } from '../../apps/desktop/renderer/src/runtime/lifecycle-registry.js';
import { RendererStatusArbitrator } from '../../apps/desktop/renderer/src/runtime/status-arbitrator.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

describe('M3-07 bridge request lifecycle', () => {
  it('returns successful bridge data with its request identity', async () => {
    const coordinator = new BridgeRequestCoordinator();

    await expect(
      coordinator.run('app.info', async ({ generation }) =>
        success('request-success', { generation }),
      ),
    ).resolves.toEqual({
      state: 'success',
      generation: 1,
      requestId: 'request-success',
      data: { generation: 1 },
    });
    expect(coordinator.isPending('app.info')).toBe(false);
  });

  it('preserves safe contract failure metadata', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const failure = {
      ok: false,
      requestId: 'request-failure',
      error: {
        code: 'COMMON_INTERNAL_999',
        message: 'Core rejected the request.',
        retryable: false,
        userAction: 'Copy diagnostics and restart Core.',
        diagnosticId: 'diag-renderer-001',
      },
    } as const satisfies CommandResult<never>;

    await expect(coordinator.run('app.status', async () => failure)).resolves.toEqual({
      state: 'failure',
      generation: 1,
      requestId: 'request-failure',
      error: failure.error,
    });
  });

  it('blocks duplicate submissions for the same request key', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let resolveFirst: ((result: CommandResult<string>) => void) | undefined;
    const first = coordinator.run(
      'project.open',
      () =>
        new Promise<CommandResult<string>>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    await expect(
      coordinator.run('project.open', async () => success('duplicate', 'duplicate')),
    ).rejects.toBeInstanceOf(DuplicateBridgeRequestError);

    resolveFirst?.(success('request-first', 'opened'));
    await expect(first).resolves.toMatchObject({
      state: 'success',
      data: 'opened',
    });
  });

  it('marks replaced completions stale', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let resolveFirst: ((result: CommandResult<string>) => void) | undefined;
    const first = coordinator.run(
      'project.refresh',
      () =>
        new Promise<CommandResult<string>>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = coordinator.run(
      'project.refresh',
      async () => success('request-second', 'new'),
      { mode: 'replace' },
    );

    await expect(second).resolves.toMatchObject({
      state: 'success',
      data: 'new',
      generation: 2,
    });
    resolveFirst?.(success('request-first', 'old'));
    await expect(first).resolves.toEqual({ state: 'stale', generation: 1 });
  });

  it('cancels from an external AbortSignal', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const external = new AbortController();
    const pending = coordinator.run(
      'project.close',
      ({ signal }) =>
        new Promise<CommandResult<never>>((_, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('aborted');
              error.name = 'AbortError';
              reject(error);
            },
            { once: true },
          );
        }),
      { signal: external.signal },
    );

    external.abort();
    await expect(pending).resolves.toEqual({
      state: 'cancelled',
      generation: 1,
    });
  });
});

describe('M3-07 renderer status arbitration', () => {
  it('keeps P0 and P1 above transient success', () => {
    const arbitrator = new RendererStatusArbitrator();
    arbitrator.publish({
      id: 'save-ok',
      priority: 'P3',
      message: 'Saved',
      persistence: 'transient',
      createdAt: 30,
    });
    arbitrator.publish({
      id: 'core-crashed',
      priority: 'P0',
      message: 'Core unavailable',
      persistence: 'sticky',
      createdAt: 10,
    });
    arbitrator.publish({
      id: 'new-toast',
      priority: 'P3',
      message: 'Done',
      persistence: 'transient',
      createdAt: 40,
    });

    expect(arbitrator.current()?.id).toBe('core-crashed');
  });

  it('prefers sticky state and supports explicit replacement', () => {
    const arbitrator = new RendererStatusArbitrator();
    arbitrator.publish({
      id: 'saving',
      priority: 'P2',
      message: 'Saving',
      persistence: 'sticky',
      createdAt: 10,
    });
    arbitrator.publish({
      id: 'syncing',
      priority: 'P2',
      message: 'Syncing',
      persistence: 'transient',
      createdAt: 20,
    });
    expect(arbitrator.current()?.id).toBe('saving');

    arbitrator.publish({
      id: 'saved',
      priority: 'P3',
      message: 'Saved',
      persistence: 'transient',
      createdAt: 30,
      replaces: ['saving', 'syncing'],
    });
    expect(arbitrator.current()?.id).toBe('saved');
  });
});

describe('M3-07 compatibility lifecycle', () => {
  it('runs registered cleanup once and isolates cleanup by owner', async () => {
    const registry = new RendererLifecycleRegistry();
    const first = vi.fn();
    const second = vi.fn();
    const unregister = registry.register('legacy-renderer', 'listener:first', first);
    registry.register('react-root', 'listener:second', second);

    await unregister();
    await unregister();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    await registry.disposeOwner('react-root');
    expect(second).toHaveBeenCalledTimes(1);
    expect(registry.size).toBe(0);
  });

  it('loads and disposes the legacy renderer once', async () => {
    const load = vi.fn(async () => undefined);
    const dispose = vi.fn(async () => undefined);
    const loader = createLegacyCompatibilityLoader(load, dispose);

    await Promise.all([loader.load(), loader.load(), loader.load()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(loader.state).toBe('loaded');

    await Promise.all([loader.dispose(), loader.dispose()]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(loader.state).toBe('idle');
  });
});

describe('M3-07 named renderer bridge adapter', () => {
  it('routes named app and project calls through request lifecycle keys', async () => {
    const adapter = createRendererBridgeAdapter({
      app: {
        getInfo: vi.fn(async () => success('info-request', { name: 'WorldForge' })),
        getCoreStatus: vi.fn(async () => success('status-request', { status: 'healthy' })),
        restartCore: vi.fn(async () => success('restart-request', { accepted: true })),
      },
      project: {
        listRecent: vi.fn(async () => success('recent-request', { projects: [{ id: 'p1' }] })),
        getActive: vi.fn(async () => success('active-request', { id: 'p1' })),
      },
    });

    await expect(adapter.app.getInfo()).resolves.toMatchObject({
      state: 'success',
      requestId: 'info-request',
    });
    await expect(adapter.project.getActive()).resolves.toMatchObject({
      state: 'success',
      data: { id: 'p1' },
    });
  });
});
