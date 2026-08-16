import { createHash, randomUUID } from 'node:crypto';

import type { MergeSourceMapping } from '@worldforge/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  GenerationSourceResolver,
  type GenerationSourceResolverError,
} from '../../packages/core-service/src/generation-source-resolver.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import { contractInput } from '../testkit/strict-test-doubles.js';
import {
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

const hash = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

function errorCode(code: GenerationSourceResolverError['code']) {
  return expect.objectContaining<Partial<GenerationSourceResolverError>>({ code });
}

afterEach(cleanupCandidateApplyDirectories);

describe('GenerationSourceResolver extra coverage', () => {
  it('covers empty skeleton input, direct chapter goal and rewrite stale/locked/block paths', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);

      expect(
        resolver.resolveSkeleton(project.projectId, chapter.id, [], '继续推进'),
      ).toMatchObject({
        requiredBeats: [],
        inputSources: [{ sourceType: 'chapter_goal', sourceId: chapter.id }],
      });
      expect(
        resolver.resolveChapter(project.projectId, chapter.id, {
          sourceType: 'direct_chapter_goal',
          chapterGoal: '直接章节目标',
        }),
      ).toMatchObject({
        source: { sourceType: 'direct_chapter_goal', chapterGoal: '直接章节目标' },
        inputSources: [{ sourceType: 'chapter_goal', sourceId: chapter.id }],
      });
      expect(() =>
        resolver.resolveChapter(project.projectId, chapter.id, {
          sourceType: 'canonical_scene_beats',
          sceneBeatIds: [randomUUID()],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision + 1, {
          scopeType: 'blocks',
          logicalBlockIds: [draft.blocks[0]!.logicalBlockId],
          expectedBlockHashes: [draft.blocks[0]!.contentHash!],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_STALE'));

      const selectionText = draft.blocks[0]!.text.slice(0, 2);
      const baseAnchor = {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        logicalBlockId: draft.blocks[0]!.logicalBlockId,
        expectedBlockHash: draft.blocks[0]!.contentHash!,
        selectionStart: 0,
        selectionEnd: 2,
        selectedTextHash: hash(selectionText),
      };
      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'selection',
          anchor: { ...baseAnchor, projectId: randomUUID() },
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_STALE'));
      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'selection',
          anchor: { ...baseAnchor, logicalBlockId: randomUUID() },
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_STALE'));

      const structural = resolver.resolveRewrite(
        project.projectId,
        chapter.id,
        draft.draftId,
        draft.revision,
        {
          scopeType: 'blocks',
          logicalBlockIds: draft.blocks.map((block) => block.logicalBlockId),
          expectedBlockHashes: draft.blocks.map((block) => block.contentHash!),
        },
      );
      expect(structural.sourceText).toBe(draft.blocks.map((block) => block.text).join('\n\n'));
      expect(() => structural.buildBlocks(' \n\n ')).toThrowError(
        errorCode('GENERATION_SOURCE_INVALID'),
      );
      const rebuilt = structural.buildBlocks('第一替代\n\n第二替代');
      expect(rebuilt.map((block) => block.text)).toEqual(['第一替代', '第二替代']);
      expect(rebuilt[0]!.logicalBlockId).toBe(draft.blocks[0]!.logicalBlockId);
      expect(rebuilt[1]!.sourceLogicalBlockIds).toEqual(
        draft.blocks.map((block) => block.logicalBlockId),
      );

      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'blocks',
          logicalBlockIds: [draft.blocks[0]!.logicalBlockId],
          expectedBlockHashes: ['0'.repeat(64)],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_STALE'));

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE draft_blocks SET locked = 1 WHERE draft_id = ? AND logical_block_id = ?')
          .run(draft.draftId, draft.blocks[0]!.logicalBlockId);
      });
      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'selection',
          anchor: baseAnchor,
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_LOCKED'));
      expect(() =>
        resolver.resolveRewrite(project.projectId, chapter.id, draft.draftId, draft.revision, {
          scopeType: 'blocks',
          logicalBlockIds: [draft.blocks[0]!.logicalBlockId],
          expectedBlockHashes: [draft.blocks[0]!.contentHash!],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_LOCKED'));
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('covers Unicode rewrite boundaries and draft source integrity fallbacks', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const emojiDraft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            expectedHash: draft.blocks[0]!.contentHash!,
            content: 'A😀B',
          },
        ],
      });
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);
      const block = emojiDraft.blocks[0]!;
      const anchorBase = {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: emojiDraft.draftId,
        baseRevision: emojiDraft.revision,
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash!,
        selectedTextHash: hash('😀'),
      };
      expect(() =>
        resolver.resolveRewrite(
          project.projectId,
          chapter.id,
          emojiDraft.draftId,
          emojiDraft.revision,
          {
            scopeType: 'selection',
            anchor: { ...anchorBase, selectionStart: 1, selectionEnd: 2 },
          },
        ),
      ).toThrowError(errorCode('GENERATION_SOURCE_INVALID'));
      expect(() =>
        resolver.resolveRewrite(
          project.projectId,
          chapter.id,
          emojiDraft.draftId,
          emojiDraft.revision,
          {
            scopeType: 'selection',
            anchor: { ...anchorBase, selectionStart: 2, selectionEnd: 4 },
          },
        ),
      ).toThrowError(errorCode('GENERATION_SOURCE_INVALID'));

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE draft_blocks SET content_hash = NULL WHERE draft_id = ?')
          .run(emojiDraft.draftId);
      });
      expect(
        resolver.resolveRewrite(
          project.projectId,
          chapter.id,
          emojiDraft.draftId,
          emojiDraft.revision,
          {
            scopeType: 'blocks',
            logicalBlockIds: [block.logicalBlockId],
            expectedBlockHashes: [block.contentHash!],
          },
        ).sourceText,
      ).toBe('A😀B');
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('covers current-draft and candidate merge validation branches', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);
      const firstBlock = draft.blocks[0]!;
      const secondBlock = draft.blocks[1]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'full',
        completeness: 'complete',
        title: '候选来源',
        blocks: [
          {
            logicalBlockId: firstBlock.logicalBlockId,
            blockType: 'paragraph',
            text: '候选正文',
            attributes: {},
          },
        ],
      });

      const merged = resolver.resolveMerge(project.projectId, chapter.id, {
        mappingType: 'segment',
        units: [
          {
            segmentId: randomUUID(),
            sourceType: 'current_draft',
            sourceBlockIds: [secondBlock.logicalBlockId],
            order: 2,
          },
          {
            segmentId: randomUUID(),
            sourceType: 'candidate',
            candidateId: candidate.candidateId,
            sourceBlockIds: [candidate.blocks[0]!.candidateBlockId],
            order: 1,
          },
        ],
      });
      expect(merged.sources.map((source) => source.text)).toEqual([
        '候选正文',
        secondBlock.text,
      ]);
      expect(merged.inputSources.map((source) => source.sourceType)).toEqual([
        'candidate',
        'current_draft',
      ]);

      const currentRange = {
        logicalBlockId: firstBlock.logicalBlockId,
        expectedBlockHash: firstBlock.contentHash!,
        selectionStart: 0,
        selectionEnd: 2,
        selectedTextHash: hash(firstBlock.text.slice(0, 2)),
      };
      expect(
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [firstBlock.logicalBlockId],
              order: 1,
              rangeAnchor: currentRange,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 2,
            },
          ],
        }).sources[0]!.text,
      ).toBe(firstBlock.text.slice(0, 2));

      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [randomUUID()],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [firstBlock.logicalBlockId, secondBlock.logicalBlockId],
              order: 1,
              rangeAnchor: currentRange,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: candidate.candidateId,
              sourceBlockIds: [candidate.blocks[0]!.candidateBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_INVALID'));

      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 1,
              rangeAnchor: currentRange,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: candidate.candidateId,
              sourceBlockIds: [candidate.blocks[0]!.candidateBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: candidate.candidateId,
              sourceBlockIds: [randomUUID()],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      const candidateWrongAnchor = {
        logicalBlockId: randomUUID(),
        expectedBlockHash: candidate.blocks[0]!.contentHash,
        selectionStart: 0,
        selectionEnd: 2,
        selectedTextHash: hash('候选'),
      };
      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: candidate.candidateId,
              sourceBlockIds: [candidate.blocks[0]!.candidateBlockId],
              order: 1,
              rangeAnchor: candidateWrongAnchor,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      await harness.candidates.discard(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      });
      expect(() =>
        resolver.resolveMerge(project.projectId, chapter.id, {
          mappingType: 'segment',
          units: [
            {
              segmentId: randomUUID(),
              sourceType: 'candidate',
              candidateId: candidate.candidateId,
              sourceBlockIds: [candidate.blocks[0]!.candidateBlockId],
              order: 1,
            },
            {
              segmentId: randomUUID(),
              sourceType: 'current_draft',
              sourceBlockIds: [secondBlock.logicalBlockId],
              order: 2,
            },
          ],
        }),
      ).toThrowError(errorCode('GENERATION_SOURCE_INVALID'));

      const oneUnit = contractInput<MergeSourceMapping>({
        mappingType: 'segment',
        units: [
          {
            segmentId: randomUUID(),
            sourceType: 'current_draft',
            sourceBlockIds: [firstBlock.logicalBlockId],
            order: 1,
          },
        ],
      });
      expect(() => resolver.resolveMerge(project.projectId, chapter.id, oneUnit)).toThrowError(
        errorCode('GENERATION_SOURCE_INVALID'),
      );
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('covers final Version missing, invalid and valid resolution', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const resolver = new GenerationSourceResolver(harness.workspace, harness.candidates);
      const versions = new VersionService(harness.workspace);

      expect(() =>
        resolver.resolveFinalVersion(project.projectId, chapter.id, randomUUID()),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      const version = await versions.create(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '最终来源',
      });
      expect(() =>
        resolver.resolveFinalVersion(project.projectId, chapter.id, version.versionId),
      ).toThrowError(errorCode('GENERATION_SOURCE_NOT_FOUND'));

      await versions.setFinal(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        versionId: version.versionId,
      });
      const resolved = resolver.resolveFinalVersion(
        project.projectId,
        chapter.id,
        version.versionId,
      );
      expect(resolved.versionId).toBe(version.versionId);
      expect(resolved.blocks).toHaveLength(2);
      expect(resolved.inputSources).toEqual([
        expect.objectContaining({
          sourceType: 'version',
          sourceId: version.versionId,
          metadata: { final: true, blockCount: 2 },
        }),
      ]);

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE version_blocks SET content_hash = ? WHERE version_id = ? LIMIT 1')
          .run('bad-hash', version.versionId);
      });
      expect(() =>
        resolver.resolveFinalVersion(project.projectId, chapter.id, version.versionId),
      ).toThrowError(errorCode('GENERATION_SOURCE_INVALID'));
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
