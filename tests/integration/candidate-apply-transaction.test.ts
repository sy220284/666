import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  applyTableCounts,
  cleanupCandidateApplyDirectories,
  closeCandidateApplyHarness,
  createCandidateApplyHarness,
  createTwoBlockDraft,
} from './candidate-apply-fixture.js';
import { draftContentHash } from '../../packages/core-service/src/draft.js';

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
              : ({
                  mode: 'scene-beats',
                  beatIds: [secondBeatId],
                  deleteLogicalBlockIds: [],
                } as const);
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
        expect(
          harness.candidates.get({
            projectId: project.projectId,
            chapterId: chapter.id,
            candidateId: candidate.candidateId,
          }).status,
        ).toBe('accepted');
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

  it.each(['blocks', 'scene-beats'] as const)(
    'persists a structure conflict for a %s selection that does not belong to the Candidate',
    async (mode) => {
      const harness = await createCandidateApplyHarness();
      try {
        const { project, chapter, draft } = await createTwoBlockDraft(harness);
        const beatId = randomUUID();
        const candidate = await harness.candidates.createFixture(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseDraftRevision: draft.revision,
          candidateType: 'rewrite',
          completeness: 'complete',
          title: '非法选择',
          blocks: draft.blocks.map((block) => ({
            logicalBlockId: block.logicalBlockId,
            sourceLogicalBlockIds: [block.logicalBlockId],
            blockType: block.blockType,
            text: `候选-${block.text}`,
            attributes: block.attributes,
            beatId,
            sourceBlockHash: block.contentHash,
          })),
        });
        const beforeCounts = applyTableCounts(harness, project.projectId);
        const selection =
          mode === 'blocks'
            ? ({
                mode,
                candidateBlockIds: [randomUUID()],
                deleteLogicalBlockIds: [],
              } as const)
            : ({ mode, beatIds: [randomUUID()], deleteLogicalBlockIds: [] } as const);

        const result = await harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          selection,
        });

        expect(result).toMatchObject({
          outcome: 'conflict',
          conflictSet: { conflicts: [{ kind: 'structure' }] },
        });
        await expect(
          harness.drafts.open(randomUUID(), {
            projectId: project.projectId,
            chapterId: chapter.id,
          }),
        ).resolves.toEqual(draft);
        expect(
          harness.candidates.get({
            projectId: project.projectId,
            chapterId: chapter.id,
            candidateId: candidate.candidateId,
          }).status,
        ).toBe('pending');
        expect(applyTableCounts(harness, project.projectId)).toEqual({
          ...beforeCounts,
          conflicts: beforeCounts.conflicts + 1,
        });
      } finally {
        await closeCandidateApplyHarness(harness);
      }
    },
  );

  it('replays the original Apply result after restart without changing a later Draft revision', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '采用结果重放',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `重放候选${index + 1}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const requestId = randomUUID();
      const input = {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        selection: { mode: 'all' as const },
      };
      const applied = await harness.candidateApply.apply(requestId, input);
      if (applied.outcome !== 'applied') throw new Error('EXPECTED_APPLIED_OUTCOME');
      const first = applied.draft.blocks[0]!;
      const evolved = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: applied.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: first.logicalBlockId,
            expectedHash: first.contentHash!,
            content: '采用后的后续编辑',
          },
        ],
      });
      const beforeReplay = applyTableCounts(harness, project.projectId);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      await expect(harness.candidateApply.apply(requestId, input)).resolves.toEqual(applied);
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(evolved);
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeReplay);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

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
      expect(
        (
          await harness.drafts.open(randomUUID(), {
            projectId: project.projectId,
            chapterId: chapter.id,
          })
        ).blocks[0],
      ).toMatchObject({ text: '人工后续修改', locked: false });
      expect(changed.revision).toBe(lockedDraft.revision + 1);
      expect(
        harness.candidates.get({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }).status,
      ).toBe('pending');
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it.each(['after-checkpoint', 'after-draft-persist', 'before-commit'] as const)(
    'rolls back Checkpoint, Draft, PatchLog and Candidate status on %s failure',
    async (failureStage) => {
      const harness = await createCandidateApplyHarness({
        faultInjector: (stage) => {
          if (stage === failureStage) throw new Error('INJECTED_APPLY_FAILURE');
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
        expect(
          harness.candidates.get({
            projectId: project.projectId,
            chapterId: chapter.id,
            candidateId: candidate.candidateId,
          }).status,
        ).toBe('pending');
        expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
      } finally {
        await closeCandidateApplyHarness(harness);
      }
    },
  );

  it('rejects Candidate hash drift before Apply without changing the Draft', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '损坏候选',
        blocks: draft.blocks.map((block) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `候选-${block.text}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE candidate_blocks SET text = ? WHERE id = ?')
          .run('未重算哈希的篡改', candidate.blocks[0]!.candidateBlockId);
      });
      const beforeCounts = applyTableCounts(harness, project.projectId);

      expect(() =>
        harness.candidateApply.preview({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).toThrow('content hashes do not match');
      await expect(
        harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          selection: { mode: 'all' },
        }),
      ).rejects.toMatchObject({ code: 'CANDIDATE_APPLY_INVARIANT' });

      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(draft);
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          database.prepare('SELECT status FROM candidates WHERE id = ?').get(candidate.candidateId),
        ),
      ).toMatchObject({ status: 'pending' });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rejects Draft hash drift before Preview or Apply without creating action records', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '正文哈希漂移',
        blocks: draft.blocks.map((block) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `候选-${block.text}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const beforeCounts = applyTableCounts(harness, project.projectId);
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE draft_blocks SET text = ? WHERE draft_id = ? AND logical_block_id = ?')
          .run('未重算哈希的正文篡改', draft.draftId, draft.blocks[0]!.logicalBlockId);
      });

      expect(() =>
        harness.candidateApply.preview({
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
        }),
      ).toThrow('content hash does not match');
      await expect(
        harness.candidateApply.apply(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          candidateId: candidate.candidateId,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          selection: { mode: 'all' },
        }),
      ).rejects.toMatchObject({ code: 'CANDIDATE_APPLY_INVARIANT' });
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          database.prepare('SELECT status FROM candidates WHERE id = ?').get(candidate.candidateId),
        ),
      ).toMatchObject({ status: 'pending' });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('finds an ApplyRecord after restart and restores the pre-apply Draft as a new Revision', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '持久化撤销',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `候选持久化${index + 1}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const applied = await harness.candidateApply.apply(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        selection: { mode: 'all' },
      });
      if (applied.outcome !== 'applied') throw new Error('EXPECTED_APPLIED_OUTCOME');

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      const lookup = harness.candidateApply.findUndoRecord({
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
      });
      expect(lookup.applyRecordId).toBe(applied.record.applyRecordId);
      const preview = harness.candidateApply.previewUndo({
        projectId: project.projectId,
        chapterId: chapter.id,
        applyRecordId: lookup.applyRecordId,
      });
      expect(preview).toMatchObject({ canUndo: true, conflictSet: null });
      expect(preview.restoredBlocks.map((block) => block.text)).toEqual([
        '当前第一段',
        '当前第二段',
      ]);

      const undoRequestId = randomUUID();
      const undoInput = {
        projectId: project.projectId,
        chapterId: chapter.id,
        applyRecordId: lookup.applyRecordId,
        draftId: draft.draftId,
        baseRevision: applied.draft.revision,
      };
      const undone = await harness.candidateApply.undo(undoRequestId, undoInput);
      if (undone.outcome !== 'undone') throw new Error('EXPECTED_UNDONE_OUTCOME');
      expect(undone.record).toMatchObject({
        status: 'undone',
        undoneRevision: applied.draft.revision + 1,
      });
      expect(undone.draft).toMatchObject({ revision: applied.draft.revision + 1 });
      expect(undone.draft.blocks.map((block) => block.text)).toEqual(['当前第一段', '当前第二段']);
      const repeatedPreview = harness.candidateApply.previewUndo({
        projectId: project.projectId,
        chapterId: chapter.id,
        applyRecordId: lookup.applyRecordId,
      });
      expect(repeatedPreview.canUndo).toBe(false);
      expect(repeatedPreview.conflictSet?.conflicts.map((conflict) => conflict.kind)).toEqual(
        expect.arrayContaining(['undo-stale']),
      );

      const restoredFirst = undone.draft.blocks[0]!;
      const evolved = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: undone.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: restoredFirst.logicalBlockId,
            expectedHash: restoredFirst.contentHash!,
            content: '撤销后的后续编辑',
          },
        ],
      });
      const beforeReplay = applyTableCounts(harness, project.projectId);
      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });

      await expect(harness.candidateApply.undo(undoRequestId, undoInput)).resolves.toEqual(undone);
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(evolved);
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeReplay);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('persists undo-stale conflicts instead of overwriting edits made after apply', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '过期撤销',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `候选修改${index + 1}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const applied = await harness.candidateApply.apply(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        selection: { mode: 'all' },
      });
      if (applied.outcome !== 'applied') throw new Error('EXPECTED_APPLIED_OUTCOME');
      const first = applied.draft.blocks[0]!;
      const evolved = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: applied.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: first.logicalBlockId,
            expectedHash: first.contentHash!,
            content: '采用后的人工编辑',
          },
        ],
      });

      const result = await harness.candidateApply.undo(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        applyRecordId: applied.record.applyRecordId,
        draftId: draft.draftId,
        baseRevision: evolved.revision,
      });
      expect(result).toMatchObject({
        outcome: 'conflict',
        conflictSet: { conflicts: [{ kind: 'undo-stale' }] },
      });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(evolved);
      expect(applyTableCounts(harness, project.projectId).conflicts).toBe(1);
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });

  it('rejects corrupted Undo snapshots without mutating the applied Draft', async () => {
    const harness = await createCandidateApplyHarness();
    try {
      const { project, chapter, draft } = await createTwoBlockDraft(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseDraftRevision: draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '损坏撤销点',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `已采用内容${index + 1}`,
          attributes: block.attributes,
          sourceBlockHash: block.contentHash,
        })),
      });
      const applied = await harness.candidateApply.apply(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        candidateId: candidate.candidateId,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        selection: { mode: 'all' },
      });
      if (applied.outcome !== 'applied') throw new Error('EXPECTED_APPLIED_OUTCOME');
      const beforeCounts = applyTableCounts(harness, project.projectId);

      const checkpointBlocksJson = await harness.workspace.writeProject(
        randomUUID(),
        project.projectId,
        (database) => {
          const row = database
            .prepare(
              'SELECT blocks_json AS blocksJson FROM candidate_apply_checkpoints WHERE id = ?',
            )
            .get(applied.checkpoint.checkpointId) as { readonly blocksJson: string };
          const blocks = JSON.parse(row.blocksJson) as Array<Record<string, unknown>>;
          const original = draft.blocks[0]!;
          const corruptedText = '损坏的撤销快照';
          blocks[0] = {
            ...blocks[0],
            text: corruptedText,
            contentHash: draftContentHash({
              blockType: original.blockType,
              content: corruptedText,
              attributes: original.attributes,
            }),
          };
          database
            .prepare('UPDATE candidate_apply_checkpoints SET blocks_json = ? WHERE id = ?')
            .run(JSON.stringify(blocks), applied.checkpoint.checkpointId);
          return row.blocksJson;
        },
      );

      expect(() =>
        harness.candidateApply.previewUndo({
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
        }),
      ).toThrow('checkpoint content hash does not match');
      await expect(
        harness.candidateApply.undo(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
          draftId: draft.draftId,
          baseRevision: applied.draft.revision,
        }),
      ).rejects.toMatchObject({ code: 'CANDIDATE_APPLY_INVARIANT' });

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE candidate_apply_checkpoints SET blocks_json = ? WHERE id = ?')
          .run(checkpointBlocksJson, applied.checkpoint.checkpointId);
        const row = database
          .prepare(
            'SELECT applied_blocks_json AS blocksJson FROM candidate_apply_records WHERE id = ?',
          )
          .get(applied.record.applyRecordId) as { readonly blocksJson: string };
        const blocks = JSON.parse(row.blocksJson) as Array<Record<string, unknown>>;
        blocks[0] = { ...blocks[0], text: '未重算哈希的采用后快照' };
        database
          .prepare('UPDATE candidate_apply_records SET applied_blocks_json = ? WHERE id = ?')
          .run(JSON.stringify(blocks), applied.record.applyRecordId);
      });
      expect(() =>
        harness.candidateApply.previewUndo({
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
        }),
      ).toThrow('persisted Draft snapshot is invalid');

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare('UPDATE candidate_apply_records SET applied_blocks_json = ? WHERE id = ?')
          .run('{not-json', applied.record.applyRecordId);
      });
      expect(() =>
        harness.candidateApply.previewUndo({
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
        }),
      ).toThrow('persisted Draft snapshot is invalid');
      await expect(
        harness.candidateApply.undo(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
          draftId: draft.draftId,
          baseRevision: applied.draft.revision,
        }),
      ).rejects.toMatchObject({ code: 'CANDIDATE_APPLY_INVARIANT' });

      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(applied.draft);
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
      expect(
        harness.workspace.readProject(project.projectId, (database) =>
          database
            .prepare('SELECT status FROM candidate_apply_records WHERE id = ?')
            .get(applied.record.applyRecordId),
        ),
      ).toMatchObject({ status: 'applied' });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
