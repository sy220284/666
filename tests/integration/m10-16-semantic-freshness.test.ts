import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M10-16 semantic freshness ownership', () => {
  it('lets the existing database trigger own EndingSnapshot staleness after Final changes', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const snapshot = await harness.proposals.refreshSnapshot(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
      });
      expect(snapshot.status).toBe('valid');

      const draft = await harness.drafts.open(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
      });
      const replacement = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        title: '新的第一章定稿',
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: replacement.versionId,
      });

      const read = harness.proposals.readSnapshot({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
      });
      expect(read.snapshotSource).toBe('fallback_live_query');
      const catalog = harness.proposals.list({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        includeResolved: true,
      });
      expect(catalog.snapshots).toContainEqual(
        expect.objectContaining({
          id: snapshot.id,
          sourceVersionId: seeded.version.versionId,
          status: 'stale',
        }),
      );
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
