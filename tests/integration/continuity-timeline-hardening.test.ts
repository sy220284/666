import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M3-04 timeline and knowledge hardening', () => {
  it('enforces presence, precision, ordering, archive, and all knowledge statuses', async () => {
    const value = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(value);
      let catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '南城目击',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter1.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [],
        witnessIds: [seeded.character.id],
        subjectIds: [],
        dependencyIds: [],
      });
      const witnessed = catalog.timelineEvents.find((event) => event.title === '南城目击')!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城参与',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });

      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城约见',
          startValue: '盛夏前后',
          endValue: null,
          precision: 'approximate',
          chapterId: seeded.chapter2.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城传闻',
          startValue: '未知',
          endValue: null,
          precision: 'unknown',
          chapterId: seeded.chapter2.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '北城被提及',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.north.id,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [seeded.character.id],
          dependencyIds: [],
        }),
      ).resolves.toBeDefined();

      catalog = await value.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '未来事件',
        startValue: '2026-07-22',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter3.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      const future = catalog.timelineEvents.find((event) => event.title === '未来事件')!;
      await expect(
        value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '错误前置',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: null,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [future.id],
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });

      await value.continuity.archiveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: witnessed.id,
      });
      expect(
        value.continuity
          .list({
            projectId: seeded.project.projectId,
            query: '南城目击',
            includeHistory: true,
            includeArchivedEvents: false,
            effectiveAtChapterId: null,
          })
          .timelineEvents.find((event) => event.id === witnessed.id),
      ).toBeUndefined();
      expect(
        value.continuity
          .list({
            projectId: seeded.project.projectId,
            query: '南城目击',
            includeHistory: true,
            includeArchivedEvents: true,
            effectiveAtChapterId: null,
          })
          .timelineEvents.find((event) => event.id === witnessed.id)?.status,
      ).toBe('archived');

      const statuses = ['knows', 'believes', 'suspects', 'misunderstands', 'unknown'] as const;
      for (const status of statuses) {
        await value.continuity.setKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          informationKey: `status-${status}`,
          characterId: seeded.character.id,
          knowledgeStatus: status,
          validFromChapterId: seeded.chapter4.id,
          validUntilChapterId: null,
          sourceVersionId: seeded.version.versionId,
          sourceLogicalBlockId: null,
          notes: '',
        });
      }
      expect(
        new Set(
          value.continuity
            .list({
              projectId: seeded.project.projectId,
              query: 'status-',
              includeHistory: false,
              includeArchivedEvents: false,
              effectiveAtChapterId: null,
            })
            .knowledgeStates.map((state) => state.knowledgeStatus),
        ),
      ).toEqual(new Set(statuses));
    } finally {
      await closeContinuityHarness(value);
    }
  });
});
