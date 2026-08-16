import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const entry = vi.hoisted(() => ({
  rootElement: null as null | { dataset: Record<string, string> },
  render: vi.fn(),
  createRoot: vi.fn(),
  flushPendingDraft: vi.fn(),
  applicationController: {} as Record<string, unknown>,
  bridge: {} as Record<string, unknown>,
  onShutdownPrepare: vi.fn(),
  acknowledgeShutdown: vi.fn(),
  stopShutdown: vi.fn(),
  lifecycleRegister: vi.fn(),
  recoveryStart: vi.fn(),
  recoveryDispose: vi.fn(),
  stopGlobalBoundary: vi.fn(),
  runtimeDispose: vi.fn(),
  runtime: {} as Record<string, unknown>,
  beforeUnload: null as null | (() => void),
}));

vi.mock('../../apps/desktop/renderer/src/app/renderer-application-controller.js', () => ({
  createRendererApplicationController: () => entry.applicationController,
}));
vi.mock('../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js', () => ({
  createWindowRendererBridgeAdapter: () => entry.bridge,
}));
vi.mock('../../apps/desktop/renderer/src/runtime/core-recovery-supervisor.js', () => ({
  createCoreRecoverySupervisor: () => ({ start: entry.recoveryStart, dispose: entry.recoveryDispose }),
}));
vi.mock('../../apps/desktop/renderer/src/runtime/global-error-boundary.js', () => ({
  installGlobalRendererErrorBoundary: () => entry.stopGlobalBoundary,
}));
vi.mock('../../apps/desktop/renderer/src/runtime/lifecycle-registry.js', () => ({
  RendererLifecycleRegistry: class RendererLifecycleRegistry {
    register(...args: unknown[]) {
      entry.lifecycleRegister(...args);
    }
  },
}));
vi.mock('../../apps/desktop/renderer/src/runtime/status-arbitrator.js', () => ({
  RendererStatusArbitrator: class RendererStatusArbitrator {},
}));
vi.mock('../../apps/desktop/renderer/src/runtime/renderer-foundation-runtime.js', () => ({
  createRendererFoundationRuntime: () => entry.runtime,
}));
vi.mock('../../apps/desktop/renderer/src/app/renderer-error-boundary.js', () => ({
  RendererErrorBoundary: ({ children }: { children?: unknown }) => children ?? null,
}));
vi.mock('../../apps/desktop/renderer/src/app/renderer-foundation-app.js', () => ({
  RendererFoundationApp: () => null,
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.resetModules();
  vi.doMock('react-dom/client', () => ({ createRoot: entry.createRoot }));
  entry.rootElement = { dataset: {} };
  entry.render.mockClear();
  entry.createRoot.mockReset();
  entry.createRoot.mockReturnValue({ render: entry.render });
  entry.flushPendingDraft.mockReset();
  entry.applicationController = { flushPendingDraft: entry.flushPendingDraft };
  entry.onShutdownPrepare.mockReset();
  entry.acknowledgeShutdown.mockReset();
  entry.stopShutdown.mockReset();
  entry.bridge = {
    lifecycle: {
      onShutdownPrepare: entry.onShutdownPrepare,
      acknowledgeShutdown: entry.acknowledgeShutdown,
    },
  };
  entry.onShutdownPrepare.mockImplementation((handler: unknown) => {
    entry.onShutdownPrepare.handler = handler;
    return entry.stopShutdown;
  });
  entry.lifecycleRegister.mockClear();
  entry.recoveryStart.mockClear();
  entry.recoveryDispose.mockClear();
  entry.stopGlobalBoundary.mockClear();
  entry.runtimeDispose.mockReset();
  entry.runtimeDispose.mockResolvedValue(undefined);
  entry.runtime = { dispose: entry.runtimeDispose };
  entry.beforeUnload = null;

  vi.stubGlobal('document', {
    getElementById: vi.fn(() => entry.rootElement),
  });
  vi.stubGlobal('window', {
    addEventListener: vi.fn((name: string, handler: () => void) => {
      if (name === 'beforeunload') entry.beforeUnload = handler;
    }),
  });
});

afterEach(() => {
  vi.doUnmock('react-dom/client');
  vi.unstubAllGlobals();
});

describe('renderer react entry coverage', () => {
  it('rejects a missing React root', async () => {
    entry.rootElement = null;
    await expect(import('../../apps/desktop/renderer/src/react-entry.js')).rejects.toThrow(
      'RENDERER_REACT_ROOT_MISSING',
    );
  });

  it('rejects duplicate React mounting', async () => {
    entry.rootElement = { dataset: { reactMounted: 'true' } };
    await expect(import('../../apps/desktop/renderer/src/react-entry.js')).rejects.toThrow(
      'RENDERER_REACT_ROOT_DUPLICATE',
    );
  });

  it('starts the renderer, registers lifecycle cleanup and acknowledges successful shutdown save', async () => {
    entry.flushPendingDraft.mockResolvedValue(true);
    await import('../../apps/desktop/renderer/src/react-entry.js');

    expect(entry.createRoot).toHaveBeenCalledWith(entry.rootElement);
    expect(entry.lifecycleRegister).toHaveBeenCalledWith(
      'react-root',
      'core-recovery-supervisor',
      expect.any(Function),
    );
    expect(entry.lifecycleRegister).toHaveBeenCalledWith(
      'react-root',
      'global-error-boundary',
      entry.stopGlobalBoundary,
    );
    expect(entry.lifecycleRegister).toHaveBeenCalledWith(
      'react-root',
      'shutdown-listener',
      entry.stopShutdown,
    );
    expect(entry.recoveryStart).toHaveBeenCalledOnce();
    expect(entry.rootElement?.dataset.reactMounted).toBe('true');
    expect(entry.render).toHaveBeenCalledOnce();

    const shutdownHandler = entry.onShutdownPrepare.handler as
      | ((request: Record<string, unknown>) => void)
      | undefined;
    expect(shutdownHandler).toBeTypeOf('function');
    shutdownHandler?.({ requestId: 'request-1' });
    await flush();
    expect(entry.acknowledgeShutdown).toHaveBeenCalledWith({
      requestId: 'request-1',
      saved: true,
    });

    const recoveryCleanup = entry.lifecycleRegister.mock.calls.find(
      (call) => call[1] === 'core-recovery-supervisor',
    )?.[2];
    if (typeof recoveryCleanup !== 'function') throw new Error('Missing recovery cleanup');
    recoveryCleanup();
    expect(entry.recoveryDispose).toHaveBeenCalledOnce();
  });

  it('acknowledges failed shutdown save and disposes runtime before unload', async () => {
    entry.flushPendingDraft.mockRejectedValue(new Error('save failed'));
    await import('../../apps/desktop/renderer/src/react-entry.js');
    const shutdownHandler = entry.onShutdownPrepare.handler as
      | ((request: Record<string, unknown>) => void)
      | undefined;
    shutdownHandler?.({ requestId: 'request-2' });
    await flush();
    expect(entry.acknowledgeShutdown).toHaveBeenCalledWith({
      requestId: 'request-2',
      saved: false,
    });
    expect(entry.beforeUnload).toBeTypeOf('function');
    entry.beforeUnload?.();
    await flush();
    expect(entry.runtimeDispose).toHaveBeenCalledOnce();
  });
});
