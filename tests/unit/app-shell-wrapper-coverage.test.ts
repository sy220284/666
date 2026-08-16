import { createRequire } from 'node:module';

import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RendererApplicationController } from '../../apps/desktop/renderer/src/app/renderer-application-controller.js';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const capture = vi.hoisted(() => ({ m3: vi.fn() }));
vi.mock('../../apps/desktop/renderer/src/app/app-shell-m3.js', () => ({
  AppShell: (props: Record<string, unknown>) => {
    capture.m3(props);
    return null;
  },
}));

import { AppShell } from '../../apps/desktop/renderer/src/app/app-shell.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => { unmount(): void };
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('AppShell placement lifecycle coverage', () => {
  it('refreshes placement on mount, resize and presentation changes and cleans listeners', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const listeners = new Map<string, () => void>();
    const addEventListener = vi.fn((name: string, handler: () => void) => listeners.set(name, handler));
    const removeEventListener = vi.fn();
    vi.stubGlobal('window', { addEventListener, removeEventListener });
    vi.stubGlobal('document', { documentElement: {} });
    const observe = vi.fn();
    const disconnect = vi.fn();
    const MutationObserver = vi.fn(function MutationObserver(this: unknown, callback: () => void) {
      void callback;
      return { observe, disconnect };
    });
    vi.stubGlobal('MutationObserver', MutationObserver);

    const refreshPlacement = vi.fn();
    const applicationController = contractInput<RendererApplicationController>({ refreshPlacement });
    const bridge = contractInput<RendererBridgeAdapter>({});
    let renderer!: { unmount(): void };
    await act(async () => {
      renderer = create(createElement(AppShell, { applicationController, bridge }));
      await Promise.resolve();
    });

    expect(refreshPlacement).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(addEventListener).toHaveBeenCalledWith(
      'worldforge:presentation-changed',
      expect.any(Function),
    );
    expect(observe).toHaveBeenCalledWith({}, { attributes: true, attributeFilter: ['style'] });
    listeners.get('resize')?.();
    listeners.get('worldforge:presentation-changed')?.();
    expect(refreshPlacement).toHaveBeenCalledTimes(3);
    expect(capture.m3).toHaveBeenCalled();

    await act(async () => renderer.unmount());
    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });
});
