import { PROTOCOL_VERSION } from '@worldforge/contracts';
import { createRoot } from 'react-dom/client';

import { createRendererApplicationController } from './app/renderer-application-controller.js';
import { RendererErrorBoundary } from './app/renderer-error-boundary.js';
import { RendererFoundationApp } from './app/renderer-foundation-app.js';
import { createWindowRendererBridgeAdapter } from './bridge/renderer-bridge-adapter.js';
import { createCoreRecoverySupervisor } from './runtime/core-recovery-supervisor.js';
import { installGlobalRendererErrorBoundary } from './runtime/global-error-boundary.js';
import { RendererLifecycleRegistry } from './runtime/lifecycle-registry.js';
import { createRendererFoundationRuntime } from './runtime/renderer-foundation-runtime.js';
import { RendererStatusArbitrator } from './runtime/status-arbitrator.js';
import { confirmRegisteredUnsavedChangesForShutdown } from './runtime/unsaved-changes.js';

const rootElement = document.getElementById('react-root');
if (!rootElement) throw new Error('RENDERER_REACT_ROOT_MISSING');
if (rootElement.dataset.reactMounted === 'true') {
  throw new Error('RENDERER_REACT_ROOT_DUPLICATE');
}

const bridge = createWindowRendererBridgeAdapter();
const applicationController = createRendererApplicationController();
const lifecycle = new RendererLifecycleRegistry();
const statuses = new RendererStatusArbitrator();
const coreRecovery = createCoreRecoverySupervisor({
  bridge,
  flushDraft: applicationController.flushPendingDraft,
});
const stopGlobalErrorBoundary = installGlobalRendererErrorBoundary();
const runtime = createRendererFoundationRuntime({
  bridge,
  lifecycle,
  statuses,
  rendererVersion: '1.0.0',
  protocolVersion: PROTOCOL_VERSION,
});
const root = createRoot(rootElement);

lifecycle.register('react-root', 'core-recovery-supervisor', () => coreRecovery.dispose());
lifecycle.register('react-root', 'global-error-boundary', stopGlobalErrorBoundary);
const stopShutdownListener = bridge.lifecycle.onShutdownPrepare((request) => {
  if (!confirmRegisteredUnsavedChangesForShutdown('关闭应用')) {
    void bridge.lifecycle.acknowledgeShutdown({ ...request, saved: false });
    return;
  }
  void applicationController
    .flushPendingDraft()
    .then((saved) => bridge.lifecycle.acknowledgeShutdown({ ...request, saved }))
    .catch(() => bridge.lifecycle.acknowledgeShutdown({ ...request, saved: false }));
});
lifecycle.register('react-root', 'shutdown-listener', stopShutdownListener);
coreRecovery.start();
rootElement.dataset.reactMounted = 'true';
root.render(
  <RendererErrorBoundary>
    <RendererFoundationApp
      applicationController={applicationController}
      bridge={bridge}
      runtime={runtime}
    />
  </RendererErrorBoundary>,
);

window.addEventListener(
  'beforeunload',
  () => {
    void runtime.dispose();
  },
  { once: true },
);
