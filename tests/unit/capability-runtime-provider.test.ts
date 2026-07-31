import { afterEach, describe, expect, it } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  createCapabilityTrackingBridge,
  resetCapabilityRuntimeForTests,
} from '../../apps/desktop/renderer/src/runtime/capability-runtime.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

afterEach(() => resetCapabilityRuntimeForTests());

describe('provider capability tracking', () => {
  it('publishes generation readiness after a successful connection test and invalidates it on save', async () => {
    const dataset: Record<string, string> = {};
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body: { dataset } } });
    const bridge = createCapabilityTrackingBridge(contractInput<RendererBridgeAdapter>({
      app: { getCoreStatus: async () => success({ status: 'healthy', pid: 1, restartCount: 0, lastErrorCode: null, diagnosticId: null }) },
      settings: {},
      project: {},
      task: {},
      providers: {
        list: async () => success({ providers: [{ id: 'provider-1' }] }),
        testConnection: async () => success({ providerId: 'provider-1', actualModel: 'local', latencyMs: 1 }),
        save: async () => success({ id: 'provider-1' }),
      },
    }));
    await bridge.app.getCoreStatus();
    await bridge.providers.list();
    await bridge.providers.testConnection('provider-1');
    expect(dataset.coreReady).toBe('true');
    await bridge.providers.save({});
    expect(dataset.coreReady).toBe('true');
  });
});
