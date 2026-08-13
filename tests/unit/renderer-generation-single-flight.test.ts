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

function generationRun(
  status: GenerationRun['status'],
  overrides: Partial<GenerationRun> = {},
): GenerationRun {
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
    ...overrides,
  };
}

function startInput(sourceVersionId = runId) {
  return {
    projectId,
    scopeType: 'chapter' as const,
    scopeId: chapterId,
    chapterId,
    baseDraftId: null,
    baseDraftRevision: null,
    providerId: 'local-model',
    continuationOfRunId: null,
    intent: { runType: 'validate' as const, sourceVersionId },
  };
}

function generationBridge(
  start: WorldforgeBridge['generation']['start'],
  getRun?: WorldforgeBridge['generation']['getRun'],
): WorldforgeBridge['generation'] {
  const unused = async (): Promise<never> => {
    throw new Error('unused generation test method');
  };
  return {
    start,
    getRun: getRun ?? vi.fn(unused),
    listRuns: vi.fn(unused),
    cancel: vi.fn(unused),
    savePartial: vi.fn(unused),
    discardPartial: vi.fn(unused),
    getModelSupport: vi.fn(unused),
  };
}

describe('renderer AI single-flight guard', () => {
  it('reuses the same known active run after the feature panel remounts', async () => {
    const active = generationRun('running');
    const start = vi.fn(async () => success('new-start', { run: active, taskId }));
    const getRun = vi.fn(async () => success('get-active', active));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(start, getRun) });

    const first = await adapter.generation.start(startInput());
    const second = await adapter.generation.start(startInput());

    expect(start).toHaveBeenCalledTimes(1);
    expect(getRun).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ state: 'success', requestId: 'new-start' });
    expect(second).toMatchObject({
      state: 'success',
      requestId,
      data: { run: { runId, status: 'running' }, taskId },
    });
  });

  it('coalesces two immediate semantically identical starts into one backend start', async () => {
    const pending = deferred<
      CommandResult<{ readonly run: GenerationRun; readonly taskId: string }>
    >();
    const next = generationRun('running');
    const start = vi.fn(() => pending.promise);
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(start) });

    const first = adapter.generation.start(startInput());
    const second = adapter.generation.start(startInput());
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1));

    pending.resolve(success('new-start', { run: next, taskId }));
    await expect(first).resolves.toMatchObject({ state: 'success', requestId: 'new-start' });
    await expect(second).resolves.toMatchObject({ state: 'success', requestId: 'new-start' });
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('does not reuse an active same-type run when the generation intent differs', async () => {
    const firstRun = generationRun('running');
    const secondRun = generationRun('running', {
      runId: '550e8400-e29b-41d4-a716-446655440004',
      requestId: '550e8400-e29b-41d4-a716-446655440005',
      taskId: '550e8400-e29b-41d4-a716-446655440006',
    });
    const start = vi
      .fn()
      .mockResolvedValueOnce(
        success('first-start', { run: firstRun, taskId: firstRun.taskId }),
      )
      .mockResolvedValueOnce(
        success('second-start', { run: secondRun, taskId: secondRun.taskId }),
      );
    const getRun = vi.fn(async () => success('get-active', firstRun));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(start, getRun) });

    await adapter.generation.start(startInput(runId));
    const outcome = await adapter.generation.start(
      startInput('550e8400-e29b-41d4-a716-446655440099'),
    );

    expect(getRun).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({
      state: 'success',
      requestId: 'second-start',
      data: { run: { runId: secondRun.runId } },
    });
  });

  it('starts a new run after the known semantically identical run is already finished', async () => {
    const active = generationRun('running');
    const completed = generationRun('succeeded');
    const next = generationRun('running', {
      runId: '550e8400-e29b-41d4-a716-446655440004',
      requestId: '550e8400-e29b-41d4-a716-446655440005',
      taskId: '550e8400-e29b-41d4-a716-446655440006',
    });
    const start = vi
      .fn()
      .mockResolvedValueOnce(
        success('first-start', { run: active, taskId: active.taskId }),
      )
      .mockResolvedValueOnce(
        success('second-start', { run: next, taskId: next.taskId }),
      );
    const getRun = vi.fn(async () => success('get-completed', completed));
    const adapter = createRendererBridgeAdapter({ generation: generationBridge(start, getRun) });

    await adapter.generation.start(startInput());
    const outcome = await adapter.generation.start(startInput());

    expect(getRun).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ state: 'success', requestId: 'second-start' });
  });
});
