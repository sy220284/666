import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import { HardenedConstraintPackageService } from '../../packages/core-service/src/constraint-package-hardening.js';
import { SceneBeatService } from '../../packages/core-service/src/scene-beat.js';
import { serializeConstraintPackage } from '../../packages/prompts/src/constraint-package-serializer.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
  type ContinuityHarness,
} from './continuity-hardening-harness.js';

const openHarnesses: ContinuityHarness[] = [];

afterEach(async () => {
  await Promise.all(openHarnesses.splice(0).map(closeContinuityHarness));
  await cleanupContinuityHarnesses();
});

async function harness() {
  const value = await createContinuityHarness();
  openHarnesses.push(value);
  return value;
}

async function saveDraftText(
  value: ContinuityHarness,
  projectId: string,
  chapterId: string,
  text: string,
) {
  const opened = await value.drafts.open(randomUUID(), { projectId, chapterId });
  return value.drafts.saveSnapshot(randomUUID(), {
    projectId,
    chapterId,
    draftId: opened.draftId,
    blocks: [
      {
        clientBlockId: opened.blocks[0]?.logicalBlockId ?? randomUUID(),
        logicalBlockId: opened.blocks[0]?.logicalBlockId ?? null,
        blockType: 'paragraph',
        text,
        attributes: {},
      },
    ],
  });
}

describe('M10-15 constraint authority policy', () => {
  it('keeps current drafts for writing tasks but excludes them from Final-only tasks', async () => {
    const value = await harness();
    const seeded = await seedContinuity(value);
    await saveDraftText(value, seeded.project.projectId, seeded.chapter1.id, '当前稿中的后续修改');
    const constraints = new HardenedConstraintPackageService(value.workspace);

    const chapter = constraints.build({
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      taskType: 'chapter',
      maxSupplementalResults: 0,
    });
    expect(
      Object.values(chapter.sections)
        .flat()
        .some((source) => source.sourceType === 'current_draft'),
    ).toBe(true);

    for (const taskType of ['validate', 'state_extract'] as const) {
      const result = constraints.build({
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        taskType,
        maxSupplementalResults: 0,
      });
      expect(
        Object.values(result.sections)
          .flat()
          .some((source) => source.sourceType === 'current_draft'),
      ).toBe(false);
    }
  });

  it('preserves archived entities only when the target SceneBeat still references them', async () => {
    const value = await harness();
    const seeded = await seedContinuity(value);
    const beats = new SceneBeatService(value.workspace, { clock: hardeningClock });
    const referenced = seeded.character;
    const unreferenced = (
      await value.canon.create(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '未引用归档人物',
        aliases: [],
        summary: '不应进入当前章节约束',
      })
    ).entities.find((entity) => entity.name === '未引用归档人物')!;

    await value.canon.setFact(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      entityId: referenced.id,
      factKey: 'weapon',
      value: '旧刀',
      description: '历史场景仍依赖的设定',
      sourceType: 'author',
      sourceId: null,
    });
    await beats.create(randomUUID(), {
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      plotNodeId: null,
      title: '归档人物仍在场',
      goal: '',
      coreConflict: '',
      expectedResult: '',
      beatType: 'setup',
      wordTargetPercent: 10,
      required: true,
      characterIds: [referenced.id],
      locationIds: [],
    });
    await value.canon.archive(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      entityId: referenced.id,
    });
    await value.canon.archive(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      entityId: unreferenced.id,
    });

    const result = new HardenedConstraintPackageService(value.workspace).build({
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      taskType: 'chapter',
      maxSupplementalResults: 0,
    });
    const sources = Object.values(result.sections).flat();
    const archivedEntity = sources.find(
      (source) => source.sourceType === 'entity' && source.entityId === referenced.id,
    );
    const archivedCanon = sources.find(
      (source) => source.sourceType === 'canon_fact' && source.entityId === referenced.id,
    );

    expect(archivedEntity?.content).toContain('archived_reference');
    expect(archivedCanon?.content).toContain('archived_reference');
    expect(sources.some((source) => source.entityId === unreferenced.id)).toBe(false);
  });

  it('projects future foreshadowing to upcoming and binds temporal provenance into the hash', async () => {
    const value = await harness();
    const seeded = await seedContinuity(value);
    const constraints = new HardenedConstraintPackageService(value.workspace);
    let catalog = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '未来才种下的线索',
      description: '同一内容，只改变故事时间来源',
      revealFromChapterId: null,
      revealByChapterId: null,
      chapterLinks: [],
      relations: [],
    });
    const item = catalog.foreshadowings.find((entry) => entry.title === '未来才种下的线索')!;

    const before = constraints.build({
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      taskType: 'chapter',
      maxSupplementalResults: 0,
    });
    const beforeSource = before.sections.P2.find(
      (source) => source.sourceType === 'foreshadowing' && source.sourceId === item.id,
    )!;
    expect(beforeSource.temporalStatus).toBe('current');

    catalog = await value.narrative.saveForeshadowing(randomUUID(), {
      projectId: seeded.project.projectId,
      authority: 'author',
      foreshadowingId: item.id,
      title: item.title,
      description: item.description,
      revealFromChapterId: item.revealFromChapterId,
      revealByChapterId: item.revealByChapterId,
      chapterLinks: [{ chapterId: seeded.chapter3.id, role: 'plant' }],
      relations: [],
    });
    expect(catalog.foreshadowings.find((entry) => entry.id === item.id)).toBeDefined();

    const after = constraints.build({
      projectId: seeded.project.projectId,
      chapterId: seeded.chapter1.id,
      taskType: 'chapter',
      maxSupplementalResults: 0,
    });
    const afterSource = after.sections.P2.find(
      (source) => source.sourceType === 'foreshadowing' && source.sourceId === item.id,
    )!;
    expect(afterSource.temporalStatus).toBe('upcoming');
    expect(afterSource.contentHash).toBe(beforeSource.contentHash);
    expect(after.constraintHash).not.toBe(before.constraintHash);
    expect(serializeConstraintPackage(after)).toContain('[foreshadowing][upcoming]');
    expect(serializeConstraintPackage(after)).toContain('temporalStatus: upcoming');
  });
});
