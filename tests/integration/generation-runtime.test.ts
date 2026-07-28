import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  ConstraintPackageSchema,
  GenerationRequestSchema,
  type ProviderEvent,
} from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationRuntime,
  type GenerationRuntimeProvider,
} from '../../packages/core-service/src/generation-runtime.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T06:00:00.000Z') };

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
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-generation-runtime-'));
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

function request(runId: string) {
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

function provider(events: readonly ProviderEvent[], error?: Error): GenerationRuntimeProvider {
  return {
    async *generate(_request, signal) {
      for (const event of events) {
        if (signal.aborted) return;
        yield event;
      }
      if (error) throw error;
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 GenerationRuntime', () => {
  it('parses one structured stream into multiple authoritative Skeleton results', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '多骨架运行');
      const batch = {
        candidates: ['试探', '突围'].map((event) => ({
          titleSuggestion: event,
          tendency: '悬疑',
          beats: [
            {
              beatId: 'required-beat',
              order: 1,
              event,
              cause: '追兵逼近',
              consequence: '改变行动路线',
              informationReleased: [],
              characterIntentions: [],
            },
          ],
          endingHook: '灯火熄灭',
          risks: [],
        })),
      };
      const started = await harness.runtime.startStructured({
        requestId: randomUUID(),
        run: {
          projectId: project.projectId,
          chapterId: chapter.id,
          baseDraftId: draft.draftId,
          baseDraftRevision: draft.revision,
          runType: 'skeleton',
          promptId: 'worldforge.skeleton',
          promptVersion: 1,
          outputMode: 'structured',
          providerId: 'stub',
          actualModel: 'deterministic-v1',
          supportStatus: 'unverified',
          constraintPackage: constraints(project.projectId, chapter.id, 'skeleton'),
        },
        provider: provider([
          { type: 'connected' },
          { type: 'delta', text: JSON.stringify(batch) },
          { type: 'completed' },
        ]),
        requestFor: (runId) =>
          GenerationRequestSchema.parse({
            runId,
            model: 'deterministic-v1',
            systemPrompt: '只输出骨架批次。',
            messages: [{ role: 'user', content: '生成两个骨架。' }],
            maxOutputTokens: 4_096,
            structuredOutput: { name: 'skeleton_candidate_batch_v1', schema: {} },
            metadata: {
              promptId: 'worldforge.skeleton',
              promptVersion: 1,
              taskType: 'skeleton',
              constraintHash: 'b'.repeat(64),
            },
          }),
        partialOnFailure: false,
        complete: async (runId, raw, usage) => {
          const parsed = JSON.parse(raw) as typeof batch;
          const completed = await harness.runs.completeSkeletonCandidates(randomUUID(), {
            projectId: project.projectId,
            runId,
            candidates: parsed.candidates.map((candidate) => ({
              title: candidate.titleSuggestion,
              structuredPayload: candidate,
            })),
            usage,
          });
          return {
            run: completed.run,
            candidateIds: completed.candidates.map((candidate) => candidate.candidateId),
            resultRefs: completed.run.resultRefs,
          };
        },
      });
      await harness.runtime.waitFor(started.run.runId);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({
        status: 'succeeded',
        resultRefs: [
          { resultType: 'candidate', candidateKind: 'skeleton' },
          { resultType: 'candidate', candidateKind: 'skeleton' },
        ],
      });
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId).resultRefs).toHaveLength(
        2,
      );
    } finally {
      await closeHarness(harness);
    }
  });

  it('streams through TaskProtocol and commits the authoritative Candidate before success', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '运行成功');
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
        provider: provider([
          { type: 'connected' },
          { type: 'delta', text: '雨落' },
          { type: 'delta', text: '旧渡口。' },
          { type: 'usage', inputTokens: 20, outputTokens: 6 },
          { type: 'completed', finishReason: 'stop' },
        ]),
        requestFor: request,
        candidate: { title: '正文候选', candidateType: 'full' },
        parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
      });
      await harness.runtime.waitFor(started.run.runId);

      const persisted = harness.runs.get({
        projectId: project.projectId,
        runId: started.run.runId,
      });
      expect(persisted).toMatchObject({
        status: 'succeeded',
        stage: 'completed',
        inputTokens: 20,
        outputTokens: 6,
        resultRefs: [{ resultType: 'candidate', candidateKind: 'prose' }],
      });
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId)).toMatchObject({
        status: 'succeeded',
        previewText: '雨落旧渡口。',
        resultRefs: persisted.resultRefs,
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('persists interrupted output as undecided partial and blocks late deltas after cancel', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '运行取消');
      const interrupted = new Error('断流') as Error & { code: string; retryable: boolean };
      interrupted.code = 'AI_STREAM_INTERRUPTED_009';
      interrupted.retryable = true;
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
        provider: provider([{ type: 'delta', text: '留下部分正文。' }], interrupted),
        requestFor: request,
        candidate: { title: '正文候选', candidateType: 'full' },
        parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
      });
      await harness.runtime.waitFor(started.run.runId);
      expect(
        harness.runs.get({ projectId: project.projectId, runId: started.run.runId }),
      ).toMatchObject({
        status: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        partialStatus: 'available',
        resultRefs: [],
      });
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId)).toMatchObject({
        status: 'failed',
        previewText: '留下部分正文。',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('aborts the Provider and ignores a deliberately late delta after explicit cancellation', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '显式取消');
      let providerStarted!: () => void;
      const startedSignal = new Promise<void>((resolve) => {
        providerStarted = resolve;
      });
      const lateProvider: GenerationRuntimeProvider = {
        async *generate(_request, signal) {
          yield { type: 'connected' };
          yield { type: 'delta', text: '应保留。' };
          providerStarted();
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve();
            else signal.addEventListener('abort', () => resolve(), { once: true });
          });
          yield { type: 'delta', text: '迟到内容不得展示或保存。' };
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
        provider: lateProvider,
        requestFor: request,
        candidate: { title: '正文候选', candidateType: 'full' },
        parse: (text) => [{ blockType: 'paragraph', text, attributes: {} }],
      });
      await startedSignal;
      const cancelled = await harness.runtime.cancel(randomUUID(), {
        projectId: project.projectId,
        runId: started.run.runId,
      });
      await harness.runtime.waitFor(started.run.runId);

      expect(cancelled).toMatchObject({ status: 'cancelled', partialStatus: 'available' });
      expect(harness.tasks.getSnapshot(started.taskId, project.projectId)).toMatchObject({
        status: 'cancelled',
        previewText: '应保留。',
      });
      const saved = await harness.runs.savePartial(randomUUID(), {
        projectId: project.projectId,
        runId: started.run.runId,
      });
      expect(saved.candidate?.blocks.map((block) => block.text)).toEqual(['应保留。']);
    } finally {
      await closeHarness(harness);
    }
  });
});
