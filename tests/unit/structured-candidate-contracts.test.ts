import {
  CandidateDocumentSchema,
  CandidateSummarySchema,
  GenerationIntentSchema,
  RewriteSelectionAnchorSchema,
  SkeletonCandidateDocumentSchema,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

const id = (suffix: string): string => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const hash = (value: string): string => value.repeat(64).slice(0, 64);
const common = {
  candidateId: id('1'),
  projectId: id('2'),
  chapterId: id('3'),
  generationRunId: id('4'),
  baseDraftId: id('5'),
  baseDraftRevision: 1,
  completeness: 'complete' as const,
  status: 'pending' as const,
  title: '雨夜抉择',
  sourceVersionId: null,
  contentHash: hash('a'),
  createdAt: '2026-07-26T00:00:00.000Z',
  resolvedAt: null,
};
const payload = {
  titleSuggestion: '渡口',
  tendency: '压迫',
  beats: [
    {
      beatId: 'beat-1',
      order: 1,
      event: '人物抵达渡口',
      cause: '追兵逼近',
      consequence: '必须立刻选择',
      informationReleased: ['船夫认识主角'],
      characterIntentions: [{ characterId: 'character-1', intention: '隐瞒身份' }],
    },
  ],
  endingHook: '远处出现第二盏灯',
  risks: ['地点连续性'],
};

describe('M4-04 structured Candidate contracts', () => {
  it('keeps Skeleton and Prose documents mutually exclusive', () => {
    const skeleton = SkeletonCandidateDocumentSchema.parse({
      ...common,
      candidateType: 'skeleton',
      blockCount: 0,
      skeletonRevisionId: id('6'),
      skeletonRevision: 1,
      payloadSchemaVersion: 1,
      structuredPayload: payload,
      payloadHash: hash('b'),
      sourceState: 'current',
      parentSkeletonRevisionId: null,
      editedBy: 'ai',
    });
    expect(CandidateDocumentSchema.parse(skeleton)).toEqual(skeleton);
    expect(CandidateDocumentSchema.safeParse({ ...skeleton, blocks: [] }).success).toBe(false);
    expect(
      CandidateDocumentSchema.safeParse({
        ...common,
        candidateType: 'full',
        blockCount: 0,
        blocks: [],
      }).success,
    ).toBe(false);
    const { structuredPayload: _structuredPayload, ...summary } = skeleton;
    expect(CandidateSummarySchema.parse(summary)).not.toHaveProperty('structuredPayload');
  });

  it('requires one authoritative T1 source and an explicit stale-source acknowledgement', () => {
    expect(
      GenerationIntentSchema.parse({
        runType: 'chapter',
        source: {
          sourceType: 'skeleton_candidate',
          selectedSkeletonCandidateId: id('1'),
          acknowledgeStaleSource: true,
        },
        targetLanguage: 'zh-CN',
        targetCharacters: 3_000,
        styleInstructions: [],
      }),
    ).toMatchObject({ source: { sourceType: 'skeleton_candidate' } });
    expect(
      GenerationIntentSchema.safeParse({
        runType: 'chapter',
        source: {
          sourceType: 'canonical_scene_beats',
          sceneBeatIds: [id('2')],
          chapterGoal: '不得混入第二来源',
        },
        targetCharacters: 3_000,
      }).success,
    ).toBe(false);
  });

  it('validates precise rewrite anchors and discriminated merge mappings', () => {
    expect(
      RewriteSelectionAnchorSchema.parse({
        projectId: id('1'),
        chapterId: id('2'),
        draftId: id('3'),
        baseRevision: 2,
        logicalBlockId: id('4'),
        expectedBlockHash: hash('c'),
        selectionStart: 1,
        selectionEnd: 3,
        selectedTextHash: hash('d'),
      }),
    ).toMatchObject({ selectionStart: 1, selectionEnd: 3 });
    expect(
      GenerationIntentSchema.safeParse({
        runType: 'merge',
        mapping: {
          mappingType: 'segment',
          units: [
            {
              segmentId: id('5'),
              sourceType: 'candidate',
              candidateId: id('6'),
              sourceBlockIds: [id('7')],
              order: 1,
            },
            {
              segmentId: id('8'),
              sourceType: 'current_draft',
              sourceBlockIds: [id('9')],
              order: 2,
            },
          ],
        },
      }).success,
    ).toBe(true);
  });
});
