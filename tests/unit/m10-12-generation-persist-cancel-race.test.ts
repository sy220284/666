import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  GenerationRunSchema,
  type GenerationRun,
} from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  GenerationRunServiceError,
  type GenerationRunService,
} from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const REQUEST_ID = '00000000-0000-4000-8000-000000000021';
const RUN_ID = '00000000-0000-4000-8000-000000000221';
const TASK_ID = '00000000-0000-4000-8000-000000000222';
const PROJECT_ID = '00000000-0000-4000-8000-000000000223';
const CHAPTER_ID = '00000000-0000-4000-8000-000000000224';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000225';

function generationRun(
  status: GenerationRun['status'],
  stage: GenerationRun['stage'],
  resultRefs: GenerationRun['resultRefs'] = [],
): GenerationRun {
  return GenerationRunSchema.parse({
    runId: RUN_ID,
    requestId: REQUEST_ID,
    taskId: TASK_ID,
    projectId: PROJECT_ID,
    scopeType: 'chapter',
    scopeId: CHAPTER_ID,
    chapterId: CHAPTER_ID,
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
    errorCode: null,
    retryable: null,
    partialStatus: 'unavailable',
    resultRefs,
    createdAt: '2026-08-05T12:00:00.000Z',
    startedAt: status === 'queued' ? null : '2026-08-05T12:00:00.000Z',
    finishedAt: status === 'succeeded' ? '2026-08-05T12:00:01.000Z' : null,
  });
}

function constraints() {
  return ConstraintPackageSchema.parse({
    projectId: PROJECT_ID,
    chapterId: CHAPTER_ID,
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

describe('M10-12 Candidate持久化与取消原子边界', () => {
  it('Candidate开始持久化后，取消等待并以终态冲突结束', async () => {
    let enterPersist!: () => void;
    const persistEntered = new Promise<void>((resolve) => {
      enterPersist = resolve;
    });
    let releasePersist!: () => void;
    const persistReleased = new Promise<void>((resolve) => {
      releasePersist = resolve;
    });
    let current = generationRun('queued', 'queued');
    let cancelCalled = false;
    const persistCandidate = vi.fn(async () => {
      enterPersist();
      await persistReleased;
      current = generationRun('succeeded', 'completed', [
        { resultType: 'candidate', resultId: CANDIDATE_ID, candidateKind: 'prose' },
      ]);
      return {
        run: current,
        candidate: {
          candidateId: CANDIDATE_ID,
          projectId: PROJECT_ID,
          chapterId: CHAPTER_ID,
          generationRunId: RUN_ID,
          candidateType: 'full' as const,
          completeness: 'complete' as const,
          status: 'available' as const,
          sourceVersionId: null,
          baseDraftId: null,
          baseDraftRevision: null,
          blockCount: 1,
          title: '候选',
          sourceState: 'fresh' as const,
          createdAt: '2026-08-05T12:00:01.000Z',
          blocks: [],
        },
      };
    });
    const runs = {
      createWithReplay: async () => ({ run: current, replayed: false }),
      get: () => current,
      markRunning: async () => {
        current = generationRun('running', 'assembling_constraints');
        return current;
      },
      markStage: async (_commandId: string, input: { stage: GenerationRun['stage'] }) => {
        current = generationRun('running', input.stage);
        return current;
      },
      cancel: async () => {
        cancelCalled = true;
        throw new GenerationRunServiceError(
          'GENERATION_RUN_TERMINAL',
          'The GenerationRun is already terminal.',
        );
      },
      fail: async () => current,
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
      requestId: REQUEST_ID,
      run: {
        projectId: PROJECT_ID,
        chapterId: CHAPTER_ID,
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
        taskId: TASK_ID,
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
    await persistEntered;

    const cancellation = runtime.cancel('00000000-0000-4000-8000-000000000022', {
      projectId: PROJECT_ID,
      runId: RUN_ID,
    });
    await Promise.resolve();
    expect(cancelCalled).toBe(false);

    releasePersist();
    await runtime.waitFor(RUN_ID);
    await expect(cancellation).rejects.toMatchObject({ code: 'GENERATION_RUN_TERMINAL' });

    expect(persistCandidate).toHaveBeenCalledOnce();
    expect(tasks.getSnapshot(execution.taskId, PROJECT_ID).status).toBe('succeeded');
    tasks.close();
  });
});
