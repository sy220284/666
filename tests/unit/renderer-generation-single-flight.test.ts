import { describe, expect, it, vi } from 'vitest';

import type { CommandResult, GenerationRun } from '@worldforge/contracts';

import { createRendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';

const projectId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const chapterId = '550e8400-e29b-41d4-a716-446655440000';
const runId = '550e8400-e29b-41d4-a716-446655440001';
const taskId = '550e8400-e29b-41d4-a716-446655440002';
const requestId = '550e8400-e29b-41d4-a716-446655440003';

const success = <T>(id: string, data: T): CommandResult<T> => ({ ok: true, requestId: id, data });

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
    promptId: 'semantic_validation',
    promptVersion: 1,
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

describe('renderer AI single-flight guard', () => {
  it('reuses the active backend run instead of starting a duplicate after a page remount', async () => {
    const active = generationRun('running');
    const generation = {
      listRuns: vi.fn(async () => success('list-active', { runs: [active] })),
      start: vi.fn(async () => success('new-start', { run: active, taskId })),
    };
    const adapter = createRendererBridgeAdapter({ generation } as never);

    const outcome = await adapter.generation.start(startInput());

    expect(generation.listRuns).toHaveBeenCalledTimes(1);
    expect(generation.start).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      state: 'success',
      requestId,
      data: { run: { runId, status: 'running' }, taskId },
    });
  });

  it('starts a new run after the previous same-type run is already finished', async () => {
    const completed = generationRun('succeeded');
    const next = { ...generationRun('running'), runId: '550e8400-e29b-41d4-a716-446655440004' };
    const generation = {
      listRuns: vi.fn(async () => success('list-completed', { runs: [completed] })),
      start: vi.fn(async () => success('new-start', { run: next, taskId: next.taskId })),
    };
    const adapter = createRendererBridgeAdapter({ generation } as never);

    const outcome = await adapter.generation.start(startInput());

    expect(generation.start).toHaveBeenCalledTimes(1);
    expect(outcome).toMatchObject({ state: 'success', requestId: 'new-start' });
  });
});
