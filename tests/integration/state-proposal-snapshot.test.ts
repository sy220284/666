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

describe('M3-06 StateProposal and EndingSnapshot', () => {
  it('keeps pending proposals non-authoritative, applies edited and accepted decisions atomically, and creates a traceable snapshot', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      let planning = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '承担弧光',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '',
      });
      const arc = planning.characterArcs[0]!;
      planning = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '主动救人',
        description: '',
        sortIndex: 10,
        plannedChapterId: seeded.chapter1.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      const milestone = planning.characterArcs[0]!.milestones[0]!;
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      let proposals = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'provider_stub',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'location',
            proposedValue: { locationId: seeded.south.id },
            validUntilChapterId: null,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '走入南城' }],
            confidence: 0.94,
          },
          {
            proposalType: 'arc_milestone',
            arcMilestoneId: milestone.id,
            proposedStatus: 'hit',
            actualChapterId: seeded.chapter1.id,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '主动救人' }],
            confidence: 0.86,
          },
        ],
      });
      expect(proposals.proposals).toHaveLength(2);
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates,
      ).toEqual([]);
      expect(
        harness.narrative.list({
          projectId: seeded.project.projectId,
          query: '',
          includeResolved: true,
          referenceChapterId: seeded.chapter1.id,
        }).characterArcs[0]!.milestones[0],
      ).toMatchObject({
        status: 'planned',
        confirmationSource: null,
      });

      const entityProposal = proposals.proposals.find(
        (proposal) => proposal.proposalType === 'entity_state',
      )!;
      const milestoneProposal = proposals.proposals.find(
        (proposal) => proposal.proposalType === 'arc_milestone',
      )!;
      proposals = await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [
          {
            proposalId: entityProposal.id,
            decision: 'edit_accept',
            editedValue: { locationId: seeded.north.id },
          },
          { proposalId: milestoneProposal.id, decision: 'accept' },
        ],
      });
      expect(
        proposals.proposals.find((proposal) => proposal.id === entityProposal.id),
      ).toMatchObject({ status: 'edited', resolvedValue: { locationId: seeded.north.id } });
      expect(
        proposals.proposals.find((proposal) => proposal.id === milestoneProposal.id),
      ).toMatchObject({ status: 'accepted' });
      expect(
        proposals.invalidations.some(
          (item) =>
            item.changeType === 'entity_state' && item.targetChapterId === seeded.chapter1.id,
        ),
      ).toBe(true);
      expect(
        proposals.invalidations.some(
          (item) =>
            item.changeType === 'arc_milestone' && item.targetChapterId === seeded.chapter1.id,
        ),
      ).toBe(true);
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates[0],
      ).toMatchObject({
        entityId: seeded.character.id,
        stateKey: 'location',
        value: { locationId: seeded.north.id },
        sourceVersionId: seeded.version.versionId,
      });
      expect(
        harness.narrative.list({
          projectId: seeded.project.projectId,
          query: '',
          includeResolved: true,
          referenceChapterId: seeded.chapter1.id,
        }).characterArcs[0]!.milestones[0],
      ).toMatchObject({
        status: 'hit',
        actualChapterId: seeded.chapter1.id,
        confirmationSource: 'state_proposal',
      });
      const snapshot = harness.proposals.readSnapshot({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
      });
      expect(snapshot).toMatchObject({
        snapshotSource: 'snapshot',
        snapshot: {
          sourceVersionId: seeded.version.versionId,
          status: 'valid',
        },
      });
      expect(snapshot.content.entityStates[0]).toMatchObject({
        entityId: seeded.character.id,
        value: { locationId: seeded.north.id },
      });
      expect(snapshot.content.arcMilestones[0]).toMatchObject({
        id: milestone.id,
        status: 'hit',
      });

      const rejected = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'injury',
            proposedValue: '受伤',
            validUntilChapterId: null,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '' }],
            confidence: 0.72,
          },
        ],
      });
      const injury = rejected.proposals.find(
        (proposal) => proposal.status === 'pending' && proposal.stateKey === 'injury',
      )!;
      await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [{ proposalId: injury.id, decision: 'reject' }],
      });
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates.some(
          (state) => state.stateKey === 'injury',
        ),
      ).toBe(false);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('rejects missing or foreign body evidence, accepts empty extraction, and rolls back a failed batch', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      expect(() =>
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
              proposedValue: seeded.south.id,
              validUntilChapterId: null,
              evidence: [],
              confidence: 0.8,
            },
          ],
        }),
      ).toThrow();
      const empty = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [],
      });
      expect(empty.proposals).toEqual([]);

      let planning = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '依赖弧光',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '',
      });
      const arc = planning.characterArcs[0]!;
      planning = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '前置节点',
        description: '',
        sortIndex: 1,
        plannedChapterId: seeded.chapter1.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      });
      const dependency = planning.characterArcs[0]!.milestones[0]!;
      planning = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '受阻节点',
        description: '',
        sortIndex: 2,
        plannedChapterId: seeded.chapter1.id,
        dependencyMilestoneIds: [dependency.id],
        dependencyTimelineEventIds: [],
      });
      const blocked = planning.characterArcs[0]!.milestones.find(
        (milestone) => milestone.title === '受阻节点',
      )!;
      const blockId = seeded.version.blocks[0]!.logicalBlockId;
      const generated = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'provider_stub',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: seeded.character.id,
            stateKey: 'location',
            proposedValue: seeded.south.id,
            validUntilChapterId: null,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '' }],
            confidence: 0.9,
          },
          {
            proposalType: 'arc_milestone',
            arcMilestoneId: blocked.id,
            proposedStatus: 'hit',
            actualChapterId: seeded.chapter1.id,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '' }],
            confidence: 0.9,
          },
        ],
      });
      const entity = generated.proposals.find(
        (proposal) => proposal.proposalType === 'entity_state',
      )!;
      const arcProposal = generated.proposals.find(
        (proposal) => proposal.proposalType === 'arc_milestone',
      )!;
      await expect(
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          resolutions: [
            { proposalId: entity.id, decision: 'accept' },
            { proposalId: arcProposal.id, decision: 'accept' },
          ],
        }),
      ).rejects.toMatchObject({ code: 'STATE_PROPOSAL_CONFLICT' });
      expect(
        listContinuityAt(harness, seeded.project.projectId, seeded.chapter1.id).entityStates,
      ).toEqual([]);
      expect(
        harness.proposals
          .list({
            projectId: seeded.project.projectId,
            chapterId: seeded.chapter1.id,
            includeResolved: true,
          })
          .proposals.filter((proposal) => proposal.status === 'pending'),
      ).toHaveLength(2);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('keeps proposals from an obsolete Final Version rejectable but not acceptable', async () => {
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
            stateKey: 'health',
            proposedValue: 'injured',
            validUntilChapterId: null,
            evidence: [{ kind: 'logicalBlock', targetId: blockId, note: '' }],
            confidence: 0.9,
          },
        ],
      });
      const proposal = generated.proposals[0]!;
      const replacement = await finalizeChapter(
        harness,
        seeded.project.projectId,
        seeded.chapter1.id,
        '第一章新定稿',
      );
      expect(replacement.versionId).not.toBe(seeded.version.versionId);

      const stale = harness.proposals
        .list({
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          includeResolved: true,
        })
        .proposals.find((item) => item.id === proposal.id);
      expect(stale).toMatchObject({
        status: 'pending',
        freshness: 'stale',
        actionability: 'reject_only',
      });
      await expect(
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          resolutions: [{ proposalId: proposal.id, decision: 'accept' }],
        }),
      ).rejects.toMatchObject({ code: 'STATE_PROPOSAL_CONFLICT' });
      const rejected = await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [{ proposalId: proposal.id, decision: 'reject' }],
      });
      expect(rejected.proposals.find((item) => item.id === proposal.id)).toMatchObject({
        status: 'rejected',
        freshness: 'stale',
        actionability: 'reject_only',
      });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('records semantic invalidation without taking ownership of snapshot stale state', async () => {
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
      const version3 = await finalizeChapter(
        harness,
        seeded.project.projectId,
        seeded.chapter3.id,
        '第三章定稿',
      );
      await harness.proposals.refreshSnapshot(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
      });
      await harness.proposals.refreshSnapshot(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        chapterId: seeded.chapter2.id,
        sourceVersionId: version2.versionId,
      });
      await harness.proposals.refreshSnapshot(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        chapterId: seeded.chapter3.id,
        sourceVersionId: version3.versionId,
      });

      const prose = await harness.proposals.invalidateDerived(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        sourceChapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        changeTypes: ['prose'],
      });
      expect(prose).toEqual({ invalidatedSnapshotIds: [], queuedScopes: [] });

      const semantic = await harness.proposals.invalidateDerived(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        sourceChapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        changeTypes: ['entity_state', 'event', 'timeline', 'foreshadowing'],
      });
      expect(semantic.invalidatedSnapshotIds).toEqual([]);
      expect(new Set(semantic.queuedScopes)).toEqual(
        new Set(['continuity', 'timeline', 'foreshadowing', 'validation', 'cache']),
      );
      for (const targetChapterId of [
        seeded.chapter1.id,
        seeded.chapter2.id,
        seeded.chapter3.id,
      ]) {
        expect(
          harness.proposals.readSnapshot({
            projectId: seeded.project.projectId,
            chapterId: targetChapterId,
          }).snapshotSource,
        ).toBe('snapshot');
      }
      const catalog = harness.proposals.list({
        projectId: seeded.project.projectId,
        chapterId: null,
        includeResolved: true,
      });
      expect(catalog.snapshots.filter((snapshot) => snapshot.status === 'stale')).toHaveLength(0);
      expect(catalog.invalidations.some((item) => item.changeType === 'foreshadowing')).toBe(true);
      expect(catalog.invalidations.some((item) => item.changeType === 'timeline')).toBe(true);
      expect(
        catalog.invalidations.some(
          (item) =>
            item.changeType === 'entity_state' && item.targetChapterId === seeded.chapter1.id,
        ),
      ).toBe(true);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
