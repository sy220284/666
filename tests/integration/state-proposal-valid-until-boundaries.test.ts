import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  listContinuityAt,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('M3-06 finite StateProposal interval boundaries', () => {
  it('preserves validUntilChapterId when the author edits the accepted value', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
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
            validUntilChapterId: seeded.chapter3.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: seeded.version.blocks[0]!.logicalBlockId,
                note: '作者编辑接受有限期状态',
              },
            ],
            confidence: 0.9,
          },
        ],
      });
      const proposal = generated.proposals.find((entry) => entry.status === 'pending')!;

      const resolved = await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [
          {
            proposalId: proposal.id,
            decision: 'edit_accept',
            editedValue: { locationId: seeded.north.id },
          },
        ],
      });

      expect(resolved.proposals.find((entry) => entry.id === proposal.id)).toMatchObject({
        status: 'edited',
        resolvedValue: { locationId: seeded.north.id },
        validUntilChapterId: seeded.chapter3.id,
      });
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates[0],
      ).toMatchObject({
        value: { locationId: seeded.north.id },
        validUntilChapterId: seeded.chapter3.id,
      });
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter3.id).entityStates,
      ).toEqual([]);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects a validUntilChapterId that belongs to another project', async () => {
    const harness = await createContinuityHarness();
    const otherHarness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const otherSeeded = await seedContinuity(otherHarness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });

      await expect(
        harness.proposals.generate(randomUUID(), {
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
              validUntilChapterId: otherSeeded.chapter2.id,
              evidence: [
                {
                  kind: 'logicalBlock',
                  targetId: seeded.version.blocks[0]!.logicalBlockId,
                  note: '跨项目章节不能成为区间终点',
                },
              ],
              confidence: 0.9,
            },
          ],
        }),
      ).rejects.toThrow('active Chapter was not found');
      expect(
        harness.proposals.list({
          projectId: seeded.project.projectId,
          chapterId: null,
          includeResolved: true,
        }).proposals,
      ).toEqual([]);
    } finally {
      await Promise.all([closeContinuityHarness(harness), closeContinuityHarness(otherHarness)]);
    }
  });
});
