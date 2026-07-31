import { PROTOCOL_VERSION } from '@worldforge/contracts';
import { createRoot } from 'react-dom/client';

import { RendererErrorBoundary } from './app/renderer-error-boundary.js';
import { RendererFoundationApp } from './app/renderer-foundation-app.js';
import { createWindowRendererBridgeAdapter } from './bridge/renderer-bridge-adapter.js';
import { createLegacyCompatibilityLoader } from './compat/legacy-loader.js';
import { createLegacySurfaceController } from './compat/legacy-surface.js';
import { createCoreRecoverySupervisor } from './runtime/core-recovery-supervisor.js';
import { installGlobalRendererErrorBoundary } from './runtime/global-error-boundary.js';
import { flushRegisteredDraft } from './runtime/draft-flush-registry.js';
import { RendererLifecycleRegistry } from './runtime/lifecycle-registry.js';
import { createRendererFoundationRuntime } from './runtime/renderer-foundation-runtime.js';
import { RendererStatusArbitrator } from './runtime/status-arbitrator.js';

const rootElement = document.getElementById('react-root');
if (!rootElement) throw new Error('RENDERER_REACT_ROOT_MISSING');
if (rootElement.dataset.reactMounted === 'true') {
  throw new Error('RENDERER_REACT_ROOT_DUPLICATE');
}

const bridge = createWindowRendererBridgeAdapter();
const legacySurface = createLegacySurfaceController();
const lifecycle = new RendererLifecycleRegistry();
const statuses = new RendererStatusArbitrator();
const retiredCompatibilityBoundary = createLegacyCompatibilityLoader(async () => undefined);
const coreRecovery = createCoreRecoverySupervisor({ bridge, flushDraft: flushRegisteredDraft });
const stopGlobalErrorBoundary = installGlobalRendererErrorBoundary();
const runtime = createRendererFoundationRuntime({
  bridge,
  legacy: retiredCompatibilityBoundary,
  lifecycle,
  statuses,
  rendererVersion: '1.0.0',
  protocolVersion: PROTOCOL_VERSION,
});
const root = createRoot(rootElement);

lifecycle.register('react-root', 'core-recovery-supervisor', () => coreRecovery.dispose());
lifecycle.register('react-root', 'global-error-boundary', stopGlobalErrorBoundary);
const stopShutdownListener = bridge.lifecycle.onShutdownPrepare((request) => {
  void flushRegisteredDraft()
    .then((saved) => bridge.lifecycle.acknowledgeShutdown({ ...request, saved }))
    .catch(() => bridge.lifecycle.acknowledgeShutdown({ ...request, saved: false }));
});
lifecycle.register('react-root', 'shutdown-listener', stopShutdownListener);
coreRecovery.start();
rootElement.dataset.reactMounted = 'true';
root.render(
  <RendererErrorBoundary>
    <RendererFoundationApp bridge={bridge} legacySurface={legacySurface} runtime={runtime} />
  </RendererErrorBoundary>,
);

window.addEventListener(
  'beforeunload',
  () => {
    void runtime.dispose();
  },
  { once: true },
);
