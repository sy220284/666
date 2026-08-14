import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
} from './continuity-hardening-harness.js';

const evidence = (versionId: string) => [
  { kind: 'version' as const, targetId: versionId, note: '' },
];

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('character relationship history coverage', () => {
  it('closes historical relationships at the earlier replacement boundary', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const catalog = await harness.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '陆沉',
        aliases: [],
        summary: '',
      });
      const other = catalog.entities.find((entity) => entity.name === '陆沉')!;
      const common = {
        projectId: seeded.project.projectId,
        authority: 'author' as const,
        fromCharacterId: seeded.character.id,
        toCharacterId: other.id,
        category: 'alliance' as const,
        label: '盟友',
        sourceVersionId: seeded.version.versionId,
        evidence: evidence(seeded.version.versionId),
      };

      let result = await harness.continuity.setCharacterRelationship(randomUUID(), {
        ...common,
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter4.id,
      });
      const first = result.relationships.find(
        (relationship) => relationship.recordStatus === 'current',
      )!;

      result = await harness.continuity.setCharacterRelationship(randomUUID(), {
        ...common,
        validFromChapterId: seeded.chapter2.id,
        validUntilChapterId: null,
      });
      const historicalFirst = result.relationships.find(
        (relationship) => relationship.id === first.id,
      )!;
      expect(historicalFirst).toMatchObject({
        recordStatus: 'historical',
        validUntilChapterId: seeded.chapter2.id,
      });

      const second = result.relationships.find(
        (relationship) => relationship.recordStatus === 'current',
      )!;
      result = await harness.continuity.setCharacterRelationship(randomUUID(), {
        ...common,
        validFromChapterId: seeded.chapter3.id,
        validUntilChapterId: null,
      });
      expect(
        result.relationships.find((relationship) => relationship.id === second.id),
      ).toMatchObject({
        recordStatus: 'historical',
        validUntilChapterId: seeded.chapter3.id,
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects historical backfill behind the current relationship start', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const catalog = await harness.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '陆沉',
        aliases: [],
        summary: '',
      });
      const other = catalog.entities.find((entity) => entity.name === '陆沉')!;
      const common = {
        projectId: seeded.project.projectId,
        authority: 'author' as const,
        fromCharacterId: seeded.character.id,
        toCharacterId: other.id,
        category: 'rivalry' as const,
        label: '竞争者',
        sourceVersionId: seeded.version.versionId,
        evidence: evidence(seeded.version.versionId),
        validUntilChapterId: null,
      };

      await harness.continuity.setCharacterRelationship(randomUUID(), {
        ...common,
        validFromChapterId: seeded.chapter3.id,
      });
      await expect(
        harness.continuity.setCharacterRelationship(randomUUID(), {
          ...common,
          validFromChapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_CONFLICT' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('invalidates only the current relationship and rejects a repeated invalidation', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const catalog = await harness.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '陆沉',
        aliases: [],
        summary: '',
      });
      const other = catalog.entities.find((entity) => entity.name === '陆沉')!;
      const created = await harness.continuity.setCharacterRelationship(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        fromCharacterId: seeded.character.id,
        toCharacterId: other.id,
        category: 'friendship',
        label: '旧友',
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: null,
        sourceVersionId: seeded.version.versionId,
        evidence: evidence(seeded.version.versionId),
      });
      const relationship = created.relationships.find(
        (candidate) => candidate.recordStatus === 'current',
      )!;

      const invalidated = await harness.continuity.invalidateCharacterRelationship(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        relationshipId: relationship.id,
      });
      expect(
        invalidated.relationships.find((candidate) => candidate.id === relationship.id),
      ).toMatchObject({
        recordStatus: 'invalid',
      });
      await expect(
        harness.continuity.invalidateCharacterRelationship(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          relationshipId: relationship.id,
        }),
      ).rejects.toMatchObject({ code: 'CONTINUITY_NOT_FOUND' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
