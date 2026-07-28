import { describe, expect, it } from 'vitest';

import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';

describe('BridgeRequestCoordinator shared reads', () => {
  it('reuses one in-flight read for concurrent consumers', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let calls = 0;
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operation = async () => {
      calls += 1;
      await gate;
      return { ok: true as const, requestId: 'shared-read', data: { checkpoints: 1 } };
    };
    const first = coordinator.run('recovery.getOverview:project', operation, { mode: 'share' });
    const second = coordinator.run('recovery.getOverview:project', operation, { mode: 'share' });
    await Promise.resolve();
    expect(calls).toBe(1);
    release();
    await expect(first).resolves.toMatchObject({ state: 'success', data: { checkpoints: 1 } });
    await expect(second).resolves.toMatchObject({ state: 'success', data: { checkpoints: 1 } });
  });
});
