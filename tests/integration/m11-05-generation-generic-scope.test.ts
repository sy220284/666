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
  it('accepts every supported scope type with the canonical project-owned target', async () => {
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
      for (const [scopeType, scopeId, compatibilityChapterId] of cases) {
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

      await harness.workspace.close(randomUUID(), foreign.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      await expect(
        generation.create(
          randomUUID(),
          ideaRunInput(project.projectId, 'scene', randomUUID(), chapter.id),
        ),
      ).rejects.toMatchObject({ code: 'GENERATION_BASE_CONFLICT' });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
