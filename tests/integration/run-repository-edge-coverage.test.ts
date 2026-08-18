import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema, type ConstraintPackage } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  assertActive,
  auditSources,
  cancel,
  create,
  fail,
  getContinuationContext,
  markRunning,
  markStage,
  mapRun,
  readRun,
  resultRefs,
  updateUsage,
  type GenerationRunCreateInput,
  type GenerationRunRow,
  type GenerationRunServiceContext,
} from '../../packages/core-service/src/generation/run-repository.js';
import { savePartial } from '../../packages/core-service/src/generation/partial-result-service.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T06:55:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly context: GenerationRunServiceContext;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-run-repository-edge-'));
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
    context: { workspace, clock, idFactory: randomUUID },
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function projectDraft(harness: Harness, name: string) {
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

function constraints(
  projectId: string,
  chapterId: string,
  taskType: string = 'chapter',
  withSource = false,
): ConstraintPackage {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType,
    snapshotSource: 'fallback_live_query',
    sections: {
      P0: withSource
        ? [
            {
              id: 'source-1',
              priority: 'P0',
              sourceType: 'chapter',
              sourceId: chapterId,
              sourceVersionId: null,
              chapterId,
              entityId: null,
              semanticKey: 'chapter-goal',
              label: '章节目标',
              content: '推进剧情',
              relevance: 1,
              required: true,
              temporalStatus: 'current',
              estimatedTokens: 4,
              contentHash: 'a'.repeat(64),
            },
          ]
        : [],
      P1: [],
      P2: [],
      P3: [],
      P4: [],
    },
    sourceVersionIds: [],
    estimatedTokens: withSource ? 4 : 0,
    budget: { maxInputTokens: 32_768, safetyMarginTokens: 2_048, usableTokens: 30_720 },
    contentHash: 'b'.repeat(64),
    constraintHash: 'c'.repeat(64),
    trimLog: [],
    conflicts: [],
  });
}

function chapterInput(
  projectId: string,
  chapterId: string,
  draftId: string,
  revision: number,
  overrides: Partial<GenerationRunCreateInput> = {},
): GenerationRunCreateInput {
  return {
    projectId,
    scopeType: 'chapter',
    scopeId: chapterId,
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

function fakeDatabase(rows: readonly Record<string, unknown>[]): DatabaseSync {
  return contractInput<DatabaseSync>({
    prepare: () => contractInput({ all: () => rows }),
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('generation run repository edge coverage', () => {
  it('maps every result reference kind and audits populated constraint sources', () => {
    expect(
      resultRefs(
        fakeDatabase([
          { resultType: 'candidate', resultId: 'c', candidateKind: 'prose' },
          { resultType: 'state_proposal_batch', resultId: 's', candidateKind: null },
          { resultType: 'validation_batch', resultId: 'v', candidateKind: null },
          { resultType: 'idea_card', resultId: 'i', candidateKind: null },
          { resultType: 'journal_entry', resultId: 'j', candidateKind: null },
          { resultType: 'future_type', resultId: 'ignored', candidateKind: null },
        ]),
        'run',
      ),
    ).toEqual([
      { resultType: 'candidate', resultId: 'c', candidateKind: 'prose' },
      { resultType: 'state_proposal_batch', resultId: 's' },
      { resultType: 'validation_batch', resultId: 'v' },
      { resultType: 'idea_card', resultId: 'i' },
      { resultType: 'journal_entry', resultId: 'j' },
    ]);

    const audited = auditSources(constraints(randomUUID(), randomUUID(), 'chapter', true));
    expect(audited).toEqual([
      expect.objectContaining({
        priority: 'P0',
        sourceType: 'chapter',
        semanticKey: 'chapter-goal',
        estimatedTokens: 4,
      }),
    ]);
  });

  it('maps numeric SQLite fields and rejects missing or terminal runs', () => {
    const row: GenerationRunRow = {
      runId: randomUUID(),
      requestId: randomUUID(),
      taskId: randomUUID(),
      projectId: randomUUID(),
      scopeType: 'chapter',
      scopeId: randomUUID(),
      chapterId: randomUUID(),
      baseDraftId: randomUUID(),
      baseDraftRevision: 3n,
      runType: 'chapter',
      promptId: 'worldforge.chapter',
      promptVersion: 2n,
      outputMode: 'text',
      providerId: 'stub',
      actualModel: 'model',
      supportStatus: 'unverified',
      status: 'running',
      stage: 'receiving_output',
      retryCount: 1n,
      inputTokens: 9n,
      outputTokens: 5n,
      errorCode: null,
      retryable: 0n,
      partialStatus: 'unavailable',
      createdAt: clock.now().toISOString(),
      startedAt: clock.now().toISOString(),
      finishedAt: null,
    };
    expect(mapRun(fakeDatabase([]), row)).toMatchObject({
      baseDraftRevision: 3,
      promptVersion: 2,
      retryCount: 1,
      inputTokens: 9,
      outputTokens: 5,
      retryable: false,
    });

    expect(
      mapRun(fakeDatabase([]), {
        ...row,
        baseDraftId: null,
        baseDraftRevision: null,
        inputTokens: null,
        outputTokens: null,
        retryable: null,
      }),
    ).toMatchObject({
      baseDraftRevision: null,
      inputTokens: null,
      outputTokens: null,
      retryable: null,
    });

    const missingDb = contractInput<DatabaseSync>({
      prepare: () => contractInput({ get: () => undefined }),
    });
    expect(() => readRun(missingDb, { projectId: randomUUID(), runId: randomUUID() })).toThrowError(
      expect.objectContaining({ code: 'GENERATION_RUN_NOT_FOUND' }),
    );
    expect(() => assertActive({ ...mapRun(fakeDatabase([]), row), status: 'failed' })).toThrowError(
      expect.objectContaining({ code: 'GENERATION_RUN_TERMINAL' }),
    );
  });

  it('rejects incompatible constraint and scope combinations before persistence', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '创建边界');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );
      const volumeId = harness.structure.list(current.project.projectId).volumes[0]!.id;
      const withSecondChapter = await harness.structure.createChapter(randomUUID(), {
        projectId: current.project.projectId,
        volumeId,
        title: '第二章',
      });
      const secondChapterId = withSecondChapter.volumes[0]!.chapters[1]!.id;

      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          runType: 'idea_explore',
          scopeType: 'project',
          scopeId: current.project.projectId,
          chapterId: null,
          baseDraftId: null,
          baseDraftRevision: null,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });

      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          constraintPackage: constraints(current.project.projectId, current.chapter.id, 'skeleton'),
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });

      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          scopeType: 'project',
          scopeId: randomUUID(),
          runType: 'idea_explore',
          chapterId: null,
          baseDraftId: null,
          baseDraftRevision: null,
          constraintPackage: null,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });

      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          scopeId: secondChapterId,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });

      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          scopeType: 'project',
          scopeId: current.project.projectId,
          runType: 'idea_explore',
          chapterId: randomUUID(),
          baseDraftId: null,
          baseDraftRevision: null,
          constraintPackage: null,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('dispatches every generic scope branch and accepts a valid project compatibility chapter', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '通用范围');
      const genericBase: GenerationRunCreateInput = {
        projectId: current.project.projectId,
        scopeType: 'project',
        scopeId: current.project.projectId,
        chapterId: null,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'idea_explore',
        promptId: 'worldforge.idea_explore',
        promptVersion: 1,
        outputMode: 'structured',
        providerId: 'stub',
        actualModel: 'deterministic-v1',
        supportStatus: 'unverified',
        constraintPackage: null,
      };
      for (const scopeType of ['volume', 'scene', 'entity', 'selection'] as const) {
        await expect(
          create(harness.context, randomUUID(), {
            ...genericBase,
            scopeType,
            scopeId: randomUUID(),
          }),
        ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      }

      const projectScoped = await create(harness.context, randomUUID(), {
        ...genericBase,
        chapterId: current.chapter.id,
      });
      expect(projectScoped).toMatchObject({
        scopeType: 'project',
        scopeId: current.project.projectId,
        chapterId: current.chapter.id,
        baseDraftId: null,
        baseDraftRevision: null,
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('validates baseline pairing, chapter requirement and stale draft revisions', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '基线校验');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );
      await expect(
        create(harness.context, randomUUID(), { ...base, baseDraftRevision: null }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          scopeType: 'project',
          scopeId: current.project.projectId,
          runType: 'idea_explore',
          chapterId: null,
          constraintPackage: null,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      await expect(
        create(harness.context, randomUUID(), {
          ...base,
          baseDraftRevision: current.draft.revision + 1,
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('replays the existing row and validates every input-source boundary', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '输入来源');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );
      const requestId = randomUUID();
      const first = await create(harness.context, requestId, base);
      await harness.workspace.close(randomUUID(), current.project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: current.project.workspacePath });
      expect(await create(harness.context, requestId, base)).toEqual(first);

      const invalidSources = [
        { sourceType: 'current_draft' as const, sourceId: '', sourceOrder: 0 },
        { sourceType: 'current_draft' as const, sourceId: 'draft', sourceOrder: 0.5 },
        { sourceType: 'current_draft' as const, sourceId: 'draft', sourceOrder: -1 },
        {
          sourceType: 'current_draft' as const,
          sourceId: 'draft',
          sourceOrder: 0,
          contentHash: 'bad',
        },
      ];
      for (const source of invalidSources) {
        await expect(
          create(harness.context, randomUUID(), { ...base, inputSources: [source] }),
        ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      }

      const valid = await create(harness.context, randomUUID(), {
        ...base,
        inputSources: [
          { sourceType: 'current_draft', sourceId: 'draft-a', sourceOrder: 0 },
          {
            sourceType: 'current_draft',
            sourceId: 'draft-b',
            sourceOrder: 1,
            contentHash: null,
            metadata: { role: 'secondary' },
          },
          {
            sourceType: 'current_draft',
            sourceId: 'draft-c',
            sourceOrder: 2,
            contentHash: 'd'.repeat(64),
          },
        ],
      });
      expect(
        harness.workspace.readProject(current.project.projectId, (database) =>
          database
            .prepare(
              'SELECT source_id AS sourceId, content_hash AS contentHash, metadata_json AS metadataJson FROM generation_input_sources WHERE run_id = ? ORDER BY source_order',
            )
            .all(valid.runId),
        ),
      ).toEqual([
        { sourceId: 'draft-a', contentHash: null, metadataJson: '{}' },
        { sourceId: 'draft-b', contentHash: null, metadataJson: '{"role":"secondary"}' },
        { sourceId: 'draft-c', contentHash: 'd'.repeat(64), metadataJson: '{}' },
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('covers available, saved and broken partial continuation boundaries', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '续写上下文');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );

      const queued = await create(harness.context, randomUUID(), base);
      expect(() =>
        getContinuationContext(harness.context, {
          projectId: current.project.projectId,
          runId: queued.runId,
        }),
      ).toThrowError(expect.objectContaining({ code: 'GENERATION_PARTIAL_UNAVAILABLE' }));

      const available = await create(harness.context, randomUUID(), base);
      await markRunning(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: available.runId,
      });
      await cancel(
        harness.context,
        randomUUID(),
        { projectId: current.project.projectId, runId: available.runId },
        '第一段。\n\n第二段。',
      );
      expect(
        getContinuationContext(harness.context, {
          projectId: current.project.projectId,
          runId: available.runId,
        }),
      ).toMatchObject({
        receivedText: '第一段。\n\n第二段。',
        originalConstraintHash: 'c'.repeat(64),
      });

      const saved = await savePartial(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: available.runId,
      });
      expect(saved.run.partialStatus).toBe('saved');
      expect(
        getContinuationContext(harness.context, {
          projectId: current.project.projectId,
          runId: available.runId,
        }).receivedText,
      ).toBe('第一段。\n\n第二段。');

      const missingBuffer = await create(harness.context, randomUUID(), base);
      await markRunning(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: missingBuffer.runId,
      });
      await cancel(
        harness.context,
        randomUUID(),
        { projectId: current.project.projectId, runId: missingBuffer.runId },
        '将被删除',
      );
      await harness.workspace.writeProject(randomUUID(), current.project.projectId, (database) => {
        database
          .prepare('DELETE FROM generation_partial_buffers WHERE run_id = ?')
          .run(missingBuffer.runId);
      });
      expect(() =>
        getContinuationContext(harness.context, {
          projectId: current.project.projectId,
          runId: missingBuffer.runId,
        }),
      ).toThrowError(expect.objectContaining({ code: 'GENERATION_PARTIAL_UNAVAILABLE' }));

      const missingConstraint = await create(harness.context, randomUUID(), base);
      await markRunning(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: missingConstraint.runId,
      });
      await cancel(
        harness.context,
        randomUUID(),
        { projectId: current.project.projectId, runId: missingConstraint.runId },
        '保留文本',
      );
      await harness.workspace.writeProject(randomUUID(), current.project.projectId, (database) => {
        database
          .prepare('DELETE FROM generation_constraint_packages WHERE run_id = ?')
          .run(missingConstraint.runId);
      });
      expect(() =>
        getContinuationContext(harness.context, {
          projectId: current.project.projectId,
          runId: missingConstraint.runId,
        }),
      ).toThrowError(expect.objectContaining({ code: 'GENERATION_PARTIAL_UNAVAILABLE' }));
    } finally {
      await closeHarness(harness);
    }
  });

  it('persists cancellation without a partial and both failure retryability branches', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '取消与失败');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );

      const cancelledRun = await create(harness.context, randomUUID(), base);
      const cancelled = await cancel(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: cancelledRun.runId,
      });
      expect(cancelled).toMatchObject({ status: 'cancelled', partialStatus: 'unavailable' });

      const failedWithPartial = await create(harness.context, randomUUID(), base);
      const failedAvailable = await fail(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: failedWithPartial.runId,
        errorCode: 'AI_STREAM_INTERRUPTED_009',
        retryable: true,
        partialText: '保留失败部分',
      });
      expect(failedAvailable).toMatchObject({
        status: 'failed',
        retryable: true,
        partialStatus: 'available',
        errorCode: 'AI_STREAM_INTERRUPTED_009',
      });

      const failedWithoutPartial = await create(harness.context, randomUUID(), base);
      const failedUnavailable = await fail(harness.context, randomUUID(), {
        projectId: current.project.projectId,
        runId: failedWithoutPartial.runId,
        errorCode: 'AI_OUTPUT_INVALID_008',
        retryable: false,
      });
      expect(failedUnavailable).toMatchObject({
        status: 'failed',
        retryable: false,
        partialStatus: 'unavailable',
        errorCode: 'AI_OUTPUT_INVALID_008',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects terminal stage shortcuts and updates either usage counter independently', async () => {
    const harness = await createHarness();
    try {
      const current = await projectDraft(harness, '阶段与用量');
      const base = chapterInput(
        current.project.projectId,
        current.chapter.id,
        current.draft.draftId,
        current.draft.revision,
      );
      const run = await create(harness.context, randomUUID(), base);
      for (const stage of ['completed', 'failed', 'cancelled'] as const) {
        await expect(
          markStage(harness.context, randomUUID(), {
            projectId: current.project.projectId,
            runId: run.runId,
            stage,
          }),
        ).rejects.toMatchObject({ code: 'GENERATION_RUN_TERMINAL' });
      }
      expect(
        await updateUsage(harness.context, randomUUID(), {
          projectId: current.project.projectId,
          runId: run.runId,
          inputTokens: 12,
        }),
      ).toMatchObject({ inputTokens: 12, outputTokens: null });
      expect(
        await updateUsage(harness.context, randomUUID(), {
          projectId: current.project.projectId,
          runId: run.runId,
          outputTokens: 7,
        }),
      ).toMatchObject({ inputTokens: 12, outputTokens: 7 });
    } finally {
      await closeHarness(harness);
    }
  });
});
