import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelIdeaCapsuleRequests,
  runIdeaCapsuleOperation,
} from '../../apps/desktop/renderer/src/bridge/idea-capsule-client.js';

const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ideaId = '550e8400-e29b-41d4-a716-446655440000';
const requestId = '4b71b998-8e45-4f8a-95f4-7a3df95579ca';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function listSuccess() {
  return {
    ok: true as const,
    requestId,
    data: { projectId, ideas: [], nextCursor: null },
  };
}

function getSuccess(title: string) {
  return {
    ok: true as const,
    requestId,
    data: {
      idea: {
        id: ideaId,
        projectId,
        ideaKind: 'plot' as const,
        title,
        summary: '摘要',
        content: '内容',
        divergenceLevel: 'safe' as const,
        depthLevel: 'spark' as const,
        sourceContext: { scopeType: 'project' as const, scopeId: projectId, chapterId: null },
        generationRunId: null,
        status: 'active' as const,
        createdAt: '2026-08-12T09:00:00.000Z',
        updatedAt: '2026-08-12T09:00:00.000Z',
      },
      conversion: null,
    },
  };
}

afterEach(() => {
  cancelIdeaCapsuleRequests();
  vi.unstubAllGlobals();
});

describe('M11-05 Idea renderer request ownership', () => {
  it('shares identical list reads instead of issuing duplicate preload calls', async () => {
    const pending = deferred<ReturnType<typeof listSuccess>>();
    const operate = vi.fn(() => pending.promise);
    vi.stubGlobal('window', { worldforgeIdeaCapsule: { operate } });
    const operation = {
      operation: 'idea.list' as const,
      input: { projectId, status: null, limit: 50, cursor: null },
    };

    const first = runIdeaCapsuleOperation(operation, { mode: 'share' });
    const second = runIdeaCapsuleOperation(operation, { mode: 'share' });
    await Promise.resolve();
    expect(operate).toHaveBeenCalledTimes(1);

    pending.resolve(listSuccess());
    await expect(first).resolves.toMatchObject({ state: 'success' });
    await expect(second).resolves.toMatchObject({ state: 'success' });
  });

  it('marks the older same-Idea request stale when a newer lane generation wins', async () => {
    const firstReply = deferred<ReturnType<typeof getSuccess>>();
    const secondReply = deferred<ReturnType<typeof getSuccess>>();
    const operate = vi
      .fn()
      .mockImplementationOnce(() => firstReply.promise)
      .mockImplementationOnce(() => secondReply.promise);
    vi.stubGlobal('window', { worldforgeIdeaCapsule: { operate } });
    const operation = {
      operation: 'idea.get' as const,
      input: { projectId, ideaId },
    };
    const options = { mode: 'replace' as const, laneKey: `idea-detail:${projectId}:${ideaId}` };

    const first = runIdeaCapsuleOperation(operation, options);
    await Promise.resolve();
    const second = runIdeaCapsuleOperation(operation, options);
    expect(operate).toHaveBeenCalledTimes(1);

    firstReply.resolve(getSuccess('旧结果'));
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await vi.waitFor(() => expect(operate).toHaveBeenCalledTimes(2));
    secondReply.resolve(getSuccess('新结果'));
    await expect(second).resolves.toMatchObject({
      state: 'success',
      data: { idea: { title: '新结果' } },
    });
  });

  it('invalidates an in-flight Idea read when the project view is disposed', async () => {
    const pending = deferred<ReturnType<typeof listSuccess>>();
    const operate = vi.fn(() => pending.promise);
    vi.stubGlobal('window', { worldforgeIdeaCapsule: { operate } });

    const result = runIdeaCapsuleOperation(
      {
        operation: 'idea.list',
        input: { projectId, status: null, limit: 50, cursor: null },
      },
      { mode: 'share' },
    );
    await Promise.resolve();
    cancelIdeaCapsuleRequests();
    await expect(result).resolves.toMatchObject({ state: 'stale' });
    pending.resolve(listSuccess());
  });
});
