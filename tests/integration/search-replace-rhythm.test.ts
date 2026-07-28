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

describe('M4-04 full-project search, safe replacement and rhythm metrics', () => {
  it('searches authoritative Draft/Version/Entity data and applies only unlocked active Draft matches', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const firstBlock = seeded.draft.blocks[0]!;
      let draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: firstBlock.logicalBlockId,
            expectedHash: firstBlock.contentHash!,
            content: '旧名走向旧名',
          },
          {
            type: 'insert',
            afterLogicalBlockId: firstBlock.logicalBlockId,
            block: { blockType: 'paragraph', content: '旧名被锁定', attributes: {} },
          },
        ],
      });
      const locked = draft.blocks[1]!;
      draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: locked.logicalBlockId,
            expectedHash: locked.contentHash!,
            locked: true,
          },
        ],
      });
      const version = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '替换前定稿',
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: version.versionId,
      });
      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: path.join(harness.parent, 'operation-backups'),
        clock: hardeningClock,
      });
      const tools = new SearchToolsService(harness.workspace, recovery, () => randomUUID(), {
        clock: hardeningClock,
      });
      await tools.rebuildIndex(randomUUID(), seeded.project.projectId);
      const search = tools.search({
        projectId: seeded.project.projectId,
        query: '旧名',
        sourceTypes: ['draft', 'version', 'entity'],
        includeArchived: false,
        limit: 100,
      });
      expect(search.items.some((item) => item.sourceType === 'draft')).toBe(true);
      expect(search.items.some((item) => item.sourceType === 'version')).toBe(true);

      const beforeMetrics = await harness.validation.list({
        projectId: seeded.project.projectId,
        chapterId: null,
        includeClosed: true,
      });
      expect(beforeMetrics.projectId).toBe(seeded.project.projectId);
      const rhythmBefore = await harness.rhythm.get(randomUUID(), seeded.project.projectId);
      const plan = await tools.previewReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        query: '旧名',
        replacement: '新名',
        matchCase: true,
        maxMatches: 100,
      });
      expect(plan).toMatchObject({ itemCount: 3, eligibleCount: 2, lockedCount: 1 });
      expect(plan.items.every((item) => item.draftId === draft.draftId)).toBe(true);
      const applied = await tools.applyReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        planId: plan.planId,
      });
      expect(applied).toMatchObject({
        plan: { status: 'applied' },
        skippedLockedCount: 1,
      });
      expect(applied.checkpoint.operation).toBe('replace');
      const updated = await harness.drafts.open(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
      });
      expect(updated.blocks.map((block) => block.text)).toEqual(['新名走向新名', '旧名被锁定']);
      expect(
        harness.versions
          .get({
            projectId: seeded.project.projectId,
            chapterId: seeded.chapter1.id,
            versionId: version.versionId,
          })
          .blocks.map((block) => block.text),
      ).toEqual(['旧名走向旧名', '旧名被锁定']);
      const origins = harness.workspace.readProject(seeded.project.projectId, (database) =>
        database
          .prepare(
            `SELECT mutation_origin AS origin, COUNT(*) AS count
               FROM draft_patch_log GROUP BY mutation_origin ORDER BY mutation_origin`,
          )
          .all(),
      );
      expect(origins).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ origin: 'manual_edit' }),
          expect.objectContaining({ origin: 'safe_replace' }),
        ]),
      );
      const rhythmAfter = await harness.rhythm.get(randomUUID(), seeded.project.projectId);
      expect(rhythmAfter.cumulativeManualNetCharacters).toBe(
        rhythmBefore.cumulativeManualNetCharacters,
      );
      expect(rhythmAfter.suggestions.every((suggestion) => suggestion.priority === 'P3')).toBe(
        true,
      );
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects a stale ReplacePlan atomically and lets only the author change rhythm thresholds', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const first = seeded.draft.blocks[0]!;
      let draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: first.logicalBlockId,
            expectedHash: first.contentHash!,
            content: '等待替换',
          },
        ],
      });
      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: path.join(harness.parent, 'stale-backups'),
        clock: hardeningClock,
      });
      const tools = new SearchToolsService(harness.workspace, recovery, () => randomUUID(), {
        clock: hardeningClock,
      });
      const plan = await tools.previewReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        query: '等待',
        replacement: '完成',
        matchCase: true,
        maxMatches: 100,
      });
      draft = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: draft.blocks[0]!.logicalBlockId,
            expectedHash: draft.blocks[0]!.contentHash!,
            content: '已经变化',
          },
        ],
      });
      await expect(
        tools.applyReplace(randomUUID(), {
          projectId: seeded.project.projectId,
          planId: plan.planId,
        }),
      ).rejects.toMatchObject({ code: 'SEARCH_REPLACE_STALE' });
      expect(draft.blocks[0]!.text).toBe('已经变化');

      const current = await harness.rhythm.get(randomUUID(), seeded.project.projectId);
      expect(() =>
        harness.rhythm.updateProfile(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          enabled: false,
          excitementMinPer1000: 0.2,
          excitementMaxPer1000: 4,
          hookEnabled: false,
          goldenThreeEnabled: false,
          targetDailyCharacters: 1_000,
          idleThresholdSeconds: 600,
          timeZone: current.profile.timeZone,
        }),
      ).toThrow(expect.objectContaining({ code: 'RHYTHM_AUTHOR_REQUIRED' }));
      const updated = await harness.rhythm.updateProfile(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        enabled: false,
        excitementMinPer1000: 0.2,
        excitementMaxPer1000: 4,
        hookEnabled: false,
        goldenThreeEnabled: false,
        targetDailyCharacters: 1_000,
        idleThresholdSeconds: 600,
        timeZone: current.profile.timeZone,
      });
      expect(updated.profile).toMatchObject({
        enabled: false,
        excitementMinPer1000: 0.2,
        excitementMaxPer1000: 4,
      });
      expect(updated.suggestions).toEqual([]);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
