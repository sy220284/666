import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';
import { deriveCapabilityMatrix } from './capability-matrix.js';

interface CapabilityRuntimeState {
  initialized: boolean;
  hydrated: boolean;
  coreStatus: CoreStatus | null;
  project: ProjectWorkspaceSummary | null;
  providerCount: number;
  verifiedProviderCount: number;
}

const state: CapabilityRuntimeState = {
  initialized: false,
  hydrated: false,
  coreStatus: null,
  project: null,
  providerCount: 0,
  verifiedProviderCount: 0,
};

function successData<Data>(outcome: BridgeRequestOutcome<Data>): Data | null {
  return outcome.state === 'success' ? outcome.data : null;
}

function trackDomain<Domain extends object>(
  domain: Domain,
  after: (method: string, outcome: BridgeRequestOutcome<unknown>) => void,
): Domain {
  return new Proxy(domain, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== 'string' || typeof value !== 'function') return value;
      return (...args: unknown[]) =>
        Promise.resolve((value as (...received: unknown[]) => unknown).apply(target, args)).then(
          (outcome: BridgeRequestOutcome<unknown>) => {
            after(property, outcome);
            return outcome;
          },
        );
    },
  });
}

export function createCapabilityTrackingBridge(
  bridge: RendererBridgeAdapter,
): RendererBridgeAdapter {
  state.initialized = true;
  state.hydrated = true;

  return {
    ...bridge,
    app: trackDomain(bridge.app, (method, outcome) => {
      if (method !== 'getCoreStatus') return;
      const coreStatus = successData(outcome as BridgeRequestOutcome<CoreStatus>);
      if (coreStatus) state.coreStatus = coreStatus;
    }),
    project: trackDomain(bridge.project, (method, outcome) => {
      if (method === 'close' && outcome.state === 'success') {
        state.project = null;
        return;
      }
      if (!['getActive', 'create', 'openSelected', 'openRecent', 'move'].includes(method)) return;
      const project = successData(
        outcome as BridgeRequestOutcome<ProjectWorkspaceSummary | null>,
      );
      if (outcome.state === 'success') state.project = project;
    }),
    providers: trackDomain(bridge.providers, (method, outcome) => {
      if (method !== 'list' || outcome.state !== 'success') return;
      const data = outcome.data as { readonly providers?: readonly unknown[] };
      state.providerCount = data.providers?.length ?? 0;
    }),
  };
}

export function currentRuntimeNavigationAvailability() {
  if (!state.initialized) return null;
  return deriveCapabilityMatrix(state).navigation;
}

export function currentRuntimeProjectMode() {
  if (!state.initialized) return null;
  return deriveCapabilityMatrix(state).project.mode;
}

export function resetCapabilityRuntimeForTests(): void {
  state.initialized = false;
  state.hydrated = false;
  state.coreStatus = null;
  state.project = null;
  state.providerCount = 0;
  state.verifiedProviderCount = 0;
}
