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

describe('M3-05 character arcs', () => {
  it('orders milestones, moves planned chapters, enforces dependencies, and records author confirmation', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      let catalog = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '从逃避到承担',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '让选择承担后果',
      });
      const arc = catalog.characterArcs.find((item) => item.title === '从逃避到承担')!;
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '第一次承担',
        description: '',
        sortIndex: 10,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      let first = catalog.characterArcs[0]!.milestones.find((item) => item.title === '第一次承担')!;
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: first.id,
        arcId: arc.id,
        title: first.title,
        description: first.description,
        sortIndex: first.sortIndex,
        plannedChapterId: seeded.chapter3.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      first = catalog.characterArcs[0]!.milestones.find((item) => item.id === first.id)!;
      expect(first.plannedChapterId).toBe(seeded.chapter3.id);
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: first.id,
        arcId: arc.id,
        title: first.title,
        description: first.description,
        sortIndex: first.sortIndex,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      first = catalog.characterArcs[0]!.milestones.find((item) => item.id === first.id)!;

      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '主动承担',
        description: '',
        sortIndex: 20,
        plannedChapterId: seeded.chapter3.id,
        dependencyMilestoneIds: [first.id],
        dependencyTimelineEventIds: [],
      });
      const second = catalog.characterArcs[0]!.milestones.find(
        (item) => item.title === '主动承担',
      )!;
      expect(catalog.characterArcs[0]!.milestones.map((item) => item.title)).toEqual([
        '第一次承担',
        '主动承担',
      ]);
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: second.id,
          status: 'hit',
          actualChapterId: seeded.chapter3.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });

      await harness.narrative.transitionArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: first.id,
        status: 'hit',
        actualChapterId: seeded.chapter2.id,
      });
      catalog = await harness.narrative.transitionArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: second.id,
        status: 'hit',
        actualChapterId: seeded.chapter3.id,
      });
      const hit = catalog.characterArcs[0]!.milestones.find((item) => item.id === second.id)!;
      expect(hit).toMatchObject({
        status: 'hit',
        actualChapterId: seeded.chapter3.id,
        confirmationSource: 'author',
      });
      catalog = await harness.narrative.transitionArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: second.id,
        status: 'planned',
        actualChapterId: null,
      });
      expect(
        catalog.characterArcs[0]!.milestones.find((item) => item.id === second.id),
      ).toMatchObject({
        status: 'planned',
        actualChapterId: null,
        confirmationSource: null,
      });
      catalog = await harness.narrative.transitionArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: second.id,
        status: 'skipped',
        actualChapterId: seeded.chapter4.id,
      });
      expect(
        catalog.characterArcs[0]!.milestones.find((item) => item.id === second.id),
      ).toMatchObject({
        status: 'skipped',
        actualChapterId: seeded.chapter4.id,
        confirmationSource: 'author',
      });
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: second.id,
          status: 'hit',
          actualChapterId: seeded.chapter4.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects dependency cycles, foreign timeline events, invalid custom arcs, and AI writes', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const foreign = await seedContinuity(harness);
      let catalog = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '试炼弧光',
        arcType: 'custom',
        customType: '信念重建',
        status: 'planned',
        authorIntent: '',
      });
      const arc = catalog.characterArcs[0]!;
      const eventCatalog = await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '城门失守',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter2.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [seeded.character.id],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      const event = eventCatalog.timelineEvents[0]!;
      const foreignEventCatalog = await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: foreign.project.projectId,
        authority: 'author',
        eventId: null,
        title: '异项目事件',
        startValue: '2026-07-21',
        endValue: null,
        precision: 'day',
        chapterId: foreign.chapter2.id,
        locationId: foreign.south.id,
        description: '',
        participantIds: [foreign.character.id],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      const foreignEvent = foreignEventCatalog.timelineEvents[0]!;
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '先导节点',
        description: '',
        sortIndex: 1,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [event.id],
      });
      const first = catalog.characterArcs[0]!.milestones[0]!;
      expect(first.dependencyTimelineEventIds).toEqual([event.id]);
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '后续节点',
        description: '',
        sortIndex: 2,
        plannedChapterId: seeded.chapter3.id,
        dependencyMilestoneIds: [first.id],
        dependencyTimelineEventIds: [],
      });
      const second = catalog.characterArcs[0]!.milestones.find(
        (item) => item.title === '后续节点',
      )!;
      await expect(
        harness.narrative.saveArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: first.id,
          arcId: arc.id,
          title: first.title,
          description: first.description,
          sortIndex: first.sortIndex,
          plannedChapterId: first.plannedChapterId,
          dependencyMilestoneIds: [second.id],
          dependencyTimelineEventIds: [event.id],
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
      await expect(
        harness.narrative.saveArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: null,
          arcId: arc.id,
          title: '跨项目时间线',
          description: '',
          sortIndex: 3,
          plannedChapterId: seeded.chapter4.id,
          dependencyMilestoneIds: [],
          dependencyTimelineEventIds: [foreignEvent.id],
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_NOT_FOUND' });
      await expect(
        harness.narrative.saveCharacterArc(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          arcId: null,
          characterId: seeded.character.id,
          title: '缺少自定义类型',
          arcType: 'custom',
          customType: null,
          status: 'planned',
          authorIntent: '',
        }),
      ).rejects.toBeDefined();
      await expect(
        harness.narrative.saveCharacterArc(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          arcId: null,
          characterId: seeded.character.id,
          title: 'AI弧光',
          arcType: 'growth',
          customType: null,
          status: 'planned',
          authorIntent: '',
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_AUTHOR_REQUIRED' });
      await expect(
        harness.narrative.saveArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          milestoneId: null,
          arcId: arc.id,
          title: 'AI节点',
          description: '',
          sortIndex: 3,
          plannedChapterId: seeded.chapter4.id,
          dependencyMilestoneIds: [],
          dependencyTimelineEventIds: [],
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_AUTHOR_REQUIRED' });
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          milestoneId: first.id,
          status: 'hit',
          actualChapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_AUTHOR_REQUIRED' });
      expect(catalog.characterArcs.some((item) => item.title === 'AI弧光')).toBe(false);
      expect(catalog.characterArcs[0]!.milestones.some((item) => item.title === 'AI节点')).toBe(
        false,
      );
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
