import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema, ModelSupportProfileSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  GenerationRunService,
  type GenerationRunServiceError,
} from '../../packages/core-service/src/generation-run.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T05:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly generation: GenerationRunService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-generation-run-'));
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
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
    generation: new GenerationRunService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 GenerationRun persistence', () => {
  it('atomically commits a successful prose Candidate and typed result reference', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '原子生成');
      const run = await harness.generation.create(randomUUID(), {
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
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      const completed = await harness.generation.completeProseCandidate(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
        title: '章节候选',
        candidateType: 'full',
        completeness: 'complete',
        blocks: [{ blockType: 'paragraph', text: '雨落旧渡口。', attributes: {} }],
        usage: { inputTokens: 120, outputTokens: 40 },
      });

      expect(completed.run).toMatchObject({
        status: 'succeeded',
        stage: 'completed',
        inputTokens: 120,
        outputTokens: 40,
        partialStatus: 'unavailable',
        resultRefs: [
          {
            resultType: 'candidate',
            resultId: completed.candidate.candidateId,
            candidateKind: 'prose',
          },
        ],
      });
      expect(completed.candidate).toMatchObject({
        generationRunId: run.runId,
        candidateType: 'full',
        completeness: 'complete',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('rolls back Candidate and result records when atomic completion validation fails', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '失败回滚');
      const run = await harness.generation.create(randomUUID(), {
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
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      const duplicateLogicalBlockId = randomUUID();
      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          projectId: project.projectId,
          runId: run.runId,
          title: '无效候选',
          candidateType: 'full',
          completeness: 'complete',
          blocks: [
            {
              logicalBlockId: duplicateLogicalBlockId,
              blockType: 'paragraph',
              text: '第一段',
              attributes: {},
            },
            {
              logicalBlockId: duplicateLogicalBlockId,
              blockType: 'paragraph',
              text: '第二段',
              attributes: {},
            },
          ],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_CANDIDATE_INVALID',
      });
      expect(
        harness.generation.get({ projectId: project.projectId, runId: run.runId }),
      ).toMatchObject({
        status: 'running',
        resultRefs: [],
      });
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          database
            .prepare(`SELECT COUNT(*) AS count FROM candidates WHERE generation_run_id = ?`)
            .get(run.runId),
        ),
      ).toEqual({ count: 0n });
    } finally {
      await closeHarness(harness);
    }
  });

  it('requires an explicit author decision for partial output and survives restart reads', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '部分输出');
      const run = await harness.generation.create(randomUUID(), {
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
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      const cancelled = await harness.generation.cancel(
        randomUUID(),
        { projectId: project.projectId, runId: run.runId },
        '第一段。\n\n第二段。',
      );
      expect(cancelled).toMatchObject({ status: 'cancelled', partialStatus: 'available' });
      await expect(
        harness.generation.markStage(randomUUID(), {
          projectId: project.projectId,
          runId: run.runId,
          stage: 'receiving_output',
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_RUN_TERMINAL',
      });

      const saved = await harness.generation.savePartial(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      expect(saved.run).toMatchObject({ status: 'cancelled', partialStatus: 'saved' });
      expect(saved.candidate).toMatchObject({ completeness: 'partial', candidateType: 'full' });
      expect(
        harness.generation.list({ projectId: project.projectId, chapterId: chapter.id }).runs[0],
      ).toEqual(saved.run);
    } finally {
      await closeHarness(harness);
    }
  });

  it('marks interrupted in-memory runs as failed without inventing a resumed stream', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createProjectDraft(harness, '重启收口');
      const run = await harness.generation.create(randomUUID(), {
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
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      const recovered = await harness.generation.recoverInterrupted(
        randomUUID(),
        project.projectId,
      );
      expect(recovered).toBe(1);
      expect(
        harness.generation.get({ projectId: project.projectId, runId: run.runId }),
      ).toMatchObject({
        status: 'failed',
        stage: 'failed',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        retryable: true,
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('defaults unknown model support to unverified and normalizes historical untested writes', async () => {
    const harness = await createHarness();
    try {
      const { project } = await createProjectDraft(harness, '模型支持');
      const query = {
        projectId: project.projectId,
        providerId: 'stub',
        model: 'deterministic-v1',
        taskType: 'chapter' as const,
        promptId: 'worldforge.chapter',
        promptVersion: 1,
      };
      expect(harness.generation.getModelSupport(query)).toMatchObject({
        status: 'unverified',
        limitations: [expect.stringContaining('尚未完成独立评测')],
      });
      await harness.generation.upsertModelSupport(
        randomUUID(),
        project.projectId,
        ModelSupportProfileSchema.parse({
          providerId: query.providerId,
          model: query.model,
          taskType: query.taskType,
          promptId: query.promptId,
          promptVersion: query.promptVersion,
          status: 'untested',
          limitations: ['历史档案'],
        }),
      );
      expect(harness.generation.getModelSupport(query)).toMatchObject({
        status: 'unverified',
        limitations: ['历史档案'],
      });
    } finally {
      await closeHarness(harness);
    }
  });
});
