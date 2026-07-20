import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ContinuityService } from '../../packages/core-service/src/continuity.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { EntityCanonService } from '../../packages/core-service/src/entity-canon.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-20T06:10:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M3-04 logical block knowledge anchors', () => {
  it('keeps an accepted knowledge anchor readable after its Draft block is deleted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuity-block-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const appRuntime: AppRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    try {
      const structureService = new ProjectStructureService(workspace, { clock });
      const drafts = new DraftService(workspace, { clock });
      const canon = new EntityCanonService(workspace, { clock });
      const continuity = new ContinuityService(workspace, { clock });
      const project = await workspace.create(
        randomUUID(),
        { name: '逻辑块来源测试', channel: '长篇' },
        parent,
      );
      const chapter = structureService.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const source = draft.blocks[0]!;
      const catalog = await canon.create(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        entityType: 'character',
        name: '沈砚',
        aliases: [],
        summary: '',
      });
      const character = catalog.entities[0]!;
      await continuity.setKnowledgeState(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        informationKey: 'hidden-door',
        characterId: character.id,
        knowledgeStatus: 'knows',
        validFromChapterId: chapter.id,
        validUntilChapterId: null,
        sourceVersionId: null,
        sourceLogicalBlockId: source.logicalBlockId,
        notes: '来源块随后被删除',
      });

      const withSecondBlock = await drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'insert',
            afterLogicalBlockId: source.logicalBlockId,
            block: { blockType: 'paragraph', content: '保留块', attributes: {} },
          },
        ],
      });
      await drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: withSecondBlock.revision,
        operations: [
          {
            type: 'delete',
            logicalBlockId: source.logicalBlockId,
            expectedHash: source.contentHash!,
          },
        ],
      });

      const knowledge = continuity.list({
        projectId: project.projectId,
        query: 'hidden-door',
        includeHistory: true,
        includeArchivedEvents: false,
        effectiveAtChapterId: null,
      }).knowledgeStates[0];
      expect(knowledge).toMatchObject({
        informationKey: 'hidden-door',
        knowledgeStatus: 'knows',
        sourceLogicalBlockId: source.logicalBlockId,
        recordStatus: 'current',
      });
      const reopened = await drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(reopened.blocks.some((block) => block.logicalBlockId === source.logicalBlockId)).toBe(
        false,
      );
    } finally {
      await workspace.shutdown();
      await appRuntime.close();
    }
  });
});
