import type {
  CoreStatus,
  ProjectWorkspaceSummary,
} from "@worldforge/contracts";

import type { RendererBridgeAdapter } from "../bridge/renderer-bridge-adapter.js";
import type { BridgeRequestOutcome } from "../bridge/request-lifecycle.js";
import { deriveCapabilityMatrix } from "./capability-matrix.js";

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

const requiredProductResources = new Set([
  "app.getCoreStatus",
  "app.getWindowPreferences",
  "settings.get",
  "project.getActive",
  "project.listRecent",
  "task.listActive",
  "providers.list",
]);
const observedProductResources = new Set<string>();

function successData<Data>(outcome: BridgeRequestOutcome<Data>): Data | null {
  return outcome.state === "success" ? outcome.data : null;
}

function updateReadySignals(): void {
  if (typeof document === "undefined") return;
  const matrix = deriveCapabilityMatrix(state);
  const productReady =
    matrix.application.coreAvailable &&
    [...requiredProductResources].every((resource) =>
      observedProductResources.has(resource),
    );
  document.body.dataset.shellReady = String(matrix.application.shellAvailable);
  document.body.dataset.coreReady = String(matrix.application.coreAvailable);
  document.body.dataset.productReady = String(productReady);
  document.body.dataset.projectReady = String(matrix.project.projectReadable);
  document.body.dataset.projectMode = matrix.project.mode;
}

function observe(
  domain: string,
  method: string,
  outcome: BridgeRequestOutcome<unknown>,
): void {
  if (outcome.state === "success")
    observedProductResources.add(`${domain}.${method}`);
}

function trackDomain<Domain extends object>(
  domainName: string,
  domain: Domain,
  after: (method: string, outcome: BridgeRequestOutcome<unknown>) => void,
): Domain {
  return new Proxy(domain, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || typeof value !== "function")
        return value;
      return async (...args: unknown[]) => {
        const outcome = await (
          value as (
            ...received: unknown[]
          ) => Promise<BridgeRequestOutcome<unknown>>
        ).apply(target, args);
        observe(domainName, property, outcome);
        after(property, outcome);
        updateReadySignals();
        return outcome;
      };
    },
  });
}

export function createCapabilityTrackingBridge(
  bridge: RendererBridgeAdapter,
): RendererBridgeAdapter {
  state.initialized = true;
  state.hydrated = true;
  updateReadySignals();

  return {
    ...bridge,
    app: trackDomain("app", bridge.app, (method, outcome) => {
      if (method !== "getCoreStatus") return;
      const coreStatus = successData(
        outcome as BridgeRequestOutcome<CoreStatus>,
      );
      if (coreStatus) state.coreStatus = coreStatus;
    }),
    settings: trackDomain("settings", bridge.settings, () => undefined),
    project: trackDomain("project", bridge.project, (method, outcome) => {
      if (method === "close" && outcome.state === "success") {
        state.project = null;
        return;
      }
      if (
        !["getActive", "create", "openSelected", "openRecent", "move"].includes(
          method,
        )
      ) {
        return;
      }
      const project = successData(
        outcome as BridgeRequestOutcome<ProjectWorkspaceSummary | null>,
      );
      if (outcome.state === "success") state.project = project;
    }),
    task: trackDomain("task", bridge.task, () => undefined),
    providers: trackDomain("providers", bridge.providers, (method, outcome) => {
      if (method !== "list" || outcome.state !== "success") return;
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
  observedProductResources.clear();
}
