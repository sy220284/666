import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { StoryKnowledgeProjectionService } from '../../packages/core-service/src/story-knowledge-service.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M11-04 故事知识历史分页', () => {
  it('同一时间戳的多个历史版本仍可稳定翻页且不重不漏', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const second = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        title: '第二份历史稿',
      });
      const third = await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        title: '第三份历史稿',
      });
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: second.versionId,
      });

      const story = new StoryKnowledgeProjectionService(harness.workspace);
      const firstPage = story.project({
        view: 'history',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        beforeCreatedAt: null,
        beforeVersionId: null,
        limit: 2,
      });
      expect(firstPage.view).toBe('history');
      if (firstPage.view !== 'history') throw new Error('投影类型错误');
      expect(firstPage.items).toHaveLength(2);
      expect(firstPage.nextBeforeCreatedAt).not.toBeNull();
      expect(firstPage.nextBeforeVersionId).not.toBeNull();

      const secondPage = story.project({
        view: 'history',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        beforeCreatedAt: firstPage.nextBeforeCreatedAt,
        beforeVersionId: firstPage.nextBeforeVersionId,
        limit: 2,
      });
      expect(secondPage.view).toBe('history');
      if (secondPage.view !== 'history') throw new Error('投影类型错误');
      expect(secondPage.items).toHaveLength(1);
      expect(secondPage.nextBeforeCreatedAt).toBeNull();
      expect(secondPage.nextBeforeVersionId).toBeNull();

      const allItems = [...firstPage.items, ...secondPage.items];
      expect(new Set(allItems.map((item) => item.versionId))).toHaveLength(3);
      expect(allItems.map((item) => item.versionId)).toEqual(
        expect.arrayContaining([seeded.version.versionId, second.versionId, third.versionId]),
      );
      expect(allItems.filter((item) => item.finalized).map((item) => item.versionId)).toEqual([
        second.versionId,
      ]);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('拒绝不完整的历史游标', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);
      expect(() =>
        story.project({
          view: 'history',
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          beforeCreatedAt: seeded.version.createdAt,
          beforeVersionId: null,
          limit: 10,
        }),
      ).toThrow(expect.objectContaining({ code: 'STORY_KNOWLEDGE_INVALID' }));
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
