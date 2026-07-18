import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTableCounts,
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';

afterEach(cleanupCandidateApplyDirectories);

describe('M2-03 Candidate action transaction', () => {
  it.each(['all', 'blocks', 'scene-beats'] as const)(
    'commits %s selection with one Revision, Checkpoint and ApplyRecord',
    async (mode) => {
      const harness = await createCandidateApplyHarness();
      try {
        const { project, chapter, draft } = await createTwoBlockDraft(harness);
        const [first, second] = draft.blocks;
        const firstBeatId = randomUUID();
        const secondBeatId = randomUUID();
        const candidate = await harness.candidates.createFixture(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseDraftRevision: draft.revision,
          candidateType: 'rewrite',
          completeness: 'complete',
          title: `采用-${mode}`,
          blocks: [
            {
              logicalBlockId: first!.logicalBlockId,
              sourceLogicalBlockIds: [first!.logicalBlockId],
              blockType: first!.blockType,
              text: '候选第一段',
              attributes: first!.attributes,
              beatId: firstBeatId,
              sourceBlockHash: first!.contentHash,
            },
            {
              logicalBlockId: second!.logicalBlockId,
              sourceLogicalBlockIds: [second!.logicalBlockId],
              blockType: second!.blockType,
              text: '候选第二段',
              attributes: second!.attributes,
              beatId: secondBeatId,
              sourceBlockHash: second!.contentHash,
            },
          ],
        });
        const selection =
          mode === 'all'
            ? ({ mode: 'all' } as const)
            : mode === 'blocks'
              ? ({
                  mode: 'blocks',
                  candidateBlockIds: [candidate.blocks[0]!.candidateBlockId],
                  deleteLogicalBlockIds: [],
                } as const)
              : ({ mode: 'scene-beats', beatIds: [secondBeatId], deleteLogicalBlockIds: [] } as const);
        const beforeCounts = applyTableCounts(harness, project.projectId);

        const result = await harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          selection,
        });

        expect(result.outcome).toBe('applied');
        if (result.outcome !== 'applied') throw new Error('EXPECTED_APPLIED_OUTCOME');
        expect(result.draft.revision).toBe(draft.revision + 1);
        expect(result.record).toMatchObject({
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          committedRevision: draft.revision + 1,
          selection,
          status: 'applied',
        });
        expect(result.checkpoint).toMatchObject({
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          sourceRevision: draft.revision,
        });
        expect(result.draft.blocks.map((block) => block.text)).toEqual(
          mode === 'all'
            ? ['候选第一段', '候选第二段']
            : mode === 'blocks'
              ? ['候选第一段', '当前第二段']
              : ['当前第一段', '候选第二段'],
        );
        expect(harness.candidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }).status).toBe('accepted');
        expect(applyTableCounts(harness, project.projectId)).toEqual({
          patchLog: beforeCounts.patchLog + 1,
          checkpoints: 1,
          records: 1,
          conflicts: 0,
        });

        const duplicate = await harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: result.draft.revision,
          selection,
        });
        expect(duplicate.outcome).toBe('conflict');
        if (duplicate.outcome !== 'conflict') throw new Error('EXPECTED_CONFLICT_OUTCOME');
        expect(duplicate.conflictSet.conflicts.map((conflict) => conflict.kind)).toEqual(
          expect.arrayContaining(['duplicate-apply', 'candidate-status', 'revision']),
        );
        expect(applyTableCounts(harness, project.projectId)).toEqual({
          patchLog: beforeCounts.patchLog + 1,
          checkpoints: 1,
          records: 1,
          conflicts: 1,
        });
      } finally {
        await closeCandidateApplyHarness(harness);
      }
    },
  );

  it('persists locked, Revision and Hash conflicts without changing Draft content', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const first = draft.blocks[0]!;
      const lockedDraft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: first.logicalBlockId,
            expectedHash: first.contentHash!,
            locked: true,
          },
        ],
      });
      const locked = lockedDraft.blocks[0]!;
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: lockedDraft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '锁定冲突',
        blocks: [
          {
            logicalBlockId: locked.logicalBlockId,
            sourceLogicalBlockIds: [locked.logicalBlockId],
            blockType: locked.blockType,
            text: '禁止覆盖锁定块',
            attributes: locked.attributes,
            sourceBlockHash: locked.contentHash,
          },
          {
            logicalBlockId: lockedDraft.blocks[1]!.logicalBlockId,
            sourceLogicalBlockIds: [lockedDraft.blocks[1]!.logicalBlockId],
            blockType: lockedDraft.blocks[1]!.blockType,
            text: lockedDraft.blocks[1]!.text,
            attributes: lockedDraft.blocks[1]!.attributes,
            sourceBlockHash: lockedDraft.blocks[1]!.contentHash,
          },
        ],
      });

      const lockedConflict = await harness.candidateApply.apply(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: lockedDraft.revision,
        selection: { mode: 'all' },
      });
      expect(lockedConflict.outcome).toBe('conflict');
      if (lockedConflict.outcome !== 'conflict') throw new Error('EXPECTED_LOCKED_CONFLICT');
      expect(lockedConflict.conflictSet.conflicts.map((conflict) => conflict.kind)).toContain(
        'locked',
      );

      const changed = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: lockedDraft.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: locked.logicalBlockId,
            expectedHash: locked.contentHash!,
            locked: false,
          },
          {
            type: 'update',
            logicalBlockId: locked.logicalBlockId,
            expectedHash: locked.contentHash!,
            content: '人工后续修改',
          },
        ],
      });
      const stale = await harness.candidateApply.apply(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: lockedDraft.revision,
        selection: { mode: 'all' },
      });
      expect(stale.outcome).toBe('conflict');
      if (stale.outcome !== 'conflict') throw new Error('EXPECTED_STALE_CONFLICT');
      expect(stale.conflictSet.conflicts.map((conflict) => conflict.kind)).toEqual(
        expect.arrayContaining(['revision', 'hash']),
      );
      expect((await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      })).blocks[0]).toMatchObject({ text: '人工后续修改', locked: false });
      expect(changed.revision).toBe(lockedDraft.revision + 1);
      expect(harness.candidates.get({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      }).status).toBe('pending');
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rolls back Checkpoint, Draft, PatchLog and Candidate status on injected failure', async () => {
    const harness = await createCandidateApplyHarness({
      faultInjector: (stage) => {
        if (stage === 'after-draft-persist') throw new Error('INJECTED_APPLY_FAILURE');
      },
    });
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '故障回滚',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `故障候选${index + 1}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const beforeCounts = applyTableCounts(harness, project.projectId);

      await expect(
        harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          selection: { mode: 'all' },
        }),
      ).rejects.toThrow('INJECTED_APPLY_FAILURE');

      const current = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(current).toMatchObject({ revision: draft.revision });
      expect(current.blocks.map((block) => block.text)).toEqual(['当前第一段', '当前第二段']);
      expect(harness.candidates.get({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      }).status).toBe('pending');
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
