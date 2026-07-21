import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  listContinuityAt,
  seedContinuity,
  type ContinuityHarness,
} from './continuity-hardening-harness.js';

async function finalizeChapter(
  harness: ContinuityHarness,
  projectId: string,
  chapterId: string,
  title: string,
) {
  const draft = await harness.drafts.open(randomUUID(), { projectId, chapterId });
  const version = await harness.versions.create(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title,
  });
  await harness.versions.setFinal(randomUUID(), {
    projectId,
    chapterId,
    versionId: version.versionId,
  });
  return version;
}

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('M3-06 finite StateProposal intervals', () => {
  it('preserves a validUntilChapterId through proposal review and the authoritative EntityState', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      const generated = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'location',
            proposedValue: { locationId: seeded.south.id },
            validUntilChapterId: seeded.chapter2.id,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '第一章进入南城' }],
            confidence: 0.95,
          },
        ],
      });
      const proposal = generated.proposals.find((entry) => entry.status === 'pending')!;
      expect(proposal).toMatchObject({
        proposalType: 'entity_state',
        validUntilChapterId: seeded.chapter2.id,
      });

      await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [{ proposalId: proposal.id, decision: 'accept' }],
      });

      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates[0],
      ).toMatchObject({
        entityId: seeded.character.id,
        stateKey: 'location',
        value: { locationId: seeded.south.id },
        validFromChapterId: seeded.chapter1.id,
        validUntilChapterId: seeded.chapter2.id,
      });
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter2.id).entityStates,
      ).toEqual([]);
      expect(
        harness.proposals.readSnapshot({
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
        }).content.entityStates[0],
      ).toMatchObject({
        entityId: seeded.character.id,
        stateKey: 'location',
        value: { locationId: seeded.south.id },
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects same-chapter, reverse, and unknown interval ends before proposal persistence', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const version2 = await finalizeChapter(
        harness,
        seeded.project.projectId,
        seeded.chapter2.id,
        '第二章定稿',
      );
      for (const [chapterId, version, validUntilChapterId] of [
        [seeded.chapter1.id, seeded.version, seeded.chapter1.id],
        [seeded.chapter2.id, version2, seeded.chapter1.id],
        [seeded.chapter1.id, seeded.version, randomUUID()],
      ] as const) {
        await expect(
          harness.proposals.generate(randomUUID(), {
            projectId: seeded.project.projectId,
            chapterId,
            sourceVersionId: version.versionId,
            source: 'rule',
            proposals: [
              {
                proposalType: 'entity_state',
                entityId: seeded.character.id,
                stateKey: `invalid-${validUntilChapterId}`,
                proposedValue: 'invalid',
                validUntilChapterId,
                evidence: [
                  {
                    kind: 'logicalBlock',
                    targetId: version.blocks[0]!.logicalBlockId,
                    note: '非法区间',
                  },
                ],
                confidence: 0.8,
              },
            ],
          }),
        ).rejects.toThrow();
      }
      expect(
        harness.proposals.list({
          projectId: seeded.project.projectId,
          chapterId: null,
          includeResolved: true,
        }).proposals,
      ).toEqual([]);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('revalidates interval ordering at acceptance and rolls back earlier writes in the batch', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const version2 = await finalizeChapter(
        harness,
        seeded.project.projectId,
        seeded.chapter2.id,
        '第二章定稿',
      );
      const firstCatalog = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'location',
            proposedValue: { locationId: seeded.south.id },
            validUntilChapterId: seeded.chapter4.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: seeded.version.blocks[0]!.logicalBlockId,
                note: '第一章位置',
              },
            ],
            confidence: 0.9,
          },
        ],
      });
      const first = firstCatalog.proposals.find((entry) => entry.chapterId === seeded.chapter1.id)!;
      const secondCatalog = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter2.id,
        sourceVersionId: version2.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'injury',
            proposedValue: '轻伤',
            validUntilChapterId: seeded.chapter3.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: version2.blocks[0]!.logicalBlockId,
                note: '第二章受伤',
              },
            ],
            confidence: 0.85,
          },
        ],
      });
      const second = secondCatalog.proposals.find(
        (entry) => entry.chapterId === seeded.chapter2.id,
      )!;
      const volumeId = harness.structure.list(seeded.project.projectId).volumes[0]!.id;
      await harness.structure.moveChapter(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter3.id,
        targetVolumeId: volumeId,
        placement: { kind: 'before', siblingId: seeded.chapter2.id },
      });

      await expect(
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          resolutions: [
            { proposalId: first.id, decision: 'accept' },
            { proposalId: second.id, decision: 'accept' },
          ],
        }),
      ).rejects.toThrow();

      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates,
      ).toEqual([]);
      const proposals = harness.proposals.list({
        projectId: seeded.project.projectId,
        chapterId: null,
        includeResolved: true,
      }).proposals;
      expect(proposals.find((entry) => entry.id === first.id)?.status).toBe('pending');
      expect(proposals.find((entry) => entry.id === second.id)?.status).toBe('pending');
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
