import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ImportExportService } from '../../packages/core-service/src/import-export.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(async () => {
  await cleanupContinuityHarnesses();
});

describe('M10-18 import, Entity delete and Arc Timeline dependency consistency', () => {
  it('replays one complete Import commit without duplicating checkpoint or persisted IDs', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const root = path.dirname(harness.parent);
      const importDirectory = path.join(root, 'm10-18-imports');
      await mkdir(importDirectory, { recursive: true });
      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: path.join(root, 'm10-18-operation-recovery'),
        clock: hardeningClock,
      });
      const transfer = new ImportExportService(harness.workspace, recovery, {
        clock: hardeningClock,
      });
      const sourcePath = path.join(importDirectory, '幂等导入.md');
      await writeFile(sourcePath, '# 导入章\n\n只有这一份。\n', 'utf8');
      const plan = await transfer.previewImport(
        { projectId: seeded.project.projectId },
        sourcePath,
      );
      const requestId = randomUUID();
      const payload = {
        projectId: seeded.project.projectId,
        planId: plan.planId,
        volumeTitle: '幂等导入',
        chapters: plan.chapters,
      };

      const [first, concurrentReplay] = await Promise.all([
        transfer.commitImport(requestId, payload),
        transfer.commitImport(requestId, payload),
      ]);
      const settledReplay = await transfer.commitImport(requestId, payload);
      expect(concurrentReplay).toEqual(first);
      expect(settledReplay).toEqual(first);
      expect(
        harness.workspace.readProject(seeded.project.projectId, (database) => ({
          importedVolumes: Number(
            database
              .prepare("SELECT COUNT(*) AS total FROM volumes WHERE title = '幂等导入'")
              .get()?.total ?? 0,
          ),
          importedVersions: Number(
            database
              .prepare("SELECT COUNT(*) AS total FROM versions WHERE label = 'import'")
              .get()?.total ?? 0,
          ),
          checkpoints: Number(
            database.prepare('SELECT COUNT(*) AS total FROM backup_records').get()?.total ?? 0,
          ),
        })),
      ).toEqual({ importedVolumes: 1, importedVersions: 1, checkpoints: 1 });
      await expect(
        transfer.commitImport(requestId, { ...payload, volumeTitle: '冲突导入' }),
      ).rejects.toMatchObject({ code: 'IMPORT_COMMIT_FAILED' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('recomputes permanent Entity blockers inside the delete transaction across Timeline and Arc references', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.continuity.saveTimelineEvent(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        eventId: null,
        title: '南城会合',
        startValue: '2026-07-20',
        endValue: null,
        precision: 'day',
        chapterId: seeded.chapter2.id,
        locationId: seeded.south.id,
        description: '',
        participantIds: [seeded.character.id],
        witnessIds: [],
        subjectIds: [],
        dependencyIds: [],
      });
      await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '主角弧光',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '',
      });
      await harness.canon.archive(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.south.id,
      });
      await harness.canon.archive(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
      });

      expect(
        harness.canon.previewDelete({
          projectId: seeded.project.projectId,
          entityId: seeded.south.id,
        }).blockers,
      ).toContain('Remove Timeline location references before permanent deletion.');
      const characterBlockers = harness.canon.previewDelete({
        projectId: seeded.project.projectId,
        entityId: seeded.character.id,
      }).blockers;
      expect(characterBlockers).toContain(
        'Remove Timeline entity references before permanent deletion.',
      );
      expect(characterBlockers).toContain('Remove Character Arc references before permanent deletion.');

      const transient = (
        await harness.canon.create(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '临时角色',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.name === '临时角色')!;
      await harness.canon.setFact(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: transient.id,
        factKey: 'temporary-note',
        value: '可级联',
        description: '',
        sourceType: 'author',
        sourceId: null,
      });
      await harness.canon.archive(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: transient.id,
      });
      expect(
        harness.canon.previewDelete({
          projectId: seeded.project.projectId,
          entityId: transient.id,
        }),
      ).toMatchObject({ canDelete: true, canonFactCount: 1 });

      const injectedArcId = randomUUID();
      await harness.workspace.writeProject(
        randomUUID(),
        seeded.project.projectId,
        (database) => {
          const now = hardeningClock.now().toISOString();
          database
            .prepare(
              `INSERT INTO character_arcs(
                 id, project_id, character_id, title, arc_type, custom_type,
                 status, author_intent, created_at, updated_at
               ) VALUES(?, ?, ?, '竞态注入', 'growth', NULL, 'planned', '', ?, ?)`,
            )
            .run(injectedArcId, seeded.project.projectId, transient.id, now, now);
        },
        { operation: 'test.inject-character-arc', entityId: transient.id },
      );
      await expect(
        harness.canon.delete(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: transient.id,
          confirmName: transient.name,
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_REFERENCED' });
      expect(
        harness.canon.list({
          projectId: seeded.project.projectId,
          includeArchived: true,
        }).entities.some((entity) => entity.id === transient.id),
      ).toBe(true);

      await harness.workspace.writeProject(
        randomUUID(),
        seeded.project.projectId,
        (database) => {
          database.prepare('DELETE FROM character_arcs WHERE id = ?').run(injectedArcId);
        },
        { operation: 'test.remove-character-arc', entityId: transient.id },
      );
      await expect(
        harness.canon.delete(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: transient.id,
          confirmName: transient.name,
        }),
      ).resolves.toMatchObject({ deleted: true });
      expect(
        harness.workspace.readProject(seeded.project.projectId, (database) =>
          Number(
            database
              .prepare('SELECT COUNT(*) AS total FROM canon_facts WHERE entity_id = ?')
              .get(transient.id)?.total ?? 0,
          ),
        ),
      ).toBe(0);
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('blocks Arc milestones until Timeline dependencies are anchored and not later than the hit chapter', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      let catalog = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '时间线约束弧光',
        arcType: 'growth',
        customType: null,
        status: 'active',
        authorIntent: '',
      });
      const arc = catalog.characterArcs[0]!;
      const lateEvent = (
        await harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '第三章才发生',
          startValue: '2026-07-22',
          endValue: null,
          precision: 'day',
          chapterId: seeded.chapter3.id,
          locationId: seeded.south.id,
          description: '',
          participantIds: [seeded.character.id],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        })
      ).timelineEvents[0]!;
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '等待事件',
        description: '',
        sortIndex: 1,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [lateEvent.id],
      });
      const lateMilestone = catalog.characterArcs[0]!.milestones[0]!;
      const atChapter2 = harness.narrative.list({
        projectId: seeded.project.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: seeded.chapter2.id,
      });
      expect(atChapter2.characterArcs[0]!.milestones[0]).toMatchObject({ attention: 'blocked' });
      expect(atChapter2.characterArcs[0]!.milestones[0]!.warnings).toContain(
        'Waiting for timeline event: 第三章才发生',
      );
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: lateMilestone.id,
          status: 'hit',
          actualChapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: lateMilestone.id,
          status: 'hit',
          actualChapterId: seeded.chapter3.id,
        }),
      ).resolves.toBeDefined();

      const unanchoredEvent = (
        await harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '未锚定事件',
          startValue: '2026-07-23',
          endValue: null,
          precision: 'day',
          chapterId: null,
          locationId: null,
          description: '',
          participantIds: [],
          witnessIds: [],
          subjectIds: [],
          dependencyIds: [],
        })
      ).timelineEvents.find((event) => event.title === '未锚定事件')!;
      catalog = await harness.narrative.saveArcMilestone(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        milestoneId: null,
        arcId: arc.id,
        title: '等待锚定',
        description: '',
        sortIndex: 2,
        plannedChapterId: seeded.chapter4.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [unanchoredEvent.id],
      });
      const unanchoredMilestone = catalog.characterArcs[0]!.milestones.find(
        (milestone) => milestone.title === '等待锚定',
      )!;
      const atChapter4 = harness.narrative.list({
        projectId: seeded.project.projectId,
        query: '',
        includeResolved: true,
        referenceChapterId: seeded.chapter4.id,
      });
      const blocked = atChapter4.characterArcs[0]!.milestones.find(
        (milestone) => milestone.id === unanchoredMilestone.id,
      )!;
      expect(blocked).toMatchObject({ attention: 'blocked' });
      expect(blocked.warnings).toContain('Timeline event has no chapter anchor: 未锚定事件');
      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: unanchoredMilestone.id,
          status: 'hit',
          actualChapterId: seeded.chapter4.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
