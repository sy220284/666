import { describe, expect, it } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';

function success<T>(requestId: string, data: T): CommandResult<T> {
  return { ok: true, requestId, data };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('M3-R01 bridge cancellation truthfulness', () => {
  it('detaches promptly from an uncooperative IPC without claiming cancellation', async () => {
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
    await expect(
      Promise.race([
        request,
        delay(50).then(() => ({ state: 'timeout' as const })),
      ]),
    ).resolves.toEqual({ state: 'stale', generation: 1 });
    expect(coordinator.isPending('project.write')).toBe(false);

    resolveOperation?.(success('completed-after-local-abort', 'committed'));
    await delay(0);
  });

  it('detaches the replaced generation and lets the replacement finish', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let resolveOld: ((result: CommandResult<string>) => void) | undefined;
    const oldRequest = coordinator.run('catalog.read', () =>
      new Promise<CommandResult<string>>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const replacement = coordinator.run(
      'catalog.read',
      async () => success('replacement', 'fresh'),
      { mode: 'replace' },
    );

    await expect(oldRequest).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(replacement).resolves.toMatchObject({
      state: 'success',
      generation: 2,
      data: 'fresh',
    });

    resolveOld?.(success('old-late-result', 'stale'));
    await delay(0);
  });

  it('consumes a late rejection after detachment', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const external = new AbortController();
    let rejectOperation: ((error: Error) => void) | undefined;
    const request = coordinator.run(
      'project.write',
      () =>
        new Promise<CommandResult<string>>((_resolve, reject) => {
          rejectOperation = reject;
        }),
      { signal: external.signal },
    );

    external.abort();
    await expect(request).resolves.toEqual({ state: 'stale', generation: 1 });
    rejectOperation?.(new Error('late transport failure'));
    await delay(0);
  });
});
