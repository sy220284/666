import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import {
  candidateTypeForPartial,
  insertSkeletonCandidate,
} from '../../packages/core-service/src/generation/candidate-persistence.js';
import {
  GenerationRunService,
  type GenerationRunServiceError,
} from '../../packages/core-service/src/generation-run.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-17T06:45:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly generation: GenerationRunService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-candidate-persistence-edge-'));
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

function skeletonPayload(event = '推进剧情') {
  return {
    titleSuggestion: '结构建议',
    tendency: '压迫',
    beats: [
      {
        beatId: 'beat-1',
        order: 1,
        event,
        cause: '追兵逼近',
        consequence: '主角必须行动',
        informationReleased: ['密道存在'],
        characterIntentions: [{ characterId: 'hero', intention: '脱身' }],
      },
    ],
    endingHook: '门外响起脚步声',
    risks: ['连续性'],
  };
}

async function createRun(
  harness: Harness,
  input: Awaited<ReturnType<typeof createProjectDraft>>,
  runType: 'chapter' | 'rewrite' | 'merge' | 'skeleton' = 'chapter',
) {
  const run = await harness.generation.create(randomUUID(), {
    projectId: input.project.projectId,
    chapterId: input.chapter.id,
    baseDraftId: input.draft.draftId,
    baseDraftRevision: input.draft.revision,
    runType,
    promptId: `worldforge.${runType}`,
    promptVersion: 1,
    outputMode: runType === 'skeleton' ? 'structured' : 'text',
    providerId: 'stub',
    actualModel: 'deterministic-v1',
    supportStatus: 'unverified',
    constraintPackage: constraints(input.project.projectId, input.chapter.id, runType),
  });
  await harness.generation.markRunning(randomUUID(), {
    projectId: input.project.projectId,
    runId: run.runId,
  });
  return run;
}

function proseInput(projectId: string, runId: string) {
  return {
    projectId,
    runId,
    title: '边界候选',
    candidateType: 'full' as const,
    completeness: 'complete' as const,
    blocks: [{ blockType: 'paragraph' as const, text: '正文。', attributes: {} }],
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('candidate persistence edge coverage', () => {
  it('rejects prose completion without a Draft baseline and after the baseline revision changes', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '基线冲突');
      const baselineMissing = await harness.generation.create(randomUUID(), {
        projectId: context.project.projectId,
        chapterId: context.chapter.id,
        baseDraftId: null,
        baseDraftRevision: null,
        runType: 'chapter',
        promptId: 'worldforge.chapter',
        promptVersion: 1,
        outputMode: 'text',
        providerId: 'stub',
        actualModel: 'deterministic-v1',
        supportStatus: 'unverified',
        constraintPackage: constraints(context.project.projectId, context.chapter.id),
      });
      await harness.generation.markRunning(randomUUID(), {
        projectId: context.project.projectId,
        runId: baselineMissing.runId,
      });
      await expect(
        harness.generation.completeProseCandidate(
          randomUUID(),
          proseInput(context.project.projectId, baselineMissing.runId),
        ),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });

      const staleRun = await createRun(harness, context);
      await harness.workspace.writeProject(randomUUID(), context.project.projectId, (database) => {
        database
          .prepare('UPDATE drafts SET revision = revision + 1 WHERE id = ?')
          .run(context.draft.draftId);
      });
      await expect(
        harness.generation.completeProseCandidate(
          randomUUID(),
          proseInput(context.project.projectId, staleRun.runId),
        ),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('validates source Version, Draft block provenance and source hashes before saving', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '来源约束');
      const run = await createRun(harness, context);
      const base = proseInput(context.project.projectId, run.runId);

      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          sourceVersionId: randomUUID(),
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });

      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          blocks: [
            {
              blockType: 'paragraph',
              text: '越界来源。',
              attributes: {},
              sourceLogicalBlockIds: [randomUUID()],
            },
          ],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });

      const sourceBlock = context.draft.blocks[0]!;
      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          blocks: [
            {
              logicalBlockId: sourceBlock.logicalBlockId,
              sourceLogicalBlockIds: [sourceBlock.logicalBlockId],
              sourceBlockHash: 'c'.repeat(64),
              blockType: 'paragraph',
              text: '哈希已漂移。',
              attributes: {},
            },
          ],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });

      const version = await new VersionService(harness.workspace, { clock }).create(randomUUID(), {
        projectId: context.project.projectId,
        chapterId: context.chapter.id,
        draftId: context.draft.draftId,
        baseRevision: context.draft.revision,
        title: '有效来源版本',
      });
      const completed = await harness.generation.completeProseCandidate(randomUUID(), {
        ...base,
        sourceVersionId: version.versionId,
        blocks: [
          {
            logicalBlockId: sourceBlock.logicalBlockId,
            sourceBlockHash: sourceBlock.contentHash,
            blockType: 'paragraph',
            text: '来源有效。',
            attributes: {},
          },
        ],
      });
      expect(completed.candidate.blocks[0]?.sourceLogicalBlockIds).toEqual([
        sourceBlock.logicalBlockId,
      ]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rolls back invalid source mappings and persists a complete range mapping', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '来源映射');
      const sourceRun = await createRun(harness, context);
      const sourceCandidate = await harness.generation.completeProseCandidate(
        randomUUID(),
        proseInput(context.project.projectId, sourceRun.runId),
      );
      const run = await createRun(harness, context);
      const base = proseInput(context.project.projectId, run.runId);
      const mapping = {
        mappingType: 'segment' as const,
        sourceUnitId: 'segment-a',
        sourceOrder: 0,
        sourceBlockIds: [context.draft.blocks[0]!.logicalBlockId],
      };

      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          sourceMappings: [{ ...mapping, sourceOrder: -1 }],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_CANDIDATE_INVALID',
      });
      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          sourceMappings: [{ ...mapping, sourceCandidateId: randomUUID() }],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });
      await expect(
        harness.generation.completeProseCandidate(randomUUID(), {
          ...base,
          sourceMappings: [{ ...mapping, sceneBeatId: randomUUID() }],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_BASE_CONFLICT',
      });

      const beat = (
        await new SceneBeatService(harness.workspace, { clock }).create(randomUUID(), {
          projectId: context.project.projectId,
          chapterId: context.chapter.id,
          plotNodeId: null,
          title: '有效映射节拍',
          goal: '验证来源映射',
          coreConflict: '边界检查',
          expectedResult: '写入成功',
          beatType: 'turn',
          wordTargetPercent: 20,
          required: true,
          characterIds: [],
          locationIds: [],
        })
      ).beats[0]!;
      const completed = await harness.generation.completeProseCandidate(randomUUID(), {
        ...base,
        sourceMappings: [
          {
            ...mapping,
            sourceCandidateId: sourceCandidate.candidate.candidateId,
            sceneBeatId: beat.id,
            keepCurrentDraft: true,
            rangeAnchor: { start: 0, end: 1 },
          },
          {
            ...mapping,
            sourceUnitId: 'segment-b',
            sourceOrder: 1,
            keepCurrentDraft: false,
            rangeAnchor: null,
          },
        ],
      });
      const persisted = harness.workspace.readProject(context.project.projectId, (database) =>
        database
          .prepare(
            `SELECT mapping_type AS mappingType, source_order AS sourceOrder,
                    keep_current_draft AS keepCurrentDraft, range_anchor_json AS rangeAnchorJson
               FROM candidate_source_mappings WHERE candidate_id = ?`,
          )
          .get(completed.candidate.candidateId),
      );
      expect(persisted).toMatchObject({
        mappingType: 'segment',
        sourceOrder: 0n,
        keepCurrentDraft: 1n,
        rangeAnchorJson: JSON.stringify({ start: 0, end: 1 }),
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('covers Skeleton candidate count, run type, title and constraint fingerprint guards', async () => {
    const harness = await createHarness();
    try {
      const context = await createProjectDraft(harness, '骨架防御');
      const proseRun = await createRun(harness, context, 'chapter');
      await expect(
        harness.generation.completeSkeletonCandidates(randomUUID(), {
          projectId: context.project.projectId,
          runId: proseRun.runId,
          candidates: [{ title: '错误类型', structuredPayload: skeletonPayload() }],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_CANDIDATE_INVALID',
      });

      await expect(
        harness.generation.completeSkeletonCandidates(randomUUID(), {
          projectId: context.project.projectId,
          runId: proseRun.runId,
          candidates: [],
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_CANDIDATE_INVALID',
      });
      await expect(
        harness.generation.completeSkeletonCandidates(randomUUID(), {
          projectId: context.project.projectId,
          runId: proseRun.runId,
          candidates: Array.from({ length: 6 }, (_, index) => ({
            title: `过量骨架-${index}`,
            structuredPayload: skeletonPayload(`事件-${index}`),
          })),
        }),
      ).rejects.toMatchObject<Partial<GenerationRunServiceError>>({
        code: 'GENERATION_CANDIDATE_INVALID',
      });

      await harness.workspace.writeProject(randomUUID(), context.project.projectId, (database) => {
        expect(() =>
          insertSkeletonCandidate(
            database,
            proseRun,
            { title: '直接写入错误类型', structuredPayload: skeletonPayload() },
            randomUUID,
            clock.now().toISOString(),
          ),
        ).toThrowError(expect.objectContaining({ code: 'GENERATION_CANDIDATE_INVALID' }));
      });

      const skeletonRun = await createRun(harness, context, 'skeleton');
      await harness.workspace.writeProject(randomUUID(), context.project.projectId, (database) => {
        expect(() =>
          insertSkeletonCandidate(
            database,
            skeletonRun,
            { title: '   ', structuredPayload: skeletonPayload() },
            randomUUID,
            clock.now().toISOString(),
          ),
        ).toThrowError(expect.objectContaining({ code: 'GENERATION_CANDIDATE_INVALID' }));
      });

      await harness.workspace.writeProject(randomUUID(), context.project.projectId, (database) => {
        database
          .prepare('DELETE FROM generation_constraint_packages WHERE run_id = ?')
          .run(skeletonRun.runId);
        expect(() =>
          insertSkeletonCandidate(
            database,
            skeletonRun,
            { title: '缺少约束指纹', structuredPayload: skeletonPayload() },
            randomUUID,
            clock.now().toISOString(),
          ),
        ).toThrowError(expect.objectContaining({ code: 'GENERATION_BASE_CONFLICT' }));
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('maps prose partial run types and rejects Skeleton partials', () => {
    expect(candidateTypeForPartial('chapter')).toBe('full');
    expect(candidateTypeForPartial('rewrite')).toBe('rewrite');
    expect(candidateTypeForPartial('merge')).toBe('merge');
    expect(() => candidateTypeForPartial('skeleton')).toThrowError(
      expect.objectContaining({ code: 'GENERATION_CANDIDATE_INVALID' }),
    );
  });
});
