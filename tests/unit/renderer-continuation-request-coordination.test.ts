import { describe, expect, it, vi } from 'vitest';

import type { CommandResult } from '@worldforge/contracts';

import { BridgeRequestCoordinator } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import {
  ContinuationPersistenceTracker,
  derivePanelSwitchInput,
} from '../../apps/desktop/renderer/src/features/writing/continuation-persistence.js';

const success = <T>(requestId: string, data: T): CommandResult<T> => ({
  ok: true,
  requestId,
  data,
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

function continuationRequestKey(projectId: string, panel: string): string {
  return `project.saveContinuation:{"panel":"${panel}","projectId":"${projectId}"}`;
}

interface ContinuationFixture {
  readonly projectId: string;
  readonly chapterId: string;
  readonly scrollTop: number;
  readonly panel: 'editor' | 'versions' | 'candidates';
}

function continuation(overrides: Partial<ContinuationFixture> = {}): ContinuationFixture {
  return {
    projectId: '00000000-0000-4000-8000-000000000001',
    chapterId: '00000000-0000-4000-8000-000000000101',
    scrollTop: 320,
    panel: 'editor',
    ...overrides,
  };
}

describe('M4-04 continuation request coordination', () => {
  it('serializes writes and drops superseded pending continuation states', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const firstGate = deferred<CommandResult<string>>();
    const started: string[] = [];

    const first = coordinator.run(
      continuationRequestKey('project-1', 'editor'),
      async () => {
        started.push('editor');
        return firstGate.promise;
      },
      { mode: 'replace' },
    );

    await vi.waitFor(() => expect(started).toEqual(['editor']));

    const middle = coordinator.run(
      continuationRequestKey('project-1', 'versions'),
      async () => {
        started.push('versions');
        return success('request-versions', 'versions');
      },
      { mode: 'replace' },
    );
    const latest = coordinator.run(
      continuationRequestKey('project-1', 'candidates'),
      async () => {
        started.push('candidates');
        return success('request-candidates', 'candidates');
      },
      { mode: 'replace' },
    );

    await expect(middle).resolves.toEqual({ state: 'stale', generation: 2 });
    expect(started).toEqual(['editor']);

    firstGate.resolve(success('request-editor', 'editor'));

    await expect(first).resolves.toEqual({ state: 'stale', generation: 1 });
    await expect(latest).resolves.toEqual({
      state: 'success',
      generation: 3,
      requestId: 'request-candidates',
      data: 'candidates',
    });
    expect(started).toEqual(['editor', 'candidates']);
  });

  it('keeps continuation lanes independent between projects', async () => {
    const coordinator = new BridgeRequestCoordinator();
    const firstProjectGate = deferred<CommandResult<string>>();
    const started: string[] = [];

    const firstProject = coordinator.run(
      continuationRequestKey('project-1', 'editor'),
      async () => {
        started.push('project-1');
        return firstProjectGate.promise;
      },
      { mode: 'replace' },
    );
    const secondProject = coordinator.run(
      continuationRequestKey('project-2', 'editor'),
      async () => {
        started.push('project-2');
        return success('request-project-2', 'project-2');
      },
      { mode: 'replace' },
    );

    await expect(secondProject).resolves.toMatchObject({
      state: 'success',
      data: 'project-2',
    });
    expect(started).toContain('project-1');
    expect(started).toContain('project-2');

    firstProjectGate.resolve(success('request-project-1', 'project-1'));
    await expect(firstProject).resolves.toMatchObject({
      state: 'success',
      data: 'project-1',
    });
  });

  it('suppresses delayed retries and commits from an older panel intent', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    const editor = continuation({ panel: 'editor' });
    tracker.commit(editor);

    const versions = derivePanelSwitchInput(tracker.committedInput(), 'versions');
    const candidates = derivePanelSwitchInput(tracker.committedInput(), 'candidates');
    expect(versions).not.toBeNull();
    expect(candidates).not.toBeNull();
    if (!versions || !candidates) return;

    expect(tracker.isCommitted(versions)).toBe(true);
    tracker.commit(versions);
    expect(tracker.committedInput()).toBe(editor);

    tracker.commit(candidates);
    expect(tracker.committedInput()).toEqual(candidates);
  });

  it('does not treat a new project scope as a stale panel retry', () => {
    const tracker = new ContinuationPersistenceTracker<ContinuationFixture>();
    tracker.commit(continuation({ panel: 'editor' }));
    derivePanelSwitchInput(tracker.committedInput(), 'candidates');

    expect(
      tracker.isCommitted(
        continuation({
          projectId: '00000000-0000-4000-8000-000000000002',
          panel: 'editor',
        }),
      ),
    ).toBe(false);
  });
});
