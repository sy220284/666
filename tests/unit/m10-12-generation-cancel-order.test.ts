import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  GenerationRunSchema,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import type { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const RUN_ID = '00000000-0000-4000-8000-000000000101';
const TASK_ID = '00000000-0000-4000-8000-000000000102';
const PROJECT_ID = '00000000-0000-4000-8000-000000000103';
const CHAPTER_ID = '00000000-0000-4000-8000-000000000104';
const CANDIDATE_ID = '00000000-0000-4000-8000-000000000105';

function run(status: 'queued' | 'running' | 'succeeded' = 'queued') {
  return GenerationRunSchema.parse({
    runId: RUN_ID,
    requestId: '00000000-0000-4000-8000-000000000001',
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
    stage: status === 'succeeded' ? 'completed' : 'receiving_output',
    retryCount: 0,
    inputTokens: null,
    outputTokens: null,
    errorCode: null,
    retryable: null,
    partialStatus: 'unavailable',
    resultRefs: [],
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

describe('M10-12 Generation取消顺序', () => {
  it('取消持久化失败时不提前中止Provider', async () => {
    let releaseProvider!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    let observedSignal: AbortSignal | null = null;
    let providerStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      providerStarted = resolve;
    });
    const provider: GenerationRuntimeProvider = {
      async *generate(_request, signal) {
        observedSignal = signal;
        yield { type: 'connected' };
        yield { type: 'delta', text: '仍在执行。' };
        providerStarted();
        await release;
        yield { type: 'completed' };
      },
    };
    const queued = run('queued');
    const running = run('running');
    const succeeded = run('succeeded');
    const runs = {
      createWithReplay: async () => ({ run: queued, replayed: false }),
      get: () => running,
      getResearchReferenceMessage: () => null,
      markRunning: async () => running,
      markStage: async () => running,
      cancel: async () => {
        throw new Error('DATABASE_WRITE_FAILED');
      },
      fail: async () => running,
      completeProseCandidate: async () => ({
        run: succeeded,
        candidate: {
          candidateId: CANDIDATE_ID,
          projectId: PROJECT_ID,
          chapterId: CHAPTER_ID,
          generationRunId: RUN_ID,
          candidateType: 'full',
          completeness: 'complete',
          status: 'available',
          sourceVersionId: null,
          baseDraftId: null,
          baseDraftRevision: null,
          blockCount: 1,
          title: '候选',
          sourceState: 'fresh',
          createdAt: '2026-08-05T12:00:01.000Z',
          blocks: [],
        },
      }),
    } as unknown as GenerationRunService;
    const tasks = new TaskProtocol();
    const runtime = new GenerationRuntime(runs, tasks);

    const execution = await runtime.startProse({
      requestId: queued.requestId,
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
    await started;

    await expect(
      runtime.cancel('00000000-0000-4000-8000-000000000002', {
        projectId: PROJECT_ID,
        runId: RUN_ID,
      }),
    ).rejects.toThrow('DATABASE_WRITE_FAILED');
    expect(observedSignal?.aborted).toBe(false);
    expect(tasks.getSnapshot(execution.taskId, PROJECT_ID).status).toBe('running');

    releaseProvider();
    await runtime.waitFor(RUN_ID);
    tasks.close();
  });
});