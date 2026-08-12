import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  StoryKnowledgeProjectionService,
  StoryKnowledgeProjectionServiceError,
} from '../../packages/core-service/src/story-knowledge-projection.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M11-04 base Story Knowledge projection coverage', () => {
  it('覆盖人物、关系、时间线与成长投影的有界分支', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);

      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: '伤势',
        value: '左肩带伤',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'version', targetId: seeded.version.versionId, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });

      const currentCard = story.project({
        view: 'character_card',
        projectId: seeded.project.projectId,
        characterId: seeded.character.id,
        chapterId: null,
        limit: 10,
      });
      expect(currentCard.view).toBe('character_card');

      const chapterCard = story.project({
        view: 'character_card',
        projectId: seeded.project.projectId,
        characterId: seeded.character.id,
        chapterId: seeded.chapter1.id,
        limit: 10,
      });
      expect(chapterCard.view).toBe('character_card');
      if (chapterCard.view !== 'character_card') throw new Error('投影类型错误');
      expect(chapterCard.states).toEqual([
        expect.objectContaining({ key: '伤势', value: '左肩带伤' }),
      ]);

      const relations = story.project({
        view: 'relationships',
        projectId: seeded.project.projectId,
        characterId: seeded.character.id,
        chapterId: seeded.chapter1.id,
        limit: 1,
      });
      expect(relations).toMatchObject({ view: 'relationships', truncated: false });

      const emptyTimeline = story.project({
        view: 'timeline',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        characterId: null,
        before: 0,
        after: 0,
      });
      expect(emptyTimeline).toMatchObject({
        view: 'timeline',
        items: [],
        truncatedBefore: false,
        truncatedAfter: false,
      });

      const characterTimeline = story.project({
        view: 'timeline',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        characterId: seeded.character.id,
        before: 1,
        after: 1,
      });
      expect(characterTimeline.view).toBe('timeline');

      const arc = story.project({
        view: 'arc',
        projectId: seeded.project.projectId,
        characterId: seeded.character.id,
        chapterId: null,
        limit: 5,
      });
      expect(arc).toMatchObject({ view: 'arc', milestones: [], truncated: false });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('对不存在实体与非人物实体 fail-closed', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);

      expect(() =>
        story.project({
          view: 'character_card',
          projectId: seeded.project.projectId,
          characterId: randomUUID(),
          chapterId: null,
          limit: 5,
        }),
      ).toThrowError(StoryKnowledgeProjectionServiceError);

      expect(() =>
        story.project({
          view: 'character_card',
          projectId: seeded.project.projectId,
          characterId: seeded.south.id,
          chapterId: null,
          limit: 5,
        }),
      ).toThrowError(StoryKnowledgeProjectionServiceError);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
