import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  type GenerationRequest,
  type ProviderEvent,
} from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  GenerationRunService,
  type GenerationRunCreateInput,
} from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T00:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly runs: GenerationRunService;
  readonly tasks: TaskProtocol;
  readonly runtime: GenerationRuntime;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-generation-runtime-boundary-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '0.1.0',
    clock,
  });
  const workspace = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '0.1.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const runs = new GenerationRunService(workspace, { clock });
  const tasks = new TaskProtocol();
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    runs,
    tasks,
    runtime: new GenerationRuntime(runs, tasks),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  harness.tasks.close();
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createProjectDraft(harness: Harness, name: string) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  return { project, chapter, draft };
}

function constraints(projectId: string, chapterId: string, taskType = 'chapter') {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType,
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

function runInput(
  projectId: string,
  chapterId: string,
  draftId: string,
  revision: number,
  overrides: Partial<GenerationRunCreateInput> = {},
): GenerationRunCreateInput {
  return {
    projectId,
    chapterId,
    baseDraftId: draftId,
    baseDraftRevision: revision,
    runType: 'chapter',
    promptId: 'worldforge.chapter',
    promptVersion: 1,
    outputMode: 'text',
    providerId: 'stub',
    actualModel: 'deterministic-v1',
    supportStatus: 'unverified',
    constraintPackage: constraints(projectId, chapterId),
    ...overrides,
  };
}

function request(runId: string): GenerationRequest {
  return GenerationRequestSchema.parse({
    runId,
    model: 'deterministic-v1',
    systemPrompt: '只输出正文。',
    messages: [{ role: 'user', content: '写一段正文。' }],
    maxOutputTokens: 1_000,
    metadata: {
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      taskType: 'chapter',
      constraintHash: 'b'.repeat(64),
    },
  });
}

function provider(events: readonly ProviderEvent[]): GenerationRuntimeProvider {
  return {
    async *generate() {
      for (const event of events) yield event;
    },
  };
}

interface ControlledProvider {
  readonly provider: GenerationRuntimeProvider;
  readonly entered: Promise<void>;
}

function controlledProvider(): ControlledProvider {
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  return {
    entered,
    provider: {
      async *generate(_request, signal) {
        yield { type: 'connected' };
        yield { type: 'delta', text: '生成中' };
        markEntered();
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }
          signal.addEventListener('abort', () => resolve(), { once: true });
        });
      },
    },
  };
}

async function startProse(
  harness: Harness,
  context: Awaited<ReturnType<typeof createProjectDraft>>,
  events: readonly ProviderEvent[],
  requestFor: (runId: string) => GenerationRequest = request,
) {
  const started = await harness.runtime.startProse({
    requestId: randomUUID(),
    run: runInput(
      context.project.projectId,
      context.chapter.id,
      context.draft.draftId,
      context.draft.revision,
    ),
    provider: provider(events),
    requestFor,
    candidate: { title: '边界正文候选', candidateType: 'full' },
    parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
  });
  await harness.runtime.waitFor(started.run.runId);
  return harness.runs.get({
    projectId: context.project.projectId,
    runId: started.run.runId,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('GenerationRuntime boundary coverage', () => {
  it('replays prose and structured creation without starting duplicate tasks', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '运行重放');
      const proseRun = runInput(
        context.project.projectId,
        context.chapter.id,
        context.draft.draftId,
        context.draft.revision,
      );
      const proseRequestId = randomUUID();
      const proseCreated = await harness.runs.createWithReplay(proseRequestId, proseRun);
      let providerCalls = 0;
      const replayedProse = await harness.runtime.startProse({
        requestId: proseRequestId,
        run: proseRun,
        provider: {
          async *generate() {
            providerCalls += 1;
            yield { type: 'completed' };
          },
        },
        requestFor: request,
        candidate: { title: '不会生成', candidateType: 'full' },
        parse: () => [],
      });
      expect(replayedProse.run.runId).toBe(proseCreated.run.runId);
      expect(providerCalls).toBe(0);

      const structuredRun = runInput(
        context.project.projectId,
        context.chapter.id,
        context.draft.draftId,
        context.draft.revision,
        {
          runType: 'skeleton',
          promptId: 'worldforge.skeleton',
          outputMode: 'structured',
          constraintPackage: constraints(context.project.projectId, context.chapter.id, 'skeleton'),
        },
      );
      const structuredRequestId = randomUUID();
      const structuredCreated = await harness.runs.createWithReplay(
        structuredRequestId,
        structuredRun,
      );
      const replayedStructured = await harness.runtime.startStructured({
        requestId: structuredRequestId,
        run: structuredRun,
        provider: provider([]),
        requestFor: request,
        partialOnFailure: false,
        complete: async () => {
          throw new Error('replayed structured runs must not complete again');
        },
      });
      expect(replayedStructured.run.runId).toBe(structuredCreated.run.runId);

      await expect(harness.runtime.waitFor(randomUUID())).resolves.toBeUndefined();
      await expect(
        harness.runtime.cancelTask(randomUUID(), context.project.projectId),
      ).resolves.toBe(false);
    } finally {
      await closeHarness(harness);
    }
  });

  it.each([
    ['runId', (base: GenerationRequest) => ({ ...base, runId: randomUUID() })],
    ['model', (base: GenerationRequest) => ({ ...base, model: 'other-model' })],
    [
      'promptId',
      (base: GenerationRequest) => ({
        ...base,
        metadata: { ...base.metadata, promptId: 'other.prompt' },
      }),
    ],
    [
      'promptVersion',
      (base: GenerationRequest) => ({
        ...base,
        metadata: { ...base.metadata, promptVersion: 2 },
      }),
    ],
    [
      'taskType',
      (base: GenerationRequest) => ({
        ...base,
        metadata: { ...base.metadata, taskType: 'skeleton' as const },
      }),
    ],
  ])('rejects request metadata mismatch: %s', async (_field, mutate) => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, `请求冲突-${_field}`);
      const persisted = await startProse(harness, context, [], (runId) =>
        GenerationRequestSchema.parse(mutate(request(runId))),
      );
      expect(persisted).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID_008' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('maps missing completion, empty output and oversized output into authoritative failures', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '流式失败边界');
      const interrupted = await startProse(harness, context, [{ type: 'delta', text: '未完成' }]);
      expect(interrupted).toMatchObject({
        status: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        retryable: true,
      });

      const empty = await startProse(harness, context, [{ type: 'completed' }]);
      expect(empty).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID_008' });

      const oversized = await startProse(harness, context, [
        { type: 'delta', text: 'x'.repeat(2_000_001) },
        { type: 'completed' },
      ]);
      expect(oversized).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID_008' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('ignores warning events and accepts one-sided usage updates', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '流式事件边界');
      const persisted = await startProse(harness, context, [
        { type: 'connected' },
        { type: 'warning', code: 'stub.warning', message: '测试警告' },
        { type: 'delta', text: '有效正文' },
        { type: 'usage', inputTokens: 12 },
        { type: 'usage', outputTokens: 4 },
        { type: 'completed', finishReason: 'stop' },
      ]);
      expect(persisted).toMatchObject({
        status: 'succeeded',
        outputTokens: 4,
        resultRefs: [{ resultType: 'candidate', candidateKind: 'prose' }],
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('ignores unrelated project drains, drains the active project, then drains all remaining runs', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '项目排空');
      const firstControl = controlledProvider();
      const secondControl = controlledProvider();

      const firstStarted = await harness.runtime.startProse({
        requestId: randomUUID(),
        run: runInput(
          context.project.projectId,
          context.chapter.id,
          context.draft.draftId,
          context.draft.revision,
        ),
        provider: firstControl.provider,
        requestFor: request,
        candidate: { title: '待取消一', candidateType: 'full' },
        parse: (value) => [{ blockType: 'paragraph', text: value, attributes: {} }],
      });

      await firstControl.entered;
      await harness.runtime.drainProject(randomUUID());
      expect(
        harness.runs.get({ projectId: context.project.projectId, runId: firstStarted.run.runId }),
      ).toMatchObject({ status: 'running' });

      await harness.runtime.drainProject(context.project.projectId);
      expect(
        harness.runs.get({ projectId: context.project.projectId, runId: firstStarted.run.runId }),
      ).toMatchObject({ status: 'cancelled' });

      const secondStarted = await harness.runtime.startProse({
        requestId: randomUUID(),
        run: runInput(
          context.project.projectId,
          context.chapter.id,
          context.draft.draftId,
          context.draft.revision,
        ),
        provider: secondControl.provider,
        requestFor: request,
        candidate: { title: '待取消二', candidateType: 'full' },
        parse: (value) => [{ blockType: 'paragraph', text: value, attributes: {} }],
      });

      await secondControl.entered;
      await harness.runtime.drainAll();
      expect(
        harness.runs.get({ projectId: context.project.projectId, runId: secondStarted.run.runId }),
      ).toMatchObject({ status: 'cancelled' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('cancels queued runs without executions and rejects terminal or atomic-stage cancellation', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '直接取消');
      const base = runInput(
        context.project.projectId,
        context.chapter.id,
        context.draft.draftId,
        context.draft.revision,
      );
      const queued = await harness.runs.createWithReplay(randomUUID(), base);
      await expect(
        harness.runtime.cancel(randomUUID(), {
          projectId: context.project.projectId,
          runId: queued.run.runId,
        }),
      ).resolves.toMatchObject({ status: 'cancelled' });
      await expect(
        harness.runtime.cancel(randomUUID(), {
          projectId: context.project.projectId,
          runId: queued.run.runId,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_RUN_TERMINAL' });

      const atomic = await harness.runs.createWithReplay(randomUUID(), base);
      await harness.runs.markRunning(randomUUID(), {
        projectId: context.project.projectId,
        runId: atomic.run.runId,
      });
      await harness.runs.markStage(randomUUID(), {
        projectId: context.project.projectId,
        runId: atomic.run.runId,
        stage: 'saving_candidate',
      });
      await expect(
        harness.runtime.cancel(randomUUID(), {
          projectId: context.project.projectId,
          runId: atomic.run.runId,
        }),
      ).rejects.toMatchObject({ code: 'TASK_NOT_CANCELLABLE_001' });
    } finally {
      await closeHarness(harness);
    }
  });
});
