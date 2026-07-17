import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService, type DraftServiceError } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T10:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-lock-guard-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const appRuntime = await openAppRuntime({
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
  return {
    parent,
    appRuntime,
    workspace,
    structure: new ProjectStructureService(workspace, { clock }),
    drafts: new DraftService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createOpenedDraft(harness: Harness) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name: '锁定保护项目', channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  return { project, chapter, draft };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M2-01 Core LockGuard', () => {
  it('rejects update, delete and move until the block is explicitly unlocked', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createOpenedDraft(harness);
      const initial = draft.blocks[0]!;
      const withSecond = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'insert',
            afterLogicalBlockId: initial.logicalBlockId,
            block: { blockType: 'paragraph', content: '第二段', attributes: {} },
          },
          {
            type: 'set-lock',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            locked: true,
          },
        ],
      });
      const locked = withSecond.blocks[0]!;

      for (const operation of [
        {
          type: 'update' as const,
          logicalBlockId: locked.logicalBlockId,
          expectedHash: locked.contentHash!,
          content: '越权修改',
        },
        {
          type: 'delete' as const,
          logicalBlockId: locked.logicalBlockId,
          expectedHash: locked.contentHash!,
        },
        {
          type: 'move' as const,
          logicalBlockId: locked.logicalBlockId,
          expectedHash: locked.contentHash!,
          afterLogicalBlockId: withSecond.blocks[1]!.logicalBlockId,
        },
      ]) {
        await expect(
          harness.drafts.applyPatch(randomUUID(), {
            projectId: project.projectId,
            chapterId: chapter.id,
            draftId: draft.draftId,
            baseRevision: withSecond.revision,
            operations: [operation],
          }),
        ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_PATCH_INVALID' });
      }

      const unlockedAndUpdated = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: withSecond.revision,
        operations: [
          {
            type: 'set-lock',
            logicalBlockId: locked.logicalBlockId,
            expectedHash: locked.contentHash!,
            locked: false,
          },
          {
            type: 'update',
            logicalBlockId: locked.logicalBlockId,
            expectedHash: locked.contentHash!,
            content: '显式解锁后修改',
          },
        ],
      });
      expect(unlockedAndUpdated.blocks[0]).toMatchObject({
        text: '显式解锁后修改',
        locked: false,
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('blocks direct snapshot deletion, modification and movement of locked blocks', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createOpenedDraft(harness);
      const initial = draft.blocks[0]!;
      const prepared = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'insert',
            afterLogicalBlockId: initial.logicalBlockId,
            block: { blockType: 'paragraph', content: '相邻块', attributes: {} },
          },
          {
            type: 'set-lock',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            locked: true,
          },
        ],
      });
      const locked = prepared.blocks[0]!;
      const neighbor = prepared.blocks[1]!;

      await expect(
        harness.drafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          blocks: [
            {
              clientBlockId: neighbor.logicalBlockId,
              logicalBlockId: neighbor.logicalBlockId,
              blockType: neighbor.blockType,
              text: neighbor.text,
              attributes: neighbor.attributes,
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_PATCH_INVALID' });

      await expect(
        harness.drafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          blocks: [
            {
              clientBlockId: locked.logicalBlockId,
              logicalBlockId: locked.logicalBlockId,
              blockType: locked.blockType,
              text: '快照越权修改',
              attributes: locked.attributes,
            },
            {
              clientBlockId: neighbor.logicalBlockId,
              logicalBlockId: neighbor.logicalBlockId,
              blockType: neighbor.blockType,
              text: neighbor.text,
              attributes: neighbor.attributes,
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_PATCH_INVALID' });

      await expect(
        harness.drafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          blocks: [
            {
              clientBlockId: neighbor.logicalBlockId,
              logicalBlockId: neighbor.logicalBlockId,
              blockType: neighbor.blockType,
              text: neighbor.text,
              attributes: neighbor.attributes,
            },
            {
              clientBlockId: locked.logicalBlockId,
              logicalBlockId: locked.logicalBlockId,
              blockType: locked.blockType,
              text: locked.text,
              attributes: locked.attributes,
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_PATCH_INVALID' });
    } finally {
      await closeHarness(harness);
    }
  });
});
