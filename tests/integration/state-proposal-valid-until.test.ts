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

  it('rejects an interval end before its proposal chapter and rolls back the whole resolution', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const version2 = await finalizeChapter(
        harness,
        seeded.project.projectId,
        seeded.chapter2.id,
        '第二章定稿',
      );
      const generated = await harness.proposals.generate(randomUUID(), {
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
            validUntilChapterId: seeded.chapter1.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: version2.blocks[0]!.logicalBlockId,
                note: '第二章受伤',
              },
            ],
            confidence: 0.8,
          },
        ],
      });
      const proposal = generated.proposals.find((entry) => entry.status === 'pending')!;

      await expect(
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          resolutions: [{ proposalId: proposal.id, decision: 'accept' }],
        }),
      ).rejects.toThrow();

      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter2.id).entityStates,
      ).toEqual([]);
      expect(
        harness.proposals
          .list({
            projectId: seeded.project.projectId,
            chapterId: seeded.chapter2.id,
            includeResolved: true,
          })
          .proposals.find((entry) => entry.id === proposal.id),
      ).toMatchObject({ status: 'pending', validUntilChapterId: seeded.chapter1.id });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
