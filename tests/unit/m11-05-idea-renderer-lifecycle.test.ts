import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  cancelIdeaCapsuleRequests,
  runIdeaCapsuleOperation,
} from '../../apps/desktop/renderer/src/bridge/idea-capsule-client.js';

const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const ideaId = '550e8400-e29b-41d4-a716-446655440000';
const secondIdeaId = '550e8400-e29b-41d4-a716-446655440001';
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

function getSuccess(id: string, title: string) {
  return {
    ok: true as const,
    requestId,
    data: {
      idea: {
        id,
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
  it('makes an older list read stale when a newer filter or page request arrives', async () => {
    const firstReply = deferred<ReturnType<typeof listSuccess>>();
    const secondReply = deferred<ReturnType<typeof listSuccess>>();
    const operate = vi
      .fn()
      .mockImplementationOnce(() => firstReply.promise)
      .mockImplementationOnce(() => secondReply.promise);
    vi.stubGlobal('window', { worldforgeIdeaCapsule: { operate } });

    const first = runIdeaCapsuleOperation(
      {
        operation: 'idea.list',
        input: { projectId, status: null, limit: 50, cursor: null },
      },
      { mode: 'share' },
    );
    await Promise.resolve();
    const second = runIdeaCapsuleOperation(
      {
        operation: 'idea.list',
        input: { projectId, status: 'favorite', limit: 50, cursor: null },
      },
      { mode: 'share' },
    );
    expect(operate).toHaveBeenCalledTimes(1);

    firstReply.resolve(listSuccess());
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await vi.waitFor(() => expect(operate).toHaveBeenCalledTimes(2));
    secondReply.resolve(listSuccess());
    await expect(second).resolves.toMatchObject({ state: 'success' });
  });

  it('makes the older Idea detail stale when the author immediately opens another Idea', async () => {
    const firstReply = deferred<ReturnType<typeof getSuccess>>();
    const secondReply = deferred<ReturnType<typeof getSuccess>>();
    const operate = vi
      .fn()
      .mockImplementationOnce(() => firstReply.promise)
      .mockImplementationOnce(() => secondReply.promise);
    vi.stubGlobal('window', { worldforgeIdeaCapsule: { operate } });

    const first = runIdeaCapsuleOperation(
      { operation: 'idea.get', input: { projectId, ideaId } },
      { mode: 'share' },
    );
    await Promise.resolve();
    const second = runIdeaCapsuleOperation(
      { operation: 'idea.get', input: { projectId, ideaId: secondIdeaId } },
      { mode: 'share' },
    );
    expect(operate).toHaveBeenCalledTimes(1);

    firstReply.resolve(getSuccess(ideaId, '旧结果'));
    await expect(first).resolves.toMatchObject({ state: 'stale' });
    await vi.waitFor(() => expect(operate).toHaveBeenCalledTimes(2));
    secondReply.resolve(getSuccess(secondIdeaId, '新结果'));
    await expect(second).resolves.toMatchObject({
      state: 'success',
      data: { idea: { id: secondIdeaId, title: '新结果' } },
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
