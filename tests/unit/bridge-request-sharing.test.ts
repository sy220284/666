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

  it('detaches one aborted consumer without cancelling the shared operation', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    let calls = 0;
    let underlyingAborted = false;
    let release = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const operation = async ({ signal }: { readonly signal: AbortSignal }) => {
      calls += 1;
      signal.addEventListener('abort', () => {
        underlyingAborted = true;
      });
      await gate;
      return { ok: true as const, requestId: 'shared-detach', data: { checkpoints: 2 } };
    };

    const first = coordinator.run('recovery.getOverview:detached', operation, {
      mode: 'share',
      signal: firstAbort.signal,
    });
    const second = coordinator.run('recovery.getOverview:detached', operation, {
      mode: 'share',
      signal: secondAbort.signal,
    });
    await Promise.resolve();
    expect(calls).toBe(1);

    firstAbort.abort('consumer-unmounted');
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    expect(underlyingAborted).toBe(false);

    release();
    await expect(second).resolves.toMatchObject({
      state: 'success',
      data: { checkpoints: 2 },
    });
    expect(underlyingAborted).toBe(false);
  });

  it('cancels the shared operation after every consumer detaches', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();
    let calls = 0;
    let underlyingAborted = false;
    const operation = async ({ signal }: { readonly signal: AbortSignal }) => {
      calls += 1;
      await new Promise<void>((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            underlyingAborted = true;
            resolve();
          },
          { once: true },
        );
      });
      return { ok: true as const, requestId: 'shared-cancelled', data: { checkpoints: 0 } };
    };

    const first = coordinator.run('recovery.getOverview:cancelled', operation, {
      mode: 'share',
      signal: firstAbort.signal,
    });
    const second = coordinator.run('recovery.getOverview:cancelled', operation, {
      mode: 'share',
      signal: secondAbort.signal,
    });
    await Promise.resolve();
    expect(calls).toBe(1);

    firstAbort.abort('first-unmounted');
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    expect(underlyingAborted).toBe(false);

    secondAbort.abort('second-unmounted');
    await expect(second).resolves.toMatchObject({ state: 'stale' });
    await Promise.resolve();
    expect(underlyingAborted).toBe(true);
  });

  it('starts a fresh shared request when a new consumer arrives after every prior consumer aborts', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const abort = new AbortController();
    let calls = 0;
    let markFirstStarted = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const operation = async ({ generation }: { readonly generation: number }) => {
      calls += 1;
      if (generation === 1) {
        markFirstStarted();
        return new Promise<{
          readonly ok: true;
          readonly requestId: string;
          readonly data: { readonly checkpoints: number };
        }>(() => undefined);
      }
      return {
        ok: true as const,
        requestId: 'shared-replacement',
        data: { checkpoints: 3 },
      };
    };

    const abandoned = coordinator.run('recovery.getOverview:replacement', operation, {
      mode: 'share',
      signal: abort.signal,
    });
    await firstStarted;
    abort.abort('consumer-unmounted');

    const replacement = coordinator.run('recovery.getOverview:replacement', operation, {
      mode: 'share',
    });
    await expect(abandoned).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(replacement).resolves.toMatchObject({
      state: 'success',
      generation: 2,
      data: { checkpoints: 3 },
    });
    expect(calls).toBe(2);
  });

  it('starts a fresh shared request immediately after cancelAll abandons the prior request', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let calls = 0;
    let markFirstStarted = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const operation = async ({ generation }: { readonly generation: number }) => {
      calls += 1;
      if (generation === 1) {
        markFirstStarted();
        return new Promise<{
          readonly ok: true;
          readonly requestId: string;
          readonly data: { readonly checkpoints: number };
        }>(() => undefined);
      }
      return {
        ok: true as const,
        requestId: 'shared-after-cancel-all',
        data: { checkpoints: 4 },
      };
    };

    const abandoned = coordinator.run('recovery.getOverview:cancel-all', operation, {
      mode: 'share',
    });
    await firstStarted;
    coordinator.cancelAll();
    const replacement = coordinator.run('recovery.getOverview:cancel-all', operation, {
      mode: 'share',
    });

    await expect(abandoned).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(replacement).resolves.toMatchObject({
      state: 'success',
      generation: 2,
      data: { checkpoints: 4 },
    });
    expect(calls).toBe(2);
  });

  it('starts a fresh shared request immediately after cancelling that shared key', async () => {
    const coordinator = new BridgeRequestCoordinator();
    let calls = 0;
    let markFirstStarted = () => undefined;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const operation = async ({ generation }: { readonly generation: number }) => {
      calls += 1;
      if (generation === 1) {
        markFirstStarted();
        return new Promise<{
          readonly ok: true;
          readonly requestId: string;
          readonly data: { readonly checkpoints: number };
        }>(() => undefined);
      }
      return {
        ok: true as const,
        requestId: 'shared-after-key-cancel',
        data: { checkpoints: 5 },
      };
    };
    const requestKey = 'recovery.getOverview:key-cancel';

    const abandoned = coordinator.run(requestKey, operation, { mode: 'share' });
    await firstStarted;
    expect(coordinator.cancel(requestKey)).toBe(true);
    const replacement = coordinator.run(requestKey, operation, { mode: 'share' });

    await expect(abandoned).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(replacement).resolves.toMatchObject({
      state: 'success',
      generation: 2,
      data: { checkpoints: 5 },
    });
    expect(calls).toBe(2);
  });
});
