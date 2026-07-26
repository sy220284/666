import { createHash, randomUUID } from 'node:crypto';

import { ConstraintPackageSchema } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { GenerationRunService } from '../../packages/core-service/src/generation-run.js';
import {
  GenerationSourceResolver,
  type GenerationSourceResolverError,
} from '../../packages/core-service/src/generation-source-resolver.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import {
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

const hash = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

afterEach(cleanupCandidateApplyDirectories);

function constraints(projectId: string, chapterId: string) {
  return ConstraintPackageSchema.parse({
    projectId,
    chapterId,
    taskType: 'skeleton',
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

describe('M4-04 authoritative generation source resolution', () => {
  it('resolves T0/T1, rewrite and segment merge only from persisted authority', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);
      const beats = new SceneBeatService(harness.workspace);
      const createdBeat = (
        await beats.create(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          plotNodeId: null,
          title: '渡口抉择',
          goal: '决定是否相信船夫',
          coreConflict: '追兵逼近',
          expectedResult: '主角登船',
          beatType: 'turn',
          wordTargetPercent: 40,
          required: true,
          characterIds: [],
          locationIds: [],
        })
      ).beats[0]!;
      expect(
        resolver.resolveSkeleton(project.projectId, chapter.id, [createdBeat.id], '完成夜渡'),
      ).toMatchObject({
        requiredBeats: [{ beatId: createdBeat.id }],
        inputSources: [
          { sourceType: 'chapter_goal' },
          { sourceType: 'scene_beat', sourceId: createdBeat.id },
        ],
      });
      expect(
        resolver.resolveChapter(project.projectId, chapter.id, {
          sourceType: 'canonical_scene_beats',
          sceneBeatIds: [createdBeat.id],
        }),
      ).toMatchObject({
        source: {
          sourceType: 'canonical_scene_beats',
          sceneBeatIds: [createdBeat.id],
        },
      });

      const selectedText = draft.blocks[0]!.text.slice(0, 2);
      const rewrite = resolver.resolveRewrite(
        project.projectId,
        chapter.id,
        draft.draftId,
        draft.revision,
        {
          scopeType: 'selection',
          anchor: {
            projectId: project.projectId,
            chapterId: chapter.id,
            draftId: draft.draftId,
            baseRevision: draft.revision,
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            expectedBlockHash: draft.blocks[0]!.contentHash!,
            selectionStart: 0,
            selectionEnd: 2,
            selectedTextHash: hash(selectedText),
          },
        },
      );
      expect(rewrite.sourceText).toBe(selectedText);
      expect(rewrite.buildBlocks('替换').map((block) => block.text)).toEqual([
        `替换${draft.blocks[0]!.text.slice(2)}`,
        draft.blocks[1]!.text,
      ]);
      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'selection',
          anchor: {
            projectId: project.projectId,
            chapterId: chapter.id,
            draftId: draft.draftId,
            baseRevision: draft.revision,
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            expectedBlockHash: draft.blocks[0]!.contentHash!,
            selectionStart: 0,
            selectionEnd: 2,
            selectedTextHash: '0'.repeat(64),
          },
        }),
      ).toThrowError(
        expect.objectContaining<Partial<GenerationSourceResolverError>>({
          code: 'GENERATION_SOURCE_STALE',
        }),
      );

      const first = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'full',
        completeness: 'complete',
        title: '第一稿',
        blocks: [
          {
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            blockType: 'paragraph',
            text: '第一来源',
            attributes: {},
          },
        ],
      });
      const second = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'full',
        completeness: 'complete',
        title: '第二稿',
        blocks: [
          {
            logicalBlockId: draft.blocks[1]!.logicalBlockId,
            blockType: 'paragraph',
            text: '第二来源',
            attributes: {},
          },
        ],
      });
      expect(
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: first.candidateId,
              sourceBlockIds: [first.blocks[0]!.candidateBlockId],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: second.candidateId,
              sourceBlockIds: [second.blocks[0]!.candidateBlockId],
              order: 2,
            },
          ],
        }),
      ).toMatchObject({
        sources: [
          { candidateId: first.candidateId, text: '第一来源' },
          { candidateId: second.candidateId, text: '第二来源' },
        ],
        sourceMappings: [{ mappingType: 'segment' }, { mappingType: 'segment' }],
      });
      const anchoredMerge = resolver.resolveMerge(project.projectId, chapter.id, {
        mappingType: 'segment',
        units: [
          {
            segmentId: randomUUID(),
            sourceType: 'candidate',
            candidateId: first.candidateId,
            sourceBlockIds: [first.blocks[0]!.candidateBlockId],
            order: 1,
            rangeAnchor: {
              logicalBlockId: first.blocks[0]!.logicalBlockId,
              expectedBlockHash: first.blocks[0]!.contentHash,
              selectionStart: 0,
              selectionEnd: 2,
              selectedTextHash: hash('第一'),
            },
          },
          {
            segmentId: randomUUID(),
            sourceType: 'candidate',
            candidateId: second.candidateId,
            sourceBlockIds: [second.blocks[0]!.candidateBlockId],
            order: 2,
          },
        ],
      });
      expect(anchoredMerge.sources[0]?.text).toBe('第一');
      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: first.candidateId,
              sourceBlockIds: [first.blocks[0]!.candidateBlockId],
              order: 1,
              rangeAnchor: {
                logicalBlockId: first.blocks[0]!.logicalBlockId,
                expectedBlockHash: first.blocks[0]!.contentHash,
                selectionStart: 0,
                selectionEnd: 2,
                selectedTextHash: '0'.repeat(64),
              },
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: second.candidateId,
              sourceBlockIds: [second.blocks[0]!.candidateBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<GenerationSourceResolverError>>({
          code: 'GENERATION_SOURCE_STALE',
        }),
      );
      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: first.candidateId,
              sourceBlockIds: [first.blocks[0]!.candidateBlockId],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: second.candidateId,
              sourceBlockIds: [second.blocks[0]!.candidateBlockId],
              order: 1,
            },
          ],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<GenerationSourceResolverError>>({
          code: 'GENERATION_SOURCE_INVALID',
        }),
      );
      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: first.candidateId,
              sourceBlockIds: [first.blocks[0]!.candidateBlockId],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: first.candidateId,
              sourceBlockIds: [first.blocks[0]!.candidateBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(
        expect.objectContaining<Partial<GenerationSourceResolverError>>({
          code: 'GENERATION_SOURCE_INVALID',
        }),
      );

      const generation = new GenerationRunService(harness.workspace);
      const run = await generation.create(randomUUID(), {
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
        constraintPackage: constraints(project.projectId, chapter.id),
      });
      await generation.markRunning(randomUUID(), {
        projectId: project.projectId,
        runId: run.runId,
      });
      const skeleton = (
        await generation.completeSkeletonCandidates(randomUUID(), {
          projectId: project.projectId,
          runId: run.runId,
          candidates: [
            {
              title: '选定骨架',
              structuredPayload: {
                tendency: '悬疑',
                beats: [
                  {
                    beatId: createdBeat.id,
                    order: 1,
                    event: '决定登船',
                    cause: '追兵逼近',
                    consequence: '离开渡口',
                    informationReleased: [],
                    characterIntentions: [],
                  },
                ],
                endingHook: '船底传来敲击声',
                risks: [],
              },
            },
          ],
        })
      ).candidates[0]!;
      expect(
        resolver.resolveChapter(project.projectId, chapter.id, {
          sourceType: 'skeleton_candidate',
          selectedSkeletonCandidateId: skeleton.candidateId,
          acknowledgeStaleSource: false,
        }),
      ).toMatchObject({
        source: {
          sourceType: 'skeleton_candidate',
          selectedSkeletonCandidateId: skeleton.candidateId,
        },
      });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
