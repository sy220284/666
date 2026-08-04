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

describe('M10-07 Candidate Undo invariants', () => {
  it('rolls back Draft and Patch Log when the ApplyRecord transition affects no row', async () => {
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
        title: '撤销状态断言',
        blocks: draft.blocks.map((block, index) => ({
          logicalBlockId: block.logicalBlockId,
          sourceLogicalBlockIds: [block.logicalBlockId],
          blockType: block.blockType,
          text: `候选段落${index + 1}`,
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

      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec(`
          CREATE TEMP TRIGGER m10_07_ignore_candidate_undo
          BEFORE UPDATE OF status ON candidate_apply_records
          WHEN OLD.id = '${applied.record.applyRecordId}' AND NEW.status = 'undone'
          BEGIN
            SELECT RAISE(IGNORE);
          END;
        `);
      });
      const beforeCounts = applyTableCounts(harness, project.projectId);
      const beforeUndo = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });

      await expect(
        harness.candidateApply.undo(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          applyRecordId: applied.record.applyRecordId,
          draftId: applied.draft.draftId,
          baseRevision: applied.draft.revision,
        }),
      ).rejects.toMatchObject({ code: 'CANDIDATE_APPLY_INVARIANT' });

      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(beforeUndo);
      expect(applyTableCounts(harness, project.projectId)).toEqual(beforeCounts);
      const record = harness.workspace.readProject(project.projectId, (database) =>
        database
          .prepare(
            `SELECT status, undone_revision AS undoneRevision, undone_at AS undoneAt
               FROM candidate_apply_records WHERE id = ?`,
          )
          .get(applied.record.applyRecordId) as {
          status: string;
          undoneRevision: number | bigint | null;
          undoneAt: string | null;
        },
      );
      expect(record).toEqual({ status: 'applied', undoneRevision: null, undoneAt: null });
    } finally {
      await closeCandidateApplyHarness(harness);
    }
  });
});
