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

describe('M11-03 unified AI proposals', () => {
  it('keeps a mixed proposal batch pending until one author command applies it atomically', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const evidence = [
        {
          kind: 'logicalBlock' as const,
          targetId: seeded.version.blocks[0]!.logicalBlockId,
          note: '正文明确给出本章后的设定变化',
        },
      ];
      const secondCharacterCatalog = await harness.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '柳青',
        aliases: [],
        summary: '北城同盟者。',
      });
      const secondCharacter = secondCharacterCatalog.entities.find(
        (entity) => entity.name === '柳青',
      )!;

      let catalog = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'provider_stub',
        proposals: [
          {
            proposalType: 'knowledge_state',
            characterId: seeded.character.id,
            informationKey: '北城密令',
            proposedKnowledge: {
              knowledgeStatus: 'knows',
              validUntilChapterId: null,
              notes: '沈砚亲眼看见密令。',
            },
            evidence,
            confidence: 0.96,
          },
          {
            proposalType: 'timeline_event',
            proposedEvent: {
              eventId: null,
              title: '沈砚抵达北城',
              startValue: '第一章夜',
              endValue: null,
              precision: 'approximate',
              locationId: seeded.north.id,
              description: '抵达后取得密令。',
              participantIds: [seeded.character.id],
              witnessIds: [],
              subjectIds: [seeded.character.id],
              dependencyIds: [],
            },
            evidence,
            confidence: 0.91,
          },
          {
            proposalType: 'character_relationship',
            fromCharacterId: seeded.character.id,
            toCharacterId: secondCharacter.id,
            proposedRelationship: {
              category: 'alliance',
              label: '盟友',
              validUntilChapterId: null,
            },
            evidence,
            confidence: 0.88,
          },
          {
            proposalType: 'entity_create',
            proposedEntity: {
              entityType: 'faction',
              name: '北城巡检司',
              aliases: ['巡检司'],
              summary: '负责北城巡防。',
            },
            evidence,
            confidence: 0.82,
          },
          {
            proposalType: 'canon_fact',
            entityId: seeded.character.id,
            factKey: '持有密令',
            proposedFact: {
              value: true,
              description: '第一章结尾取得。',
            },
            evidence,
            confidence: 0.94,
          },
        ],
      });

      expect(catalog.proposals).toHaveLength(5);
      expect(catalog.proposals.every((proposal) => proposal.status === 'pending')).toBe(true);
      expect(
        harness.continuity.list({
          projectId: seeded.project.projectId,
          query: '',
          includeHistory: true,
          includeArchivedEvents: true,
          effectiveAtChapterId: null,
        }),
      ).toMatchObject({ knowledgeStates: [], timelineEvents: [], relationships: [] });

      expect(() =>
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'ai',
          resolutions: [{ proposalId: catalog.proposals[0]!.id, decision: 'accept' }],
        }),
      ).toThrow(expect.objectContaining({ code: 'STATE_PROPOSAL_AUTHOR_REQUIRED' }));

      catalog = await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: catalog.proposals.map((proposal) => ({
          proposalId: proposal.id,
          decision: 'accept' as const,
        })),
      });

      expect(catalog.proposals.every((proposal) => proposal.status === 'accepted')).toBe(true);
      expect(catalog.batches[0]).toMatchObject({ proposalCount: 5, status: 'resolved' });
      const continuity = harness.continuity.list({
        projectId: seeded.project.projectId,
        query: '',
        includeHistory: true,
        includeArchivedEvents: true,
        effectiveAtChapterId: null,
      });
      expect(continuity.knowledgeStates[0]).toMatchObject({
        characterId: seeded.character.id,
        informationKey: '北城密令',
        knowledgeStatus: 'knows',
      });
      expect(continuity.timelineEvents[0]).toMatchObject({
        title: '沈砚抵达北城',
        participantIds: [seeded.character.id],
      });
      expect(continuity.relationships[0]).toMatchObject({
        fromCharacterId: seeded.character.id,
        toCharacterId: secondCharacter.id,
        category: 'alliance',
        label: '盟友',
      });
      expect(
        harness.canon.previewDelete({
          projectId: seeded.project.projectId,
          entityId: seeded.character.id,
        }),
      ).toMatchObject({
        canDelete: false,
        blockers: expect.arrayContaining([
          'Remove CharacterRelationship references before permanent deletion.',
        ]),
      });
      const canon = harness.canon.list({
        projectId: seeded.project.projectId,
        includeArchived: true,
      });
      expect(canon.entities.some((entity) => entity.name === '北城巡检司')).toBe(true);
      expect(
        canon.entities
          .find((entity) => entity.id === seeded.character.id)
          ?.facts.some((fact) => fact.factKey === '持有密令'),
      ).toBe(true);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
