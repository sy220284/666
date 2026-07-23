import { describe, expect, it } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

describe('M3-R01 bridge cancellation truthfulness', () => {
  it('marks an uncooperative completed IPC stale instead of claiming cancellation', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const external = new AbortController();
    let resolveOperation: ((result: CommandResult<string>) => void) | undefined;
    const request = coordinator.run(
      'project.write',
      () =>
        new Promise<CommandResult<string>>((resolve) => {
          resolveOperation = resolve;
        }),
      { signal: external.signal },
    );

    external.abort();
    resolveOperation?.(success('completed-after-local-abort', 'committed'));

    await expect(request).resolves.toEqual({ state: 'stale', generation: 1 });
  });
});
