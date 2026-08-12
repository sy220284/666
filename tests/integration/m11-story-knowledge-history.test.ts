import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { StoryKnowledgeProjectionService } from '../../packages/core-service/src/story-knowledge-service.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
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
      expect(new Set(allItems.map((item) => item.versionId)).size).toBe(3);
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

  it('聚合当前章节候选稿与项目恢复元数据，并保持各窗口有界', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const candidate = await harness.candidates.createFixture(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseDraftRevision: seeded.draft.revision,
        candidateType: 'rewrite',
        completeness: 'complete',
        title: '候选历史稿',
        sourceVersionId: seeded.version.versionId,
        blocks: [{ blockType: 'paragraph', text: '候选内容', attributes: {} }],
      });
      const checkpoint = await harness.recovery.createNamedSnapshot(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        name: '历史快照',
        note: '用于历史投影验证',
      });
      const failureId = randomUUID();
      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (connection) => {
        connection
          .prepare(
            `INSERT INTO backup_failures(
               id, project_id, operation, backup_track, error_code, occurred_at, resolved_at
             ) VALUES (?, ?, 'replace', 'major', 'BACKUP_VERIFY_FAILED', ?, NULL)`,
          )
          .run(failureId, seeded.project.projectId, hardeningClock.now().toISOString());
        return true;
      });

      const story = new StoryKnowledgeProjectionService(harness.workspace);
      const projection = story.project({
        view: 'history',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        beforeCreatedAt: null,
        beforeVersionId: null,
        limit: 10,
      });
      expect(projection.view).toBe('history');
      if (projection.view !== 'history') throw new Error('投影类型错误');
      expect(projection.candidates).toEqual([
        expect.objectContaining({
          candidateId: candidate.candidateId,
          title: '候选历史稿',
          candidateType: 'rewrite',
          status: 'pending',
        }),
      ]);
      expect(projection.candidatesTruncated).toBe(false);
      expect(projection.recovery.checkpoints).toEqual([
        expect.objectContaining({
          backupId: checkpoint.backupId,
          displayName: '历史快照',
          track: 'named',
        }),
      ]);
      expect(projection.recovery.backupFailures).toEqual([
        expect.objectContaining({
          failureId,
          errorCode: 'BACKUP_VERIFY_FAILED',
          resolvedAt: null,
        }),
      ]);
      expect(projection.recovery.checkpoints.length).toBeLessThanOrEqual(10);
      expect(projection.recovery.backupFailures.length).toBeLessThanOrEqual(10);
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
