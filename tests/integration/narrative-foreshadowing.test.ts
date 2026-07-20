import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('M3-05 foreshadowing lifecycle', () => {
  it('tracks reveal windows, dependency blocking, search, and legal author transitions', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      let catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '旧钥匙',
        description: '先回收的前置伏笔',
        revealFromChapterId: seeded.chapter1.id,
        revealByChapterId: seeded.chapter2.id,
        chapterLinks: [{ chapterId: seeded.chapter1.id, role: 'plant' }],
        relations: [],
      });
      const dependency = catalog.foreshadowings.find((item) => item.title === '旧钥匙')!;
      catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '密室真相',
        description: '依赖旧钥匙',
        revealFromChapterId: seeded.chapter2.id,
        revealByChapterId: seeded.chapter3.id,
        chapterLinks: [{ chapterId: seeded.chapter2.id, role: 'reinforce' }],
        relations: [{ targetForeshadowingId: dependency.id, kind: 'depends_on' }],
      });
      const dependent = catalog.foreshadowings.find((item) => item.title === '密室真相')!;

      await harness.narrative.transitionForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: dependent.id,
        status: 'planted',
      });
      await expect(
        harness.narrative.transitionForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          foreshadowingId: dependent.id,
          status: 'revealed',
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });

      for (const status of ['planted', 'revealed'] as const) {
        await harness.narrative.transitionForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          foreshadowingId: dependency.id,
          status,
        });
      }
      catalog = await harness.narrative.transitionForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: dependent.id,
        status: 'revealed',
      });
      expect(catalog.foreshadowings.find((item) => item.id === dependent.id)?.status).toBe(
        'revealed',
      );

      const search = harness.narrative.list({
        projectId: seeded.project.projectId,
        query: '旧钥匙',
        includeResolved: true,
        referenceChapterId: seeded.chapter4.id,
      });
      expect(search.foreshadowings.map((item) => item.title)).toEqual(['旧钥匙']);

      catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '逾期线索',
        description: '',
        revealFromChapterId: seeded.chapter2.id,
        revealByChapterId: seeded.chapter3.id,
        chapterLinks: [],
        relations: [],
      });
      const overdue = catalog.foreshadowings.find((item) => item.title === '逾期线索')!;
      const atChapter4 = harness.narrative.list({
        projectId: seeded.project.projectId,
        query: '逾期线索',
        includeResolved: true,
        referenceChapterId: seeded.chapter4.id,
      });
      expect(atChapter4.foreshadowings.find((item) => item.id === overdue.id)?.attention).toBe(
        'overdue',
      );
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects dependency cycles, mutual exclusion conflicts, illegal transitions, and AI writes', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      let catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '甲',
        description: '',
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [],
        relations: [],
      });
      const first = catalog.foreshadowings.find((item) => item.title === '甲')!;
      catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '乙',
        description: '',
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [],
        relations: [{ targetForeshadowingId: first.id, kind: 'depends_on' }],
      });
      const second = catalog.foreshadowings.find((item) => item.title === '乙')!;
      await expect(
        harness.narrative.saveForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          foreshadowingId: first.id,
          title: first.title,
          description: first.description,
          revealFromChapterId: null,
          revealByChapterId: null,
          chapterLinks: [],
          relations: [{ targetForeshadowingId: second.id, kind: 'depends_on' }],
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });

      catalog = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: first.id,
        title: first.title,
        description: first.description,
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [],
        relations: [{ targetForeshadowingId: second.id, kind: 'mutually_exclusive' }],
      });
      await harness.narrative.transitionForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: first.id,
        status: 'planted',
      });
      await expect(
        harness.narrative.transitionForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          foreshadowingId: second.id,
          status: 'planted',
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
      await expect(
        harness.narrative.transitionForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          foreshadowingId: first.id,
          status: 'planned',
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
      await expect(
        harness.narrative.saveForeshadowing(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          foreshadowingId: null,
          title: 'AI不得写入',
          description: '',
          revealFromChapterId: null,
          revealByChapterId: null,
          chapterLinks: [],
          relations: [],
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_AUTHOR_REQUIRED' });
      expect(catalog.foreshadowings.some((item) => item.title === 'AI不得写入')).toBe(false);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
