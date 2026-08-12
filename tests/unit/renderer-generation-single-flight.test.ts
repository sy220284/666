import { describe, expect, it, vi } from 'vitest';

import type { CommandResult, GenerationRun, WorldforgeBridge } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const chapterId = '550e8400-e29b-41d4-a716-446655440000';
const runId = '550e8400-e29b-41d4-a716-446655440001';
const taskId = '550e8400-e29b-41d4-a716-446655440002';
const requestId = '550e8400-e29b-41d4-a716-446655440003';

const success = <T>(id: string, data: T): CommandResult<T> => ({ ok: true, requestId: id, data });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function generationRun(status: GenerationRun['status']): GenerationRun {
  return {
    runId,
    requestId,
    taskId,
    projectId,
    scopeType: 'chapter',
    scopeId: chapterId,
    chapterId,
    baseDraftId: null,
    baseDraftRevision: null,
    runType: 'validate',
    promptId: 'worldforge.validate',
    promptVersion: 2,
    outputMode: 'structured',
    providerId: 'local-model',
    actualModel: 'writer-model',
    supportStatus: 'supported',
    status,
    stage: status === 'running' ? 'calling_model' : 'completed',
    retryCount: 0,
    inputTokens: null,
    outputTokens: null,
    errorCode: null,
    retryable: null,
    partialStatus: 'unavailable',
    resultRefs: [],
    createdAt: '2026-08-12T09:00:00.000Z',
    startedAt: '2026-08-12T09:00:01.000Z',
    finishedAt: status === 'running' ? null : '2026-08-12T09:00:02.000Z',
  };
}

function startInput() {
  return {
    projectId,
    scopeType: 'chapter' as const,
    scopeId: chapterId,
    chapterId,
    baseDraftId: null,
    baseDraftRevision: null,
    providerId: 'local-model',
    continuationOfRunId: null,
    intent: { runType: 'validate' as const, sourceVersionId: runId },
  };
}

function generationBridge(
  listRuns: WorldforgeBridge['generation']['listRuns'],
  start: WorldforgeBridge['generation']['start'],
): WorldforgeBridge['generation'] {
  const unused = async (): Promise<never> => {
    throw new Error('unused generation test method');
  };
  return {
    start,
    listRuns,
    getRun: vi.fn(unused),
    cancel: vi.fn(unused),
    savePartial: vi.fn(unused),
    discardPartial: vi.fn(unused),
    getModelSupport: vi.fn(unused),
  };
}

describe('renderer AI single-flight guard', () => {
  it('reuses the active backend run instead of starting a duplicate after a page remount', async () => {
    const active = generationRun('running');
    const listRuns = vi.fn(async () => success('list-active', { runs: [active] }));
    const start = vi.fn(async () => success('new-start', { run: active, taskId }));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(listRuns, start) });

    const outcome = await adapter.generation.start(startInput());

    expect(listRuns).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      state: 'success',
      requestId,
      data: { run: { runId, status: 'running' }, taskId },
    });
  });

  it('coalesces two immediate starts into one preflight and one backend start', async () => {
    const preflight = deferred<CommandResult<{ readonly runs: readonly GenerationRun[] }>>();
    const next = generationRun('running');
    const listRuns = vi.fn(() => preflight.promise);
    const start = vi.fn(async () => success('new-start', { run: next, taskId }));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(listRuns, start) });

    const first = adapter.generation.start(startInput());
    const second = adapter.generation.start(startInput());
    expect(listRuns).toHaveBeenCalledTimes(1);

    preflight.resolve(success('list-empty', { runs: [] }));
    await expect(first).resolves.toMatchObject({ state: 'success', requestId: 'new-start' });
    await expect(second).resolves.toMatchObject({ state: 'success', requestId: 'new-start' });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('starts a new run after the previous same-type run is already finished', async () => {
    const completed = generationRun('succeeded');
    const next = { ...generationRun('running'), runId: '550e8400-e29b-41d4-a716-446655440004' };
    const listRuns = vi.fn(async () => success('list-completed', { runs: [completed] }));
    const start = vi.fn(async () => success('new-start', { run: next, taskId: next.taskId }));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(listRuns, start) });

    const outcome = await adapter.generation.start(startInput());

    expect(start).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ state: 'success', requestId: 'new-start' });
  });
});
