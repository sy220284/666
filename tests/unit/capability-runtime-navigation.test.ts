import { afterEach, describe, expect, it } from "vitest";

import type {
  CoreStatus,
  ProjectWorkspaceSummary,
} from "@worldforge/contracts";

import type { RendererBridgeAdapter } from "../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js";
import {
  createCapabilityTrackingBridge,
  resetCapabilityRuntimeForTests,
} from "../../apps/desktop/renderer/src/runtime/capability-runtime.js";
import {
  createPrimaryNavigationItems,
  resolvePrimaryNavigationIntent,
} from "../../apps/desktop/renderer/src/shell/app-shell-model.js";
import { contractInput } from "../testkit/strict-test-doubles.js";

const core: CoreStatus = {
  status: "healthy",
  pid: 1,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
};

function damagedProject(): ProjectWorkspaceSummary {
  return {
    projectId: "00000000-0000-4000-8000-000000000001",
    name: "损坏作品",
    channel: "男频",
    workspacePath: "/tmp/damaged",
    schemaVersion: 1,
    databaseMode: "read-only",
    compatibility: "integrity-failed",
    readOnlyReason: "integrity-failed",
    createdAt: "2026-07-30T00:00:00.000Z",
  };
}

afterEach(() => resetCapabilityRuntimeForTests());

describe("capability-tracked primary navigation", () => {
  it("blocks writing, planning, canon and checks for an integrity-failed project", async () => {
    const project = damagedProject();
    const bridge = createCapabilityTrackingBridge(
      contractInput<RendererBridgeAdapter>({
        app: {
          getCoreStatus: async () => ({ state: "success", data: core }),
        },
        settings: {},
        project: {
          getActive: async () => ({ state: "success", data: project }),
        },
        task: {},
        providers: {
          list: async () => ({ state: "success", data: { providers: [] } }),
        },
      }),
    );

    await bridge.app.getCoreStatus();
    await bridge.project.getActive();

    const items = createPrimaryNavigationItems({
      activeProjectId: project.projectId,
      currentRoute: "home",
      disclosureMode: "professional",
      availability: {
        home: true,
        planning: true,
        writing: true,
        canon: true,
        checks: true,
        settings: true,
      },
    });

    expect(
      Object.fromEntries(items.map((item) => [item.id, item.disabled])),
    ).toMatchObject({
      home: false,
      planning: true,
      writing: true,
      canon: true,
      checks: true,
      settings: false,
    });
    expect(
      resolvePrimaryNavigationIntent("writing", {
        activeProjectId: project.projectId,
        currentRoute: "home",
        disclosureMode: "professional",
        availability: { writing: true },
      }),
    ).toMatchObject({
      accepted: false,
      code: "FEATURE_UNAVAILABLE",
    });
  });

  it("preserves the legacy permissive behavior before the tracking bridge initializes", () => {
    const result = resolvePrimaryNavigationIntent("writing", {
      activeProjectId: "00000000-0000-4000-8000-000000000001",
      currentRoute: "home",
      disclosureMode: "professional",
      availability: { writing: true },
    });

    expect(result).toMatchObject({ accepted: true, route: "writing" });
  });
});
