import { readFile } from 'node:fs/promises';

import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  GenerationRunSchema,
  type CoreStatus,
  type ProjectWorkspaceSummary,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { buildGlobalStatus } from '../../apps/desktop/renderer/src/app/app-shell-status.js';
import type { AiReadiness } from '../../apps/desktop/renderer/src/runtime/ai-readiness.js';
import { EMPTY_WORKSPACE_ATTENTION } from '../../apps/desktop/renderer/src/runtime/workspace-attention.js';
import type { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const RUN_ID = '00000000-0000-4000-8000-000000000301';
const TASK_ID = '00000000-0000-4000-8000-000000000302';
const PROJECT_ID = '00000000-0000-4000-8000-000000000303';
const CHAPTER_ID = '00000000-0000-4000-8000-000000000304';

function generationRun(
  status: 'queued' | 'running' | 'cancelled',
  stage: 'queued' | 'parsing_output' | 'completed',
) {
  return GenerationRunSchema.parse({
    runId: RUN_ID,
    requestId: '00000000-0000-4000-8000-000000000311',
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
    resultRefs: [],
    createdAt: '2026-08-08T09:00:00.000Z',
    startedAt: status === 'queued' ? null : '2026-08-08T09:00:00.000Z',
    finishedAt: status === 'cancelled' ? '2026-08-08T09:00:01.000Z' : null,
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

describe('M10-19 lifecycle, Renderer and Recovery governance', () => {
  it('persists generation cancellation before task terminal and waits for execution quiescence in task drain', async () => {
    let enterParsing!: () => void;
    const parsingEntered = new Promise<void>((resolve) => {
      enterParsing = resolve;
    });
    let releaseParsing!: () => void;
    const parsingReleased = new Promise<void>((resolve) => {
      releaseParsing = resolve;
    });
    let cancelPersisted!: () => void;
    const persisted = new Promise<void>((resolve) => {
      cancelPersisted = resolve;
    });
    const queued = generationRun('queued', 'queued');
    const running = generationRun('running', 'parsing_output');
    const cancelled = generationRun('cancelled', 'completed');
    let current = running;
    const runs = {
      createWithReplay: async () => ({ run: queued, replayed: false }),
      get: () => current,
      getResearchReferenceMessage: () => null,
      markRunning: async () => running,
      markStage: async (_requestId: string, input: { stage: string }) => {
        if (input.stage === 'parsing_output') {
          enterParsing();
          await parsingReleased;
        }
        return running;
      },
      cancel: async () => {
        current = cancelled;
        cancelPersisted();
        return cancelled;
      },
      fail: async () => running,
      completeProseCandidate: async () => {
        throw new Error('Candidate persistence must not run after cancellation.');
      },
    } as unknown as GenerationRunService;
    const tasks = new TaskProtocol();
    const runtime = new GenerationRuntime(runs, tasks);
    const provider: GenerationRuntimeProvider = {
      async *generate() {
        yield { type: 'connected' };
        yield { type: 'delta', text: '待取消正文。' };
        yield { type: 'completed' };
      },
    };
    await runtime.startProse({
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
    await parsingEntered;

    let settled = false;
    const draining = runtime.cancelTask(TASK_ID, PROJECT_ID).then((handled) => {
      settled = true;
      return handled;
    });
    await persisted;
    for (
      let attempt = 0;
      attempt < 10 && tasks.getSnapshot(TASK_ID, PROJECT_ID).status !== 'cancelled';
      attempt += 1
    ) {
      await Promise.resolve();
    }
    expect(tasks.getSnapshot(TASK_ID, PROJECT_ID).status).toBe('cancelled');
    expect(settled).toBe(false);

    releaseParsing();
    await expect(draining).resolves.toBe(true);
    expect(settled).toBe(true);
    tasks.close();
  });

  it('surfaces degraded retained startup data as an explicit P1 status', () => {
    const status = buildGlobalStatus({
      activeProject: contractInput<ProjectWorkspaceSummary>({
        projectId: PROJECT_ID,
        name: '治理测试',
        workspacePath: '/workspace/governance',
        databaseMode: 'read-write',
        compatibility: 'current',
        readOnlyReason: null,
      }),
      aiReadiness: contractInput<AiReadiness>({
        status: 'ready',
        providerId: 'provider-a',
        message: 'AI可用',
      }),
      coreStatus: contractInput<CoreStatus>({ status: 'healthy' }),
      creativePath: 'offline-first',
      failure: null,
      message: null,
      recentProjects: [],
      startupResources: { tasks: 'degraded', providers: 'loaded', continuation: 'empty' },
      tasks: [],
      workspaceAttention: EMPTY_WORKSPACE_ATTENTION,
    });
    expect(status).toMatchObject({ id: 'startup-degraded', priority: 'P1' });
    expect(status?.message).toContain('任务状态读取失败');
  });

  it('keeps Recovery Overview Version loading in one strict implementation path', async () => {
    const recoveryService = await readFile(
      'packages/core-service/src/recovery/recovery-service.ts',
      'utf8',
    );
    const cleanup = await readFile(
      'packages/core-service/src/recovery/idempotent-cleanup.ts',
      'utf8',
    );
    expect(recoveryService).not.toContain('FROM versions v');
    expect(cleanup.match(/FROM versions v/gu)).toHaveLength(1);
    expect(cleanup).not.toContain('exportableVersions = []');
  });
});