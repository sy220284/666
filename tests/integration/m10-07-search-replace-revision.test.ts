import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { SearchToolsService } from '../../packages/core-service/src/search-tools.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M10-07 safe replacement block revisions', () => {
  it('advances only matched blocks and keeps database and Patch audit revisions aligned', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const initial = seeded.draft.blocks[0]!;
      let draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            content: '旧名只在这里',
          },
          {
            type: 'insert',
            afterLogicalBlockId: initial.logicalBlockId,
            block: { blockType: 'paragraph', content: '第二块保持', attributes: {} },
          },
          {
            type: 'insert',
            afterLogicalBlockId: initial.logicalBlockId,
            block: { blockType: 'paragraph', content: '第三块保持', attributes: {} },
          },
        ],
      });
      const second = draft.blocks.find((block) => block.text === '第二块保持')!;
      draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: second.logicalBlockId,
            expectedHash: second.contentHash!,
            content: '第二块已单独修改',
          },
        ],
      });

      const before = harness.workspace.readProject(
        seeded.project.projectId,
        (database) =>
          database
            .prepare(
              `SELECT logical_block_id AS logicalBlockId, revision
               FROM draft_blocks WHERE draft_id = ? ORDER BY order_key, id`,
            )
            .all(draft.draftId) as Array<{ logicalBlockId: string; revision: number | bigint }>,
      );
      const beforeById = new Map(
        before.map((row) => [row.logicalBlockId, Number(row.revision)] as const),
      );

      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: path.join(harness.parent, 'm10-07-replace-backups'),
        clock: hardeningClock,
      });
      const tools = new SearchToolsService(harness.workspace, recovery, () => randomUUID(), {
        clock: hardeningClock,
      });
      const plan = await tools.previewReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        query: '旧名',
        replacement: '新名',
        matchCase: true,
        maxMatches: 100,
      });
      const applied = await tools.applyReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        planId: plan.planId,
      });
      expect(applied.changedDrafts).toEqual([
        expect.objectContaining({
          draftId: draft.draftId,
          previousRevision: draft.revision,
          committedRevision: draft.revision + 1,
          replacementCount: 1,
        }),
      ]);

      const persisted = harness.workspace.readProject(seeded.project.projectId, (database) => {
        const rows = database
          .prepare(
            `SELECT logical_block_id AS logicalBlockId, revision
               FROM draft_blocks WHERE draft_id = ? ORDER BY order_key, id`,
          )
          .all(draft.draftId) as Array<{ logicalBlockId: string; revision: number | bigint }>;
        const patch = database
          .prepare(
            `SELECT after_blocks_json AS afterBlocksJson
               FROM draft_patch_log
              WHERE draft_id = ? AND mutation_origin = 'safe_replace'
              ORDER BY created_at DESC, id DESC LIMIT 1`,
          )
          .get(draft.draftId) as { afterBlocksJson: string };
        return {
          revisions: new Map(
            rows.map((row) => [row.logicalBlockId, Number(row.revision)] as const),
          ),
          audit: JSON.parse(patch.afterBlocksJson) as Array<{
            logicalBlockId: string;
            revision: number;
          }>,
        };
      });

      expect(persisted.revisions.get(initial.logicalBlockId)).toBe(draft.revision + 1);
      for (const block of draft.blocks.filter(
        (candidate) => candidate.logicalBlockId !== initial.logicalBlockId,
      )) {
        expect(persisted.revisions.get(block.logicalBlockId)).toBe(
          beforeById.get(block.logicalBlockId),
        );
      }
      expect(
        new Map(persisted.audit.map((block) => [block.logicalBlockId, block.revision])),
      ).toEqual(persisted.revisions);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
