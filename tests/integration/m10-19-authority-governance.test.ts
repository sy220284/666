import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ImportExportService } from '../../packages/core-service/src/import-export.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { SearchToolsService } from '../../packages/core-service/src/search-tools.js';
import {
  authoritativeSemanticDigest,
  semanticInvalidationDigest,
} from '../../packages/core-service/src/validation/validation-model.js';
import {
  cleanupContinuityHarnesses,
  closeContinuityHarness,
  createContinuityHarness,
  hardeningClock,
  seedContinuity,
} from './continuity-hardening-harness.js';

afterEach(cleanupContinuityHarnesses);

describe('M10-19 authority governance', () => {
  it('rejects Replace and Version mutations after their parent structure enters trash', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const initial = seeded.draft.blocks[0]!;
      const edited = await harness.drafts.applyPatch(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        draftId: seeded.draft.draftId,
        baseRevision: seeded.draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            content: '回收站前旧名',
          },
        ],
      });
      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: path.join(harness.parent, 'm10-19-replace-backups'),
        clock: hardeningClock,
      });
      const tools = new SearchToolsService(harness.workspace, recovery, () => randomUUID(), {
        clock: hardeningClock,
      });
      const plan = await tools.previewReplace(randomUUID(), {
        projectId: seeded.project.projectId,
        query: '旧名',
        replacement: '新名',
        matchCase: true,
        maxMatches: 100,
      });
      const volumeId = harness.structure.list(seeded.project.projectId).volumes[0]!.id;
      await harness.structure.deleteVolume(randomUUID(), {
        projectId: seeded.project.projectId,
        volumeId,
      });

      await expect(
        tools.applyReplace(randomUUID(), {
          projectId: seeded.project.projectId,
          planId: plan.planId,
        }),
      ).rejects.toMatchObject({ code: 'SEARCH_REPLACE_STALE' });
      await expect(
        harness.versions.create(randomUUID(), {
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          draftId: edited.draftId,
          baseRevision: edited.revision,
          title: '回收站内版本',
        }),
      ).rejects.toMatchObject({ code: 'VERSION_DRAFT_NOT_FOUND' });
      await expect(
        harness.versions.setFinal(randomUUID(), {
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          versionId: seeded.version.versionId,
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CHAPTER_MISMATCH' });
      await expect(
        harness.versions.restore(randomUUID(), {
          projectId: seeded.project.projectId,
          chapterId: seeded.chapter1.id,
          versionId: seeded.version.versionId,
          expectedDraftId: edited.draftId,
          expectedRevision: edited.revision,
        }),
      ).rejects.toMatchObject({ code: 'VERSION_CHAPTER_MISMATCH' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('uses one Arc hit policy for author transitions and StateProposal acceptance', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const event = (
        await harness.continuity.saveTimelineEvent(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          eventId: null,
          title: '第三章事件',
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
      let planning = await harness.narrative.saveCharacterArc(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        arcId: null,
        characterId: seeded.character.id,
        title: '统一命中策略',
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
        title: '等待第三章',
        description: '',
        sortIndex: 1,
        plannedChapterId: seeded.chapter2.id,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [event.id],
      });
      const milestone = planning.characterArcs[0]!.milestones[0]!;
      const proposalCatalog = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'arc_milestone',
            arcMilestoneId: milestone.id,
            proposedStatus: 'hit',
            actualChapterId: seeded.chapter2.id,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: seeded.version.blocks[0]!.logicalBlockId,
                note: '尝试提前命中',
              },
            ],
            confidence: 0.9,
          },
        ],
      });
      const proposal = proposalCatalog.proposals[0]!;

      await expect(
        harness.narrative.transitionArcMilestone(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          milestoneId: milestone.id,
          status: 'hit',
          actualChapterId: seeded.chapter2.id,
        }),
      ).rejects.toMatchObject({ code: 'NARRATIVE_CONFLICT' });
      await expect(
        harness.proposals.resolve(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          resolutions: [{ proposalId: proposal.id, decision: 'accept' }],
        }),
      ).rejects.toMatchObject({ code: 'STATE_PROPOSAL_CONFLICT' });
      expect(
        harness.narrative.list({
          projectId: seeded.project.projectId,
          query: '',
          includeResolved: true,
          referenceChapterId: seeded.chapter2.id,
        }).characterArcs[0]!.milestones[0],
      ).toMatchObject({ status: 'planned', actualChapterId: null });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('derives Entity permanent-delete blockers from actual RESTRICT foreign keys', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      await harness.versions.setFinal(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        versionId: seeded.version.versionId,
      });
      const transient = (
        await harness.canon.create(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityType: 'character',
          name: '被建议历史引用的人物',
          aliases: [],
          summary: '',
        })
      ).entities.find((entity) => entity.name === '被建议历史引用的人物')!;
      const catalog = await harness.proposals.generate(randomUUID(), {
        projectId: seeded.project.projectId,
        chapterId: seeded.chapter1.id,
        sourceVersionId: seeded.version.versionId,
        source: 'rule',
        proposals: [
          {
            proposalType: 'entity_state',
            entityId: transient.id,
            stateKey: 'location',
            proposedValue: seeded.south.id,
            validUntilChapterId: null,
            evidence: [
              {
                kind: 'logicalBlock',
                targetId: seeded.version.blocks[0]!.logicalBlockId,
                note: '保留建议历史',
              },
            ],
            confidence: 0.8,
          },
        ],
      });
      await harness.proposals.resolve(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        resolutions: [{ proposalId: catalog.proposals[0]!.id, decision: 'reject' }],
      });
      await harness.canon.archive(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: transient.id,
      });

      const preview = harness.canon.previewDelete({
        projectId: seeded.project.projectId,
        entityId: transient.id,
      });
      expect(preview.canDelete).toBe(false);
      expect(preview.blockers).toContain(
        'StateProposal history retains this Entity; permanent deletion is unavailable while that history exists.',
      );
      await expect(
        harness.canon.delete(randomUUID(), {
          projectId: seeded.project.projectId,
          authority: 'author',
          entityId: transient.id,
          confirmName: transient.name,
        }),
      ).rejects.toMatchObject({ code: 'ENTITY_REFERENCED' });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('replays Import commit from a durable receipt after service recreation', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const importDirectory = path.join(harness.parent, 'm10-19-imports');
      const backupDirectory = path.join(harness.parent, 'm10-19-import-backups');
      await mkdir(importDirectory, { recursive: true });
      const sourcePath = path.join(importDirectory, '跨重启幂等.md');
      await writeFile(sourcePath, '# 第一章\n\n只导入一次。\n', 'utf8');
      const firstRecovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: backupDirectory,
        clock: hardeningClock,
      });
      const firstTransfer = new ImportExportService(harness.workspace, firstRecovery, {
        clock: hardeningClock,
      });
      const plan = await firstTransfer.previewImport(
        { projectId: seeded.project.projectId },
        sourcePath,
      );
      const requestId = randomUUID();
      const payload = {
        projectId: seeded.project.projectId,
        planId: plan.planId,
        volumeTitle: '跨重启导入',
        chapters: plan.chapters,
      };
      const first = await firstTransfer.commitImport(requestId, payload);

      const restartedRecovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: backupDirectory,
        clock: hardeningClock,
      });
      const restartedTransfer = new ImportExportService(harness.workspace, restartedRecovery, {
        clock: hardeningClock,
      });
      await expect(restartedTransfer.commitImport(requestId, payload)).resolves.toEqual(first);
      await expect(
        restartedTransfer.commitImport(requestId, { ...payload, volumeTitle: '冲突名称' }),
      ).rejects.toMatchObject({ code: 'IMPORT_COMMIT_FAILED' });

      expect(
        harness.workspace.readProject(seeded.project.projectId, (database) => ({
          volumes: Number(
            database
              .prepare("SELECT COUNT(*) AS count FROM volumes WHERE title = '跨重启导入'")
              .get()?.count ?? 0,
          ),
          receipts: Number(
            database
              .prepare(
                "SELECT COUNT(*) AS count FROM command_receipts WHERE command_name = 'import.commit'",
              )
              .get()?.count ?? 0,
          ),
        })),
      ).toEqual({ volumes: 1, receipts: 1 });
    } finally {
      await closeContinuityHarness(harness);
    }
  });

  it('maintains semantic revision incrementally instead of hashing whole authoritative tables', async () => {
    const harness = await createContinuityHarness();
    try {
      const seeded = await seedContinuity(harness);
      const before = harness.workspace.readProject(seeded.project.projectId, (database) => ({
        revision: Number(
          (
            database
              .prepare('SELECT revision FROM semantic_revision WHERE project_id = ?')
              .get(seeded.project.projectId) as { revision: number | bigint }
          ).revision,
        ),
        authority: authoritativeSemanticDigest(database, seeded.project.projectId),
        invalidation: semanticInvalidationDigest(
          database,
          seeded.project.projectId,
          seeded.chapter1.id,
        ),
      }));
      await harness.canon.setFact(randomUUID(), {
        projectId: seeded.project.projectId,
        authority: 'author',
        entityId: seeded.character.id,
        factKey: 'm10-19-semantic-revision',
        value: 'changed',
        description: '',
        sourceType: 'author',
        sourceId: null,
      });
      const after = harness.workspace.readProject(seeded.project.projectId, (database) => ({
        revision: Number(
          (
            database
              .prepare('SELECT revision FROM semantic_revision WHERE project_id = ?')
              .get(seeded.project.projectId) as { revision: number | bigint }
          ).revision,
        ),
        authority: authoritativeSemanticDigest(database, seeded.project.projectId),
        invalidation: semanticInvalidationDigest(
          database,
          seeded.project.projectId,
          seeded.chapter1.id,
        ),
      }));
      expect(after.revision).toBeGreaterThan(before.revision);
      expect(after.authority).not.toBe(before.authority);
      expect(after.invalidation).not.toBe(before.invalidation);
    } finally {
      await closeContinuityHarness(harness);
    }
  });
});
