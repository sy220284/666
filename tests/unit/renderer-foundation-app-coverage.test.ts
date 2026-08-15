import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { RendererApplicationController } from '../../apps/desktop/renderer/src/app/renderer-application-controller.js';
import type { RendererFoundationRuntime } from '../../apps/desktop/renderer/src/runtime/renderer-foundation-runtime.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

vi.mock('../../apps/desktop/renderer/src/runtime/capability-runtime.js', () => ({
  createCapabilityTrackingBridge: (bridge: unknown) => bridge,
}));
vi.mock('../../apps/desktop/renderer/src/app/app-shell.js', () => ({
  AppShell: () => 'mock-app-shell',
}));
vi.mock('../../apps/desktop/renderer/src/components/draft-flush-failure-dialog.js', () => ({
  DraftFlushFailureDialog: () => 'mock-flush-dialog',
}));

import { RendererFoundationApp } from '../../apps/desktop/renderer/src/app/renderer-foundation-app.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestInstance {
  readonly children: readonly (TestInstance | string)[];
}
interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function props(runtime: RendererFoundationRuntime) {
  return {
    runtime,
    bridge: contractInput<RendererBridgeAdapter>({}),
    applicationController: contractInput<RendererApplicationController>({}),
  };
}

function runtimeWith(start: RendererFoundationRuntime['start']) {
  const dispose = vi.fn().mockResolvedValue(undefined);
  return {
    runtime: contractInput<RendererFoundationRuntime>({
      state: 'idle',
      diagnostic: null,
      start,
      dispose,
    }),
    dispose,
  };
}

async function render(runtime: RendererFoundationRuntime): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(RendererFoundationApp, props(runtime)));
    await flushPromises();
  });
  return renderer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RendererFoundationApp lifecycle coverage', () => {
  it('shows the startup state and ignores a late completion after unmount', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const pending = deferred<{ readonly ok: true }>();
    const start = vi.fn(() => pending.promise);
    const { runtime, dispose } = runtimeWith(start);

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(createElement(RendererFoundationApp, props(runtime)));
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('正在启动React界面底座');

    await act(async () => renderer.unmount());
    expect(dispose).toHaveBeenCalledOnce();
    await act(async () => {
      pending.resolve({ ok: true });
      await flushPromises();
    });
    expect(start).toHaveBeenCalledOnce();
  });

  it('renders startup diagnostics with and without optional author guidance', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const diagnostic = {
      severity: 'P0' as const,
      code: 'RENDERER_FOUNDATION_FAILED',
      message: '界面底座初始化失败。',
      retryable: true,
      diagnosticId: 'diag-foundation-1',
      userAction: '重新打开应用。',
      occurredAt: '2026-08-15T00:00:00.000Z',
      rendererVersion: '1.0.0',
      protocolVersion: 1,
      phase: 'bridge' as const,
    };
    const first = runtimeWith(vi.fn().mockResolvedValue({ ok: false, diagnostic }));
    const firstRenderer = await render(first.runtime);
    expect(textContent(firstRenderer.root)).toContain('RENDERER_FOUNDATION_FAILED');
    expect(textContent(firstRenderer.root)).toContain('诊断ID diag-foundation-1');
    expect(textContent(firstRenderer.root)).toContain('重新打开应用。');
    await act(async () => firstRenderer.unmount());

    const secondDiagnostic = { ...diagnostic, diagnosticId: undefined, userAction: undefined };
    const second = runtimeWith(
      vi.fn().mockResolvedValue({ ok: false, diagnostic: secondDiagnostic }),
    );
    const secondRenderer = await render(second.runtime);
    expect(textContent(secondRenderer.root)).toContain('界面底座初始化失败。');
    expect(textContent(secondRenderer.root)).not.toContain('诊断ID');
    await act(async () => secondRenderer.unmount());
  });

  it('switches from startup to the running shell after foundation startup succeeds', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const started = runtimeWith(vi.fn().mockResolvedValue({ ok: true }));
    const renderer = await render(started.runtime);

    expect(textContent(renderer.root)).toContain('mock-app-shell');
    expect(textContent(renderer.root)).toContain('mock-flush-dialog');
    await act(async () => renderer.unmount());
    expect(started.dispose).toHaveBeenCalledOnce();
  });
});
