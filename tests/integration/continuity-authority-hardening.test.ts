import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M3-04 continuity authority hardening', () => {
  it('rejects foreign anchors and every AI authority mutation', async () => {
    const value = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(value);
      await expect(
        value.continuity.setEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: seeded.character.id,
          stateKey: 'health',
          value: 'invalid-source',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          evidence: [],
          sourceVersionId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });
      await expect(
        value.continuity.setEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: seeded.character.id,
          stateKey: 'health',
          value: 'invalid-evidence',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          evidence: [{ kind: 'entity', targetId: randomUUID(), note: '' }],
          sourceVersionId: seeded.version.versionId,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });
      await expect(
        value.continuity.setKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          informationKey: 'foreign-block',
          characterId: seeded.character.id,
          knowledgeStatus: 'unknown',
          validFromChapterId: seeded.chapter1.id,
          validUntilChapterId: null,
          sourceVersionId: null,
          sourceLogicalBlockId: randomUUID(),
          notes: '',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });

      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'well',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      await expect(
        value.continuity.invalidateEntityState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          entityId: seeded.character.id,
          stateKey: 'health',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'secret',
        characterId: seeded.character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      await expect(
        value.continuity.invalidateKnowledgeState(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          characterId: seeded.character.id,
          informationKey: 'secret',
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });

      const event = (
        await value.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '作者事件',
          startValue: '2026-07-20',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter1.id,
          locationId: seeded.south.id,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        })
      ).timelineEvents[0]!;
      await expect(
        value.continuity.archiveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          eventId: event.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_AUTHOR_REQUIRED' });
    } finally {
      await closeContinuityHarness(value);
    }
  });
});
