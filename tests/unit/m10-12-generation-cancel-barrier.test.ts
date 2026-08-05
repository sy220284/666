import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  GenerationRunSchema,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

function generationRun(
  status: 'queued' | 'running' | 'cancelled',
  stage: 'queued' | 'parsing_output' | 'saving_candidate' | 'completed',
) {
  return GenerationRunSchema.parse({
    runId: 'run-barrier',
    requestId: '00000000-0000-4000-8000-000000000011',
    taskId: 'task-barrier',
    projectId: 'project-a',
    chapterId: 'chapter-a',
    baseDraftId: null,
    baseDraftRevision: null,
    runType: 'chapter',
    promptId: 'worldforge.chapter',
    promptVersion: 1,
    outputMode: 'text',
    providerId: 'provider-a',
    actualModel: 'model-a',
    supportStatus: 'unverified',
    status,
    stage,
    retryCount: 0,
    inputTokens: null,
    outputTokens: null,
    errorCode: status === 'cancelled' ? 'COMMON_CANCELLED_004' : null,
    retryable: status === 'cancelled' ? false : null,
    partialStatus: 'unavailable',
    resultRefs: [],
    createdAt: '2026-08-05T12:00:00.000Z',
    startedAt: status === 'queued' ? null : '2026-08-05T12:00:00.000Z',
    finishedAt: status === 'cancelled' ? '2026-08-05T12:00:01.000Z' : null,
  });
}

function constraints() {
  return ConstraintPackageSchema.parse({
    projectId: 'project-a',
    chapterId: 'chapter-a',
    taskType: 'chapter',
    snapshotSource: 'fallback_live_query',
    sections: { P0: [], P1: [], P2: [], P3: [], P4: [] },
    sourceVersionIds: [],
    estimatedTokens: 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'a'.repeat(64),
    constraintHash: 'b'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

describe('M10-12 Candidate保存前取消屏障', () => {
  it('取消成功后不会进入Candidate持久化', async () => {
    let enterSaving!: () => void;
    const savingEntered = new Promise<void>((resolve) => {
      enterSaving = resolve;
    });
    let releaseSaving!: () => void;
    const savingReleased = new Promise<void>((resolve) => {
      releaseSaving = resolve;
    });
    let persistedStage: 'parsing_output' | 'saving_candidate' = 'parsing_output';
    const persistCandidate = vi.fn();
    const queued = generationRun('queued', 'queued');
    const running = generationRun('running', 'parsing_output');
    const cancelled = generationRun('cancelled', 'completed');
    const runs = {
      createWithReplay: async () => ({ run: queued, replayed: false }),
      get: () =>
        persistedStage === 'saving_candidate'
          ? generationRun('running', 'saving_candidate')
          : running,
      markRunning: async () => running,
      markStage: async (_requestId: string, input: { stage: string }) => {
        if (input.stage === 'saving_candidate') {
          enterSaving();
          await savingReleased;
          persistedStage = 'saving_candidate';
          return generationRun('running', 'saving_candidate');
        }
        return running;
      },
      cancel: async () => cancelled,
      fail: async () => running,
      completeProseCandidate: persistCandidate,
    } as unknown as GenerationRunService;
    const tasks = new TaskProtocol();
    const runtime = new GenerationRuntime(runs, tasks);
    const provider: GenerationRuntimeProvider = {
      async *generate() {
        yield { type: 'connected' };
        yield { type: 'delta', text: '候选正文。' };
        yield { type: 'completed' };
      },
    };

    const execution = await runtime.startProse({
      requestId: queued.requestId,
      run: {
        projectId: 'project-a',
        chapterId: 'chapter-a',
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'chapter',
        promptId: 'worldforge.chapter',
        promptVersion: 1,
        outputMode: 'text',
        providerId: 'provider-a',
        actualModel: 'model-a',
        supportStatus: 'unverified',
        constraintPackage: constraints(),
        taskId: 'task-barrier',
      },
      provider,
      requestFor: (runId) =>
        GenerationRequestSchema.parse({
          runId,
          model: 'model-a',
          systemPrompt: '只输出正文。',
          messages: [{ role: 'user', content: '继续。' }],
          maxOutputTokens: 100,
          metadata: {
            promptId: 'worldforge.chapter',
            promptVersion: 1,
            taskType: 'chapter',
            constraintHash: 'b'.repeat(64),
          },
        }),
      candidate: { title: '候选', candidateType: 'full' },
      parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
    });
    await savingEntered;

    await expect(
      runtime.cancel('00000000-0000-4000-8000-000000000012', {
        projectId: 'project-a',
        runId: 'run-barrier',
      }),
    ).resolves.toMatchObject({ status: 'cancelled' });
    releaseSaving();
    await runtime.waitFor('run-barrier');

    expect(persistCandidate).not.toHaveBeenCalled();
    expect(tasks.getSnapshot(execution.taskId, 'project-a').status).toBe('cancelled');
    tasks.close();
  });
});
