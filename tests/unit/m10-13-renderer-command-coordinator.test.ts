import { describe, expect, it, vi } from 'vitest';

import { RendererCommandCoordinator } from '../../apps/desktop/renderer/src/runtime/command-coordinator.js';

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('RendererCommandCoordinator', () => {
  it('marks the replaced command stale and preserves the latest token', async () => {
    const coordinator = new RendererCommandCoordinator();
    const firstGate = deferred<string>();
    const secondGate = deferred<string>();

    const first = coordinator.run({
      key: 'project-session',
      operation: () => firstGate.promise,
    });
    const firstToken = coordinator.currentToken('project-session');
    const second = coordinator.run({
      key: 'project-session',
      operation: () => secondGate.promise,
    });
    const secondToken = coordinator.currentToken('project-session');

    expect(firstToken).not.toBeNull();
    expect(secondToken).not.toBe(firstToken);
    firstGate.resolve('old');
    secondGate.resolve('new');

    await expect(first).resolves.toMatchObject({ state: 'stale', token: firstToken });
    const latest = await second;
    expect(latest).toMatchObject({ state: 'completed', token: secondToken, value: 'new' });
    expect(coordinator.isLatest('project-session', latest.token)).toBe(true);
    expect(coordinator.isActive('project-session')).toBe(false);
  });

  it('joins the current command without starting a duplicate operation', async () => {
    const coordinator = new RendererCommandCoordinator();
    const gate = deferred<string>();
    const operation = vi.fn(() => gate.promise);

    const first = coordinator.run({ key: 'shared', policy: 'join', operation });
    const second = coordinator.run({ key: 'shared', policy: 'join', operation });
    gate.resolve('done');

    await expect(first).resolves.toMatchObject({ state: 'completed', value: 'done' });
    await expect(second).resolves.toMatchObject({ state: 'completed', value: 'done' });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate command without replacing the current owner', async () => {
    const coordinator = new RendererCommandCoordinator();
    const gate = deferred<void>();
    const first = coordinator.run({
      key: 'exclusive',
      policy: 'reject',
      operation: () => gate.promise,
    });
    const token = coordinator.currentToken('exclusive');

    await expect(
      coordinator.run({
        key: 'exclusive',
        policy: 'reject',
        operation: async () => undefined,
      }),
    ).resolves.toEqual({ state: 'rejected', key: 'exclusive', token });
    expect(coordinator.currentToken('exclusive')).toBe(token);

    gate.resolve();
    await expect(first).resolves.toMatchObject({ state: 'completed', token });
  });

  it('suppresses a replaced failure instead of exposing it as current', async () => {
    const coordinator = new RendererCommandCoordinator();
    const firstGate = deferred<void>();
    const first = coordinator.run({
      key: 'project-session',
      operation: () => firstGate.promise,
    });
    const second = coordinator.run({
      key: 'project-session',
      operation: async () => 'new-context',
    });

    firstGate.reject(new Error('old failure'));

    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await expect(second).resolves.toMatchObject({ state: 'completed', value: 'new-context' });
  });

  it('reports the current command failure with its owning token', async () => {
    const coordinator = new RendererCommandCoordinator();
    const error = new Error('current failure');

    const result = await coordinator.run({
      key: 'project-session',
      operation: async () => Promise.reject(error),
    });

    expect(result).toMatchObject({ state: 'failed', error });
    expect(coordinator.isLatest('project-session', result.token)).toBe(true);
  });

  it('keeps aggregate pending active until every distinct command key settles', async () => {
    const pending: boolean[] = [];
    const coordinator = new RendererCommandCoordinator((active) => pending.push(active));
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();

    const first = coordinator.run({ key: 'candidate-preview', operation: () => firstGate.promise });
    const second = coordinator.run({ key: 'candidate-mutation', operation: () => secondGate.promise });
    expect(pending).toEqual([true]);

    firstGate.resolve();
    await first;
    expect(pending).toEqual([true]);

    secondGate.resolve();
    await second;
    expect(pending).toEqual([true, false]);
  });
});
