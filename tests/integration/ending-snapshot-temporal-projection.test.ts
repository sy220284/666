import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  seedContinuity,
  type ContinuityHarness,
} from './continuity-hardening-harness.js';

const openHarnesses: ContinuityHarness[] = [];

afterEach(async () => {
  await Promise.all(openHarnesses.splice(0).map(closeContinuityHarness));
  await cleanupContinuityHarnesses();
});

async function finalVersionFor(
  value: ContinuityHarness,
  projectId: string,
  chapterId: string,
  title: string,
) {
  const draft = await value.drafts.open(randomUUID(), { projectId, chapterId });
  const version = await value.versions.create(randomUUID(), {
    projectId,
    chapterId,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    title,
  });
  await value.versions.setFinal(randomUUID(), {
    projectId,
    chapterId,
    versionId: version.versionId,
  });
  return version;
}

describe('EndingSnapshot temporal projection', () => {
  it('derives foreshadowing events and ArcMilestones at the target chapter', async () => {
    const value = await createContinuityHarness();
    openHarnesses.push(value);
    const seeded = await seedContinuity(value);
    await value.versions.setFinal(randomUUID(), {
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      versionId: seeded.version.versionId,
    });
    const chapter2Version = await finalVersionFor(
      value,
      seeded.project.projectId,
      seeded.chapter2.id,
      '第二章定稿',
    );
    const chapter3Version = await finalVersionFor(
      value,
      seeded.project.projectId,
      seeded.chapter3.id,
      '第三章定稿',
    );

    let planning = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '未种下的未来计划',
      description: '',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [],
      relations: [],
    });
    const futurePlan = planning.foreshadowings.find((item) => item.title === '未种下的未来计划')!;

    planning = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '分章推进的伏笔',
      description: '',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [
        { chapterId: seeded.chapter2.id, role: 'plant' },
        { chapterId: seeded.chapter3.id, role: 'reinforce' },
      ],
      relations: [],
    });
    const stagedForeshadowing = planning.foreshadowings.find(
      (item) => item.title === '分章推进的伏笔',
    )!;
    await value.narrative.transitionForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: stagedForeshadowing.id,
      status: 'planted',
    });
    await value.narrative.transitionForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: stagedForeshadowing.id,
      status: 'reinforced',
    });

    planning = await value.narrative.saveCharacterArc(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      arcId: null,
      characterId: seeded.character.id,
      title: '成长弧',
      arcType: 'growth',
      customType: null,
      status: 'active',
      authorIntent: '',
    });
    const arc = planning.characterArcs.find((item) => item.title === '成长弧')!;
    planning = await value.narrative.saveArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: null,
      arcId: arc.id,
      title: '第二章命中',
      description: '',
      sortIndex: 0,
      plannedChapterId: seeded.chapter2.id,
      dependencyMilestoneIds: [],
      dependencyTimelineEventIds: [],
    });
    const hitMilestone = planning.characterArcs
      .find((item) => item.id === arc.id)!
      .milestones.find((item) => item.title === '第二章命中')!;
    await value.narrative.transitionArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: hitMilestone.id,
      status: 'hit',
      actualChapterId: seeded.chapter2.id,
    });

    planning = await value.narrative.saveArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: null,
      arcId: arc.id,
      title: '第三章跳过',
      description: '',
      sortIndex: 1,
      plannedChapterId: seeded.chapter3.id,
      dependencyMilestoneIds: [],
      dependencyTimelineEventIds: [],
    });
    const skippedMilestone = planning.characterArcs
      .find((item) => item.id === arc.id)!
      .milestones.find((item) => item.title === '第三章跳过')!;
    await value.narrative.transitionArcMilestone(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      milestoneId: skippedMilestone.id,
      status: 'skipped',
      actualChapterId: null,
    });

    const first = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter1.id,
      sourceVersionId: seeded.version.versionId,
    });
    const second = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter2.id,
      sourceVersionId: chapter2Version.versionId,
    });
    const third = await value.proposals.refreshSnapshot(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      chapterId: seeded.chapter3.id,
      sourceVersionId: chapter3Version.versionId,
    });

    expect(first.content.foreshadowings).toEqual([]);
    expect(first.content.arcMilestones).toEqual([]);
    expect(second.content.foreshadowings).toEqual([
      { id: stagedForeshadowing.id, status: 'planted' },
    ]);
    expect(second.content.arcMilestones).toEqual([
      { id: hitMilestone.id, status: 'hit', actualChapterId: seeded.chapter2.id },
    ]);
    expect(third.content.foreshadowings).toEqual([
      { id: stagedForeshadowing.id, status: 'reinforced' },
    ]);
    expect(third.content.arcMilestones).toEqual(
      [
        { id: hitMilestone.id, status: 'hit', actualChapterId: seeded.chapter2.id },
        { id: skippedMilestone.id, status: 'skipped', actualChapterId: null },
      ].sort((left, right) => left.id.localeCompare(right.id, 'en')),
    );
    expect(first.content.foreshadowings).not.toContainEqual(
      expect.objectContaining({ id: futurePlan.id }),
    );
  });
});
