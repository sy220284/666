import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  type ProviderEvent,
} from '@worldforge/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  GenerationRunService,
  GenerationRunServiceError,
} from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { TaskProtocol, TaskProtocolError } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T06:00:00.000Z') };

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
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-generation-runtime-edge-'));
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

function request(runId: string, taskType = 'chapter') {
  return GenerationRequestSchema.parse({
    runId,
    model: 'deterministic-v1',
    systemPrompt: '只输出正文。',
    messages: [{ role: 'user', content: '写一段正文。' }],
    maxOutputTokens: 1_000,
    metadata: {
      promptId: taskType === 'chapter' ? 'worldforge.chapter' : `worldforge.${taskType}`,
      promptVersion: 1,
      taskType,
      constraintHash: 'b'.repeat(64),
    },
  });
}

function provider(events: readonly ProviderEvent[], error?: unknown): GenerationRuntimeProvider {
  return {
    async *generate() {
      for (const event of events) yield event;
      if (error) throw error;
    },
  };
}

async function startProse(
  harness: Harness,
  name: string,
  events: readonly ProviderEvent[],
  options: { readonly sourceVersionId?: string | null; readonly providerError?: unknown } = {},
) {
  const { project, chapter, draft } = await createProjectDraft(harness, name);
  const started = await harness.runtime.startProse({
    requestId: randomUUID(),
    run: {
      projectId: project.projectId,
      chapterId: chapter.id,
      baseDraftId: draft.draftId,
      baseDraftRevision: draft.revision,
      runType: 'chapter',
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      outputMode: 'text',
      providerId: 'stub',
      actualModel: 'deterministic-v1',
      supportStatus: 'unverified',
      constraintPackage: constraints(project.projectId, chapter.id),
    },
    provider: provider(events, options.providerError),
    requestFor: (runId) => request(runId),
    candidate: {
      title: '边界候选',
      candidateType: 'full',
      ...(options.sourceVersionId === undefined
        ? {}
        : { sourceVersionId: options.sourceVersionId }),
    },
    parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
  });
  await harness.runtime.waitFor(started.run.runId);
  return { project, started };
}

async function startActiveProse(harness: Harness, name: string) {
  const { project, chapter, draft } = await createProjectDraft(harness, name);
  let releaseProvider!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseProvider = resolve;
  });
  let providerStarted!: () => void;
  const startedProvider = new Promise<void>((resolve) => {
    providerStarted = resolve;
  });
  const activeProvider: GenerationRuntimeProvider = {
    async *generate() {
      yield { type: 'connected' };
      yield { type: 'delta', text: '可控正文。' };
      providerStarted();
      await released;
      yield { type: 'completed' };
    },
  };
  const started = await harness.runtime.startProse({
    requestId: randomUUID(),
    run: {
      projectId: project.projectId,
      chapterId: chapter.id,
      baseDraftId: draft.draftId,
      baseDraftRevision: draft.revision,
      runType: 'chapter',
      promptId: 'worldforge.chapter',
      promptVersion: 1,
      outputMode: 'text',
      providerId: 'stub',
      actualModel: 'deterministic-v1',
      supportStatus: 'unverified',
      constraintPackage: constraints(project.projectId, chapter.id),
    },
    provider: activeProvider,
    requestFor: (runId) => request(runId),
    candidate: { title: '可控候选', candidateType: 'full' },
    parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
  });
  await startedProvider;
  return { project, started, releaseProvider };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('generation runtime edge coverage', () => {
  it('accepts warnings, partial usage and an explicit null source version', async () => {
    const harness = await createHarness();
    try {
      const { project, started } = await startProse(
        harness,
        '警告与用量',
        [
          { type: 'connected' },
          { type: 'warning', code: 'PROVIDER_WARNING', message: '可忽略警告' },
          { type: 'delta', text: '正文。' },
          { type: 'usage', inputTokens: 7 },
          { type: 'completed' },
        ],
        { sourceVersionId: null },
      );
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({ status: 'succeeded', inputTokens: 7, outputTokens: null });
    } finally {
      await closeHarness(harness);
    }
  });

  it('fails a completed stream that contains no non-whitespace output', async () => {
    const harness = await createHarness();
    try {
      const { project, started } = await startProse(harness, '空输出', [
        { type: 'delta', text: '   ' },
        { type: 'completed' },
      ]);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID_008' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('fails a provider stream that ends without a completed event', async () => {
    const harness = await createHarness();
    try {
      const { project, started } = await startProse(harness, '无完成事件', [
        { type: 'delta', text: '保留的部分。' },
      ]);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({
        status: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        partialStatus: 'available',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects a single provider delta beyond the runtime text ceiling', async () => {
    const harness = await createHarness();
    try {
      const { project, started } = await startProse(harness, '超长输出', [
        { type: 'delta', text: 'x'.repeat(2_000_001) },
      ]);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({
        status: 'failed',
        errorCode: 'AI_OUTPUT_INVALID_008',
        partialStatus: 'unavailable',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('persists structured partial text and invokes the optional failure projection', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '结构化失败回调');
      const onFailure = vi.fn(async () => undefined);
      const providerError = Object.assign(new Error('断流'), {
        code: 'AI_STREAM_INTERRUPTED_009',
        retryable: true,
      });
      const started = await harness.runtime.startStructured({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'chapter',
          promptId: 'worldforge.chapter',
          promptVersion: 1,
          outputMode: 'text',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: constraints(project.projectId, chapter.id),
        },
        provider: provider([{ type: 'delta', text: '结构化部分。' }], providerError),
        requestFor: (runId) => request(runId),
        partialOnFailure: true,
        onFailure,
        complete: async () => {
          throw new Error('complete must not run');
        },
      });
      await harness.runtime.waitFor(started.run.runId);
      expect(onFailure).toHaveBeenCalledWith(started.run.runId, 'AI_STREAM_INTERRUPTED_009');
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({ status: 'failed', partialStatus: 'available' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('keeps GenerationRun failure authoritative when the auxiliary failure projection throws', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '失败回调异常');
      const started = await harness.runtime.startStructured({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'chapter',
          promptId: 'worldforge.chapter',
          promptVersion: 1,
          outputMode: 'structured',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: constraints(project.projectId, chapter.id),
        },
        provider: provider([], new Error('普通失败')),
        requestFor: (runId) => request(runId),
        partialOnFailure: false,
        onFailure: async () => {
          throw new Error('projection failed');
        },
        complete: async () => {
          throw new Error('complete must not run');
        },
      });
      await harness.runtime.waitFor(started.run.runId);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({ status: 'failed', errorCode: 'AI_OUTPUT_INVALID_008' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('covers cancelTask terminal snapshots and cancellation race normalization', async () => {
    const harness = await createHarness();
    try {
      const terminal = await startActiveProse(harness, '终态快照');
      const actualSnapshot = harness.tasks.getSnapshot(
        terminal.started.taskId,
        terminal.project.projectId,
      );
      const snapshotSpy = vi
        .spyOn(harness.tasks, 'getSnapshot')
        .mockReturnValue({ ...actualSnapshot, status: 'succeeded' });
      const terminalCancellation = harness.runtime.cancelTask(
        terminal.started.taskId,
        terminal.project.projectId,
      );
      terminal.releaseProvider();
      await expect(terminalCancellation).resolves.toBe(true);
      snapshotSpy.mockRestore();
      await harness.workspace.close(randomUUID(), terminal.project.projectId);

      const runTerminal = await startActiveProse(harness, '运行终态竞争');
      const cancelSpy = vi
        .spyOn(harness.runtime, 'cancel')
        .mockRejectedValueOnce(
          new GenerationRunServiceError(
            'GENERATION_RUN_TERMINAL',
            'synthetic terminal cancellation race',
          ),
        );
      const normalizedTerminal = harness.runtime.cancelTask(
        runTerminal.started.taskId,
        runTerminal.project.projectId,
      );
      runTerminal.releaseProvider();
      await expect(normalizedTerminal).resolves.toBe(true);
      await harness.workspace.close(randomUUID(), runTerminal.project.projectId);

      const protocolConflict = await startActiveProse(harness, '协议终态竞争');
      cancelSpy.mockRejectedValueOnce(
        new TaskProtocolError('COMMON_CONFLICT_003', 'synthetic protocol conflict'),
      );
      const normalizedConflict = harness.runtime.cancelTask(
        protocolConflict.started.taskId,
        protocolConflict.project.projectId,
      );
      protocolConflict.releaseProvider();
      await expect(normalizedConflict).resolves.toBe(true);
      await harness.workspace.close(randomUUID(), protocolConflict.project.projectId);

      const unexpected = await startActiveProse(harness, '取消异常传播');
      cancelSpy.mockRejectedValueOnce(new Error('synthetic cancel failure'));
      await expect(
        harness.runtime.cancelTask(unexpected.started.taskId, unexpected.project.projectId),
      ).rejects.toThrow('synthetic cancel failure');
      unexpected.releaseProvider();
      await harness.runtime.waitFor(unexpected.started.run.runId);
      await harness.workspace.close(randomUUID(), unexpected.project.projectId);
      cancelSpy.mockRestore();
    } finally {
      await closeHarness(harness);
    }
  });

  it('covers project/global drain handling for non-cancellable and unexpected failures', async () => {
    const harness = await createHarness();
    try {
      const projectDrain = await startActiveProse(harness, '项目排空不可取消');
      const cancelTaskSpy = vi
        .spyOn(harness.runtime, 'cancelTask')
        .mockRejectedValueOnce(
          new TaskProtocolError('TASK_NOT_CANCELLABLE_001', 'synthetic atomic stage'),
        );
      const projectDrainPromise = harness.runtime.drainProject(projectDrain.project.projectId);
      projectDrain.releaseProvider();
      await expect(projectDrainPromise).resolves.toBeUndefined();
      await harness.workspace.close(randomUUID(), projectDrain.project.projectId);

      const globalDrain = await startActiveProse(harness, '全局排空不可取消');
      cancelTaskSpy.mockRejectedValueOnce(
        new TaskProtocolError('TASK_NOT_CANCELLABLE_001', 'synthetic atomic stage'),
      );
      const globalDrainPromise = harness.runtime.drainAll();
      globalDrain.releaseProvider();
      await expect(globalDrainPromise).resolves.toBeUndefined();
      await harness.workspace.close(randomUUID(), globalDrain.project.projectId);

      const projectFailure = await startActiveProse(harness, '项目排空异常');
      cancelTaskSpy.mockRejectedValueOnce(new Error('project drain failure'));
      await expect(harness.runtime.drainProject(projectFailure.project.projectId)).rejects.toThrow(
        'project drain failure',
      );
      projectFailure.releaseProvider();
      await harness.runtime.waitFor(projectFailure.started.run.runId);
      await harness.workspace.close(randomUUID(), projectFailure.project.projectId);

      const globalFailure = await startActiveProse(harness, '全局排空异常');
      cancelTaskSpy.mockRejectedValueOnce(new Error('global drain failure'));
      await expect(harness.runtime.drainAll()).rejects.toThrow('global drain failure');
      globalFailure.releaseProvider();
      await harness.runtime.waitFor(globalFailure.started.run.runId);
      await harness.workspace.close(randomUUID(), globalFailure.project.projectId);
      cancelTaskSpy.mockRestore();
    } finally {
      await closeHarness(harness);
    }
  });

  it('marks the task internal-failed when GenerationRun failure persistence itself fails', async () => {
    const harness = await createHarness();
    try {
      const failSpy = vi
        .spyOn(harness.runs, 'fail')
        .mockRejectedValueOnce(new Error('disk failed'));
      const { project, started } = await startProse(harness, '失败持久化异常', [], {
        providerError: new Error('provider failed'),
      });
      expect(failSpy).toHaveBeenCalledOnce();
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId)).toMatchObject({
        status: 'failed',
        errorCode: 'COMMON_INTERNAL_999',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('keeps the mapped task failure when failure persistence races with a terminal run', async () => {
    const harness = await createHarness();
    try {
      vi.spyOn(harness.runs, 'fail').mockRejectedValueOnce(
        new GenerationRunServiceError('GENERATION_RUN_TERMINAL', 'synthetic terminal failure race'),
      );
      const { project, started } = await startProse(harness, '失败持久化终态竞争', [], {
        providerError: Object.assign(new Error('provider interrupted'), {
          code: 'AI_STREAM_INTERRUPTED_009',
          retryable: true,
        }),
      });
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId)).toMatchObject({
        status: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
      });
    } finally {
      await closeHarness(harness);
    }
  });
});
