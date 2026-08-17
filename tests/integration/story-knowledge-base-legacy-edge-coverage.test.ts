import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import {
  StoryKnowledgeProjectionService,
  StoryKnowledgeProjectionServiceError,
} from '../../packages/core-service/src/story-knowledge-projection.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
} from './continuity-hardening-harness.js';

const evidence = (versionId: string) => [
  { kind: 'version' as const, targetId: versionId, note: '' },
];

afterEach(cleanupContinuityHarnesses);

describe('base Story Knowledge legacy projection edge coverage', () => {
  it('projects bounded foreshadowing, arc, history and chapter-assist lanes from real data', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);
      const beats = new SceneBeatService(harness.workspace, { clock: hardeningClock });
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });

      const catalog = await harness.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '陆沉',
        aliases: [],
        summary: '',
      });
      const other = catalog.entities.find((entity) => entity.name === '陆沉')!;
      await harness.continuity.setCharacterRelationship(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        fromCharacterId: seeded.character.id,
        toCharacterId: other.id,
        category: 'alliance',
        label: '盟友',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        evidence: evidence(seeded.version.versionId),
      });
      await beats.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        plotNodeId: null,
        title: '双人会合',
        goal: '交换情报',
        coreConflict: '互不完全信任',
        expectedResult: '暂时结盟',
        beatType: 'development',
        wordTargetPercent: 30,
        required: true,
        characterIds: [seeded.character.id, other.id],
        locationIds: [],
        placement: { kind: 'end' },
      });

      let planning = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '承担责任',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '让人物主动选择',
      });
      const arc = planning.characterArcs.find((item) => item.title === '承担责任')!;
      planning = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '第一次承担',
        description: '留下断后',
        sortIndex: 10,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      expect(planning.characterArcs[0]?.milestones).toHaveLength(1);

      await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        title: '第二版',
      });
      await harness.versions.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        title: '第三版',
      });

      const foreshadowing = story.project({
        view: 'foreshadowing',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        limit: 1,
      });
      expect(foreshadowing).toMatchObject({
        view: 'foreshadowing',
        truncated: false,
        items: [],
      });

      const arcProjection = story.project({
        view: 'arc',
        projectId: seeded.project.projectId,
        characterId: seeded.character.id,
        chapterId: null,
        limit: 1,
      });
      expect(arcProjection.view).toBe('arc');
      if (arcProjection.view !== 'arc') throw new Error('投影类型错误');
      expect(arcProjection.milestones).toEqual([
        expect.objectContaining({ title: '第一次承担', sortIndex: 10 }),
      ]);

      expect(() =>
        story.project({
          view: 'history',
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          beforeCreatedAt: null,
          beforeVersionId: null,
          limit: 1,
        }),
      ).toThrow();
      expect(() =>
        story.project({
          view: 'history',
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          beforeCreatedAt: null,
          beforeVersionId: null,
          limit: 10,
        }),
      ).toThrow();

      expect(() =>
        story.project({
          view: 'chapter_assist',
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter2.id,
          limit: 10,
        }),
      ).toThrow();
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('fails closed for a missing chapter in legacy chapter-scoped projections', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);
      expect(() =>
        story.project({
          view: 'foreshadowing',
          projectId: seeded.project.projectId,
          chapterId: randomUUID(),
          limit: 5,
        }),
      ).toThrowError(StoryKnowledgeProjectionServiceError);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('fails closed when persisted Story Knowledge JSON is corrupt', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.canon.setFact(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        factKey: '兵器',
        value: { name: '旧刀' },
        description: '',
        sourceType: 'author',
        sourceId: null,
      });
      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (connection) => {
        connection.exec('PRAGMA ignore_check_constraints = ON');
        connection
          .prepare("UPDATE canon_facts SET value_json = '{broken' WHERE entity_id = ?")
          .run(seeded.character.id);
        connection.exec('PRAGMA ignore_check_constraints = OFF');
      });

      const story = new StoryKnowledgeProjectionService(harness.workspace);
      expect(() =>
        story.project({
          view: 'character_card',
          projectId: seeded.project.projectId,
          characterId: seeded.character.id,
          chapterId: null,
          limit: 10,
        }),
      ).toThrowError(expect.objectContaining({ code: 'STORY_KNOWLEDGE_INVARIANT' }));
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
