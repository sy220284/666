import { afterEach, describe, expect, it } from 'vitest';

import type { CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  createCapabilityTrackingBridge,
  currentRuntimeNavigationAvailability,
  currentRuntimeProjectMode,
  resetCapabilityRuntimeForTests,
} from '../../apps/desktop/renderer/src/runtime/capability-runtime.js';
import {
  createPrimaryNavigationItems,
  resolvePrimaryNavigationIntent,
} from '../../apps/desktop/renderer/src/shell/app-shell-model.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const originalDocumentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');

const core: CoreStatus = {
  status: 'healthy',
  pid: 1,
  restartCount: 0,
  lastErrorCode: null,
  diagnosticId: null,
};

function damagedProject(): ProjectWorkspaceSummary {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    name: '损坏作品',
    channel: '男频',
    workspacePath: '/tmp/damaged',
    schemaVersion: 1,
    databaseMode: 'read-only',
    compatibility: 'integrity-failed',
    readOnlyReason: 'integrity-failed',
    createdAt: '2026-07-30T00:00:00.000Z',
  };
}

function writableProject(): ProjectWorkspaceSummary {
  return {
    ...damagedProject(),
    name: '可写作品',
    databaseMode: 'read-write',
    compatibility: 'current',
    readOnlyReason: null,
  };
}

function success<Data>(data: Data) {
  return { state: 'success' as const, data };
}

function failure() {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: null,
    error: {
      code: 'BRIDGE_UNEXPECTED_FAILURE' as const,
      message: '测试失败',
      retryable: true,
    },
  };
}

async function invoke(domain: object, method: string): Promise<unknown> {
  const callable = (domain as Record<string, (() => Promise<unknown>) | undefined>)[method];
  if (!callable) throw new Error(`Missing test method: ${method}`);
  return callable();
}

function installDocument(): Record<string, string> {
  const dataset: Record<string, string> = {};
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { body: { dataset } },
  });
  return dataset;
}

afterEach(() => {
  resetCapabilityRuntimeForTests();
  if (originalDocumentDescriptor) {
    Object.defineProperty(globalThis, 'document', originalDocumentDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, 'document');
  }
});

describe('capability-tracked primary navigation', () => {
  it('blocks writing, planning, canon and checks for an integrity-failed project', async () => {
    const project = damagedProject();
    const bridge = createCapabilityTrackingBridge(
      contractInput<RendererBridgeAdapter>({
        app: {
          getCoreStatus: async () => success(core),
        },
        settings: {},
        project: {
          getActive: async () => success(project),
        },
        task: {},
        providers: {
          list: async () => success({ providers: [] }),
        },
      }),
    );

    await bridge.app.getCoreStatus();
    await bridge.project.getActive();

    const items = createPrimaryNavigationItems({
      activeProjectId: project.projectId,
      currentRoute: 'home',
      disclosureMode: 'professional',
      availability: {
        home: true,
        planning: true,
        writing: true,
        canon: true,
        checks: true,
        settings: true,
      },
    });

    expect(Object.fromEntries(items.map((item) => [item.id, item.disabled]))).toMatchObject({
      home: false,
      planning: true,
      writing: true,
      canon: true,
      checks: true,
      settings: false,
    });
    expect(
      resolvePrimaryNavigationIntent('writing', {
        activeProjectId: project.projectId,
        currentRoute: 'home',
        disclosureMode: 'professional',
        availability: { writing: true },
      }),
    ).toMatchObject({
      accepted: false,
      code: 'FEATURE_UNAVAILABLE',
    });
  });

  it('publishes all readiness levels after required resources load and clears project readiness on close', async () => {
    const dataset = installDocument();
    const project = writableProject();
    const bridge = createCapabilityTrackingBridge(
      contractInput<RendererBridgeAdapter>({
        app: {
          getCoreStatus: async () => success(core),
          getWindowPreferences: async () => success({}),
        },
        settings: {
          get: async () => success({}),
          marker: 'unchanged',
        },
        project: {
          getActive: async () => success(project),
          listRecent: async () => success({ projects: [] }),
          close: async () => success(null),
        },
        task: {
          listActive: async () => success({ tasks: [] }),
        },
        providers: {
          list: async () => success({ providers: [{ id: 'provider-1' }] }),
        },
      }),
    );

    expect(dataset).toMatchObject({
      shellReady: 'true',
      coreReady: 'false',
      productReady: 'false',
      projectReady: 'false',
      projectMode: 'closed',
    });
    expect((bridge.settings as unknown as { marker: string }).marker).toBe('unchanged');
    expect(Reflect.get(bridge.settings, Symbol.toStringTag)).toBeUndefined();

    await invoke(bridge.app, 'getCoreStatus');
    await invoke(bridge.app, 'getWindowPreferences');
    await invoke(bridge.settings, 'get');
    await invoke(bridge.project, 'getActive');
    await invoke(bridge.project, 'listRecent');
    await invoke(bridge.task, 'listActive');
    await invoke(bridge.providers, 'list');

    expect(dataset).toMatchObject({
      shellReady: 'true',
      coreReady: 'true',
      productReady: 'true',
      projectReady: 'true',
      projectMode: 'normal',
    });
    expect(currentRuntimeNavigationAvailability()).toMatchObject({
      writing: true,
      planning: true,
      canon: true,
      checks: true,
    });
    expect(currentRuntimeProjectMode()).toBe('normal');

    await invoke(bridge.project, 'close');
    expect(dataset).toMatchObject({
      productReady: 'true',
      projectReady: 'false',
      projectMode: 'closed',
    });
  });

  it('ignores failed and unrelated observations without granting unavailable capabilities', async () => {
    const dataset = installDocument();
    const bridge = createCapabilityTrackingBridge(
      contractInput<RendererBridgeAdapter>({
        app: {
          getCoreStatus: async () => failure(),
          getWindowPreferences: async () => success({}),
        },
        settings: {
          get: async () => failure(),
        },
        project: {
          getActive: async () => failure(),
          listRecent: async () => success({ projects: [] }),
          close: async () => failure(),
        },
        task: {
          listActive: async () => success({ tasks: [] }),
        },
        providers: {
          list: async () => failure(),
        },
      }),
    );

    await invoke(bridge.app, 'getCoreStatus');
    await invoke(bridge.app, 'getWindowPreferences');
    await invoke(bridge.settings, 'get');
    await invoke(bridge.project, 'getActive');
    await invoke(bridge.project, 'listRecent');
    await invoke(bridge.project, 'close');
    await invoke(bridge.task, 'listActive');
    await invoke(bridge.providers, 'list');

    expect(dataset).toMatchObject({
      coreReady: 'false',
      productReady: 'false',
      projectReady: 'false',
      projectMode: 'closed',
    });
    expect(currentRuntimeNavigationAvailability()).toMatchObject({
      writing: false,
      planning: false,
      canon: false,
      checks: false,
    });
    expect(currentRuntimeProjectMode()).toBe('closed');
  });

  it('preserves the legacy permissive behavior before the tracking bridge initializes', () => {
    expect(currentRuntimeNavigationAvailability()).toBeNull();
    expect(currentRuntimeProjectMode()).toBeNull();

    const result = resolvePrimaryNavigationIntent('writing', {
      activeProjectId: '00000000-0000-4000-8000-000000000001',
      currentRoute: 'home',
      disclosureMode: 'professional',
      availability: { writing: true },
    });

    expect(result).toMatchObject({ accepted: true, route: 'writing' });
  });
});
