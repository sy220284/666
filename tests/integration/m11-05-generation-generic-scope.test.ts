import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import {
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

afterEach(cleanupCandidateApplyDirectories);

function ideaRunInput(
  projectId: string,
  scopeType: 'project' | 'volume' | 'chapter' | 'scene' | 'entity' | 'selection',
  scopeId: string,
  chapterId: string | null,
) {
  return {
    projectId,
    scopeType,
    scopeId,
    chapterId,
    baseDraftId: null,
    baseDraftRevision: null,
    runType: 'idea_explore' as const,
    promptId: 'worldforge.idea-explore',
    promptVersion: 1,
    outputMode: 'structured' as const,
    providerId: 'fixture-provider',
    actualModel: 'fixture-model',
    supportStatus: 'unverified' as const,
    constraintPackage: null,
  };
}

describe('M11-05 GenerationRun generic scope ownership', () => {
  it('accepts and resolves every supported scope, then persists generated Ideas', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const volume = harness.structure.list(project.projectId).volumes[0]!;
      const beats = new SceneBeatService(harness.workspace);
      const beat = (
        await beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          plotNodeId: null,
          title: 'Generic scope 场景',
          goal: '',
          coreConflict: '',
          expectedResult: '',
          beatType: 'setup',
          wordTargetPercent: 10,
          required: true,
          characterIds: [],
          locationIds: [],
        })
      ).beats[0]!;
      const canon = new EntityCanonService(harness.workspace);
      const entity = (
        await canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: 'Generic scope 人物',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;
      const selectionId = draft.blocks[0]!.logicalBlockId;
      const generation = new GenerationRunService(harness.workspace);

      const cases = [
        ['project', project.projectId, null],
        ['volume', volume.id, null],
        ['chapter', chapter.id, chapter.id],
        ['scene', beat.id, chapter.id],
        ['entity', entity.id, null],
        ['selection', selectionId, chapter.id],
      ] as const;
      const runs = [];
      const contexts = [];
      for (const [scopeType, scopeId, compatibilityChapterId] of cases) {
        contexts.push(
          generation.resolveIdeaScopeContext({
            projectId: project.projectId,
            scopeType,
            scopeId,
            chapterId: compatibilityChapterId,
          }),
        );
        runs.push(
          await generation.create(
            randomUUID(),
            ideaRunInput(project.projectId, scopeType, scopeId, compatibilityChapterId),
          ),
        );
      }

      expect(
        runs.map((run) => ({
          scopeType: run.scopeType,
          scopeId: run.scopeId,
          chapterId: run.chapterId,
          runType: run.runType,
        })),
      ).toEqual(
        cases.map(([scopeType, scopeId, chapterId]) => ({
          scopeType,
          scopeId,
          chapterId,
          runType: 'idea_explore',
        })),
      );
      expect(contexts.map((context) => context.sourceContext.scopeType)).toEqual(
        cases.map(([scopeType]) => scopeType),
      );
      expect(contexts.every((context) => context.constraintHash.length === 64)).toBe(true);
      expect(contexts.every((context) => context.inputSources[0]?.sourceType === 'scope')).toBe(
        true,
      );

      const completion = await generation.completeIdeaCards(randomUUID(), {
        projectId: project.projectId,
        runId: runs[0]!.runId,
        ideaKind: 'plot',
        divergenceLevel: 'different',
        depthLevel: 'expand',
        sourceContext: contexts[0]!.sourceContext,
        ideas: [
          {
            title: '从作品范围生成的灵感',
            summary: '验证结构化探索结果会写入 IdeaCard。',
            content: '这条结果同时保留 GenerationRun 与来源范围。',
          },
        ],
        usage: { inputTokens: 11, outputTokens: 22 },
      });
      expect(completion.run).toMatchObject({
        status: 'succeeded',
        stage: 'completed',
        inputTokens: 11,
        outputTokens: 22,
      });
      expect(completion.ideas[0]).toMatchObject({
        generationRunId: runs[0]!.runId,
        sourceContext: contexts[0]!.sourceContext,
        status: 'active',
      });
      expect(
        generation.list({
          projectId: project.projectId,
          scopeType: 'selection',
          scopeId: selectionId,
        }).runs,
      ).toHaveLength(1);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('fails closed for missing and cross-project generic scope targets', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter } = await createTwoBlockDraft(harness);
      const canon = new EntityCanonService(harness.workspace);
      const entity = (
        await canon.create(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '只属于源项目',
          aliases: [],
          summary: '',
        })
      ).entities[0]!;
      await harness.workspace.close(randomUUID(), project.projectId);
      const foreign = await harness.workspace.create(
        randomUUID(),
        { name: '外部项目', channel: '长篇' },
        harness.parent,
      );
      const generation = new GenerationRunService(harness.workspace);

      await expect(
        generation.create(randomUUID(), ideaRunInput(foreign.projectId, 'entity', entity.id, null)),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      expect(() =>
        generation.resolveIdeaScopeContext({
          projectId: foreign.projectId,
          scopeType: 'entity',
          scopeId: entity.id,
          chapterId: null,
        }),
      ).toThrow(expect.objectContaining({ code: 'GENERATION_BASE_CONFLICT' }));

      await harness.workspace.close(randomUUID(), foreign.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      await expect(
        generation.create(
          randomUUID(),
          ideaRunInput(project.projectId, 'scene', randomUUID(), chapter.id),
        ),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      expect(() =>
        generation.resolveIdeaScopeContext({
          projectId: project.projectId,
          scopeType: 'project',
          scopeId: project.projectId,
          chapterId: randomUUID(),
        }),
      ).toThrow(expect.objectContaining({ code: 'GENERATION_BASE_CONFLICT' }));
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rejects a selection that survives only in an inactive Draft before persistence', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const selectionId = draft.blocks[0]!.logicalBlockId;
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare(`UPDATE drafts SET status = 'archived' WHERE id = ?`).run(draft.id);
      });
      const generation = new GenerationRunService(harness.workspace);

      await expect(
        generation.create(
          randomUUID(),
          ideaRunInput(project.projectId, 'selection', selectionId, chapter.id),
        ),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          Number(database.prepare('SELECT COUNT(*) AS count FROM generation_runs').get()?.count ?? 0),
        ),
      ).toBe(0);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rejects invalid Idea completion counts and mismatched source ownership', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project } = await createTwoBlockDraft(harness);
      const generation = new GenerationRunService(harness.workspace);
      const context = generation.resolveIdeaScopeContext({
        projectId: project.projectId,
        scopeType: 'project',
        scopeId: project.projectId,
        chapterId: null,
      });
      const run = await generation.create(
        randomUUID(),
        ideaRunInput(project.projectId, 'project', project.projectId, null),
      );
      const base = {
        projectId: project.projectId,
        runId: run.runId,
        ideaKind: 'plot' as const,
        divergenceLevel: 'safe' as const,
        depthLevel: 'spark' as const,
        sourceContext: context.sourceContext,
      };

      await expect(
        generation.completeIdeaCards(randomUUID(), { ...base, ideas: [] }),
      ).rejects.toMatchObject({ code: 'GENERATION_CANDIDATE_INVALID' });
      await expect(
        generation.completeIdeaCards(randomUUID(), {
          ...base,
          ideas: Array.from({ length: 9 }, (_, index) => ({
            title: `过量灵感 ${index + 1}`,
            summary: '超过单次允许数量。',
            content: '用于验证上界保护。',
          })),
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_CANDIDATE_INVALID' });
      await expect(
        generation.completeIdeaCards(randomUUID(), {
          ...base,
          sourceContext: { ...context.sourceContext, scopeType: 'entity', scopeId: randomUUID() },
          ideas: [{ title: '错误来源', summary: '范围不匹配。', content: '必须拒绝。' }],
        }),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
