import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      resolvePromise?.(value);
    },
  };
}

describe('M11 generic bridge request lanes', () => {
  it('marks an older response stale when a later request replaces the same business lane', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const firstGate = deferred<CommandResult<string>>();
    const started: string[] = [];
    const laneKey = 'storyKnowledge:project-1:chapter-window';

    const first = coordinator.run(
      'storyKnowledge.timeline:chapter-1',
      async () => {
        started.push('chapter-1');
        return firstGate.promise;
      },
      { mode: 'replace', laneKey },
    );
    await vi.waitFor(() => expect(started).toEqual(['chapter-1']));

    const second = coordinator.run(
      'storyKnowledge.timeline:chapter-2',
      async () => {
        started.push('chapter-2');
        return success('chapter-2-request', 'chapter-2');
      },
      { mode: 'replace', laneKey },
    );

    firstGate.resolve(success('chapter-1-request', 'chapter-1'));
    await expect(first).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(second).resolves.toMatchObject({
      state: 'success',
      generation: 2,
      data: 'chapter-2',
    });
    expect(started).toEqual(['chapter-1', 'chapter-2']);
  });

  it('keeps project lanes independent so project switching cannot cross-cancel unrelated work', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const projectOneGate = deferred<CommandResult<string>>();
    const first = coordinator.run(
      'continuity.list:project-1:chapter-1',
      () => projectOneGate.promise,
      { mode: 'replace', laneKey: 'continuity:project-1:window' },
    );
    const second = coordinator.run(
      'continuity.list:project-2:chapter-1',
      async () => success('project-2', 'project-2'),
      { mode: 'replace', laneKey: 'continuity:project-2:window' },
    );

    await expect(second).resolves.toMatchObject({ state: 'success', data: 'project-2' });
    projectOneGate.resolve(success('project-1', 'project-1'));
    await expect(first).resolves.toMatchObject({ state: 'success', data: 'project-1' });
  });

  it('cancels a named lane without parsing the request payload', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const laneKey = 'timeline:project-1:chapter-window';
    let aborted = false;
    const request = coordinator.run(
      'opaque-request-key-that-has-no-business-payload',
      async ({ signal }) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              resolve();
            },
            { once: true },
          );
        });
        return success('cancelled-lane', 'ignored');
      },
      { mode: 'replace', laneKey },
    );

    await Promise.resolve();
    expect(coordinator.cancel('unrelated-request-key', laneKey)).toBe(true);
    await expect(request).resolves.toMatchObject({ state: 'stale' });
    expect(aborted).toBe(true);
  });
});
