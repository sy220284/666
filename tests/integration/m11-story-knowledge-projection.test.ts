import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectPlanningService } from '../../packages/core-service/src/project-planning.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import { StoryKnowledgeProjectionService } from '../../packages/core-service/src/story-knowledge-service.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M11-04 故事知识有界投影', () => {
  it('按目标章节还原人物状态、知情、场景、伏笔、待办与上一章', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const planning = new ProjectPlanningService(harness.workspace, { clock: hardeningClock });
      const beats = new SceneBeatService(harness.workspace, { clock: hardeningClock });
      const story = new StoryKnowledgeProjectionService(harness.workspace);

      const outline = await planning.createPlotNode(randomUUID(), {
        projectId: seeded.project.projectId,
        parentId: null,
        nodeType: 'chapter',
        title: '第二章目标',
        goal: '确认追兵位置',
        coreConflict: '救人与隐藏身份不可兼得',
        expectedResult: '主角决定冒险过河',
        status: 'outlined',
        placement: { kind: 'end' },
      });
      const goalNode = outline.nodes.find((node) => node.title === '第二章目标')!;
      await beats.create(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        plotNodeId: goalNode.id,
        title: '河边试探',
        goal: '确认暗号',
        coreConflict: '追兵逼近',
        expectedResult: '确认渡河时机',
        beatType: 'turn',
        wordTargetPercent: 40,
        required: true,
        characterIds: [seeded.character.id],
        locationIds: [],
        placement: { kind: 'end' },
      });

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
      await harness.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: '伤势',
        value: '已经痊愈',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        evidence: [{ kind: 'chapter', targetId: seeded.chapter3.id, note: '' }],
        sourceVersionId: seeded.version.versionId,
      });
      await harness.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: '追兵暗号',
        characterId: seeded.character.id,
        knowledgeStatus: 'suspects',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      await harness.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: '追兵暗号',
        characterId: seeded.character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '第三章确认',
      });

      let narrative = await harness.narrative.saveForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: null,
        title: '河灯暗号',
        description: '河灯数量对应追兵位置。',
        revealFromChapterId: seeded.chapter2.id,
        revealByChapterId: seeded.chapter3.id,
        chapterLinks: [{ chapterId: seeded.chapter2.id, role: 'reinforce' }],
        relations: [],
      });
      const foreshadowing = narrative.foreshadowings.find((item) => item.title === '河灯暗号')!;
      narrative = await harness.narrative.transitionForeshadowing(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        foreshadowingId: foreshadowing.id,
        status: 'planted',
      });
      expect(narrative.foreshadowings.find((item) => item.id === foreshadowing.id)?.status).toBe(
        'planted',
      );

      await harness.validation.saveTodo(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        sceneBeatId: null,
        logicalBlockId: null,
        title: '补出认出暗号的细节',
        status: 'open',
      });

      const projection = story.project({
        view: 'chapter_assist',
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        limit: 20,
      });
      expect(projection.view).toBe('chapter_assist');
      if (projection.view !== 'chapter_assist') throw new Error('投影类型错误');
      expect(projection.bounded).toBe(true);
      expect(projection.chapterTitle).toBe(seeded.chapter2.title);
      expect(projection.previousChapter).toMatchObject({
        chapterId: seeded.chapter1.id,
        chapterTitle: seeded.chapter1.title,
      });
      expect(projection.goal).toMatchObject({
        title: '第二章目标',
        goal: '确认追兵位置',
      });
      expect(projection.sceneBeats).toEqual([
        expect.objectContaining({ title: '河边试探', required: true, wordTargetPercent: 40 }),
      ]);
      expect(projection.characters).toEqual([
        expect.objectContaining({
          id: seeded.character.id,
          states: [{ key: '伤势', value: '左肩带伤' }],
          knowledge: [{ information: '追兵暗号', status: 'suspects' }],
        }),
      ]);
      expect(projection.foreshadowings).toEqual([
        expect.objectContaining({ id: foreshadowing.id, attention: 'due' }),
      ]);
      expect(projection.todos).toEqual([
        expect.objectContaining({ title: '补出认出暗号的细节', status: 'open' }),
      ]);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('在一千章作品中仍只返回有界窗口，并准确定位直接前章', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const story = new StoryKnowledgeProjectionService(harness.workspace);
      const inserted: string[] = [];
      await harness.workspace.writeProject(randomUUID(), seeded.project.projectId, (connection) => {
        const maximum = connection
          .prepare(`SELECT MAX(order_key) AS value FROM chapters WHERE volume_id = ?`)
          .get(seeded.chapter1.volumeId) as unknown as { readonly value: number | bigint };
        const start = Number(maximum.value);
        const insert = connection.prepare(
          `INSERT INTO chapters(
             id, volume_id, title, status, order_key, target_word_min,
             target_word_max, active_draft_id, final_version_id, deleted_at
           ) VALUES (?, ?, ?, 'writing', ?, NULL, NULL, NULL, NULL, NULL)`,
        );
        for (let index = 0; index < 996; index += 1) {
          const id = randomUUID();
          inserted.push(id);
          insert.run(id, seeded.chapter1.volumeId, `扩展章${index + 1}`, start + index + 1);
        }
        return true;
      });

      const anchorId = inserted.at(-1)!;
      const previousId = inserted.at(-2)!;
      const projection = story.project({
        view: 'chapter_assist',
        projectId: seeded.project.projectId,
        chapterId: anchorId,
        limit: 10,
      });
      expect(projection.view).toBe('chapter_assist');
      if (projection.view !== 'chapter_assist') throw new Error('投影类型错误');
      expect(projection.bounded).toBe(true);
      expect(projection.previousChapter?.chapterId).toBe(previousId);
      expect(projection.characters).toHaveLength(0);
      expect(projection.relationships.length).toBeLessThanOrEqual(10);
      expect(projection.timeline.length).toBeLessThanOrEqual(10);
      expect(projection.foreshadowings.length).toBeLessThanOrEqual(10);
      expect(projection.milestones.length).toBeLessThanOrEqual(10);
      expect(projection.todos.length).toBeLessThanOrEqual(10);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
