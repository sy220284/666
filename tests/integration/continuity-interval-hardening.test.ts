import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  listContinuityAt,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M3-04 continuity interval hardening', () => {
  it('preserves explicit gaps and same-start revisions for state and knowledge', async () => {
    const value = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(value);
      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'injured',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter2.id,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'recovered',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      expect(
        listContinuityAt(value, seeded.project.projectId, seeded.chapter2.id).entityStates,
      ).toEqual([]);
      const stateHistory = value.continuity.list({
        projectId: seeded.project.projectId,
        query: 'health',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }).entityStates;
      expect(stateHistory.find((state) => state.value === 'injured')?.validUntilChapterId).toBe(
        seeded.chapter2.id,
      );

      await value.continuity.setEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
        value: 'stable',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        evidence: [],
        sourceVersionId: seeded.version.versionId,
      });
      expect(
        listContinuityAt(value, seeded.project.projectId, seeded.chapter3.id).entityStates[0]
          ?.value,
      ).toBe('stable');

      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: seeded.character.id,
        knowledgeStatus: 'suspects',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter2.id,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      await value.continuity.setKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        informationKey: 'traitor-identity',
        characterId: seeded.character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        sourceLogicalBlockId: null,
        notes: '',
      });
      expect(
        listContinuityAt(value, seeded.project.projectId, seeded.chapter2.id).knowledgeStates,
      ).toEqual([]);
      const knowledgeHistory = value.continuity.list({
        projectId: seeded.project.projectId,
        query: 'traitor-identity',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }).knowledgeStates;
      expect(
        knowledgeHistory.find((state) => state.knowledgeStatus === 'suspects')?.validUntilChapterId,
      ).toBe(seeded.chapter2.id);

      await value.continuity.invalidateEntityState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        stateKey: 'health',
      });
      await value.continuity.invalidateKnowledgeState(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        characterId: seeded.character.id,
        informationKey: 'traitor-identity',
      });
      const current = value.continuity.list({
        projectId: seeded.project.projectId,
        query: '',
        includeHistory: false,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      });
      expect(current.entityStates).toEqual([]);
      expect(current.knowledgeStates).toEqual([]);
    } finally {
      await closeContinuityHarness(value);
    }
  });
});
