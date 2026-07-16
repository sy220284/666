import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService, type DraftServiceError } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T13:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-draft-'));
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
    root,
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Draft and DraftBlock persistence', () => {
  it('persists four block types and rebuilds the same document after reopening', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '正文项目', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(opened).toMatchObject({
        projectId: project.projectId,
        chapterId: chapter.id,
        status: 'active',
        revision: 0,
        blocks: [expect.objectContaining({ blockType: 'paragraph', text: '' })],
      });
      const originalLogicalId = opened.blocks[0]!.logicalBlockId;

      const saved = await harness.drafts.saveSnapshot(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: opened.draftId,
        blocks: [
          {
            clientBlockId: 'client-heading',
            logicalBlockId: originalLogicalId,
            blockType: 'heading',
            text: '雨夜',
            attributes: { headingLevel: 2 },
          },
          {
            clientBlockId: 'client-dialogue',
            logicalBlockId: null,
            blockType: 'dialogue',
            text: '“谁在那里？”',
            attributes: {},
          },
          {
            clientBlockId: 'client-separator',
            logicalBlockId: null,
            blockType: 'separator',
            text: '',
            attributes: {},
          },
          {
            clientBlockId: 'client-paragraph',
            logicalBlockId: null,
            blockType: 'paragraph',
            text: '风从站台尽头穿过。',
            attributes: {},
          },
        ],
      });
      expect(saved.blocks.map((block) => block.blockType)).toEqual([
        'heading',
        'dialogue',
        'separator',
        'paragraph',
      ]);
      expect(saved.blocks.map((block) => block.orderKey)).toEqual(['1024', '2048', '3072', '4096']);
      expect(saved.blocks[0]!.logicalBlockId).toBe(originalLogicalId);
      expect(new Set(saved.blocks.map((block) => block.logicalBlockId)).size).toBe(4);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(saved);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects foreign logical IDs atomically and rejects writes in read-only mode', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '正文边界', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const opened = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      await expect(
        harness.drafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: opened.draftId,
          blocks: [
            {
              clientBlockId: 'foreign',
              logicalBlockId: randomUUID(),
              blockType: 'paragraph',
              text: '不得写入',
              attributes: {},
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_BLOCK_NOT_FOUND' });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(opened);

      const interruptedDrafts = new DraftService(harness.workspace, {
        clock,
        faultInjector: () => {
          throw new Error('injected-after-block-delete');
        },
      });
      await expect(
        interruptedDrafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: opened.draftId,
          blocks: [
            {
              clientBlockId: opened.blocks[0]!.logicalBlockId,
              logicalBlockId: opened.blocks[0]!.logicalBlockId,
              blockType: 'paragraph',
              text: '事务中断不得丢失原正文',
              attributes: {},
            },
          ],
        }),
      ).rejects.toThrow('injected-after-block-delete');
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(opened);

      await harness.workspace.close(randomUUID(), project.projectId);
      const raw = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'));
      raw
        .prepare(
          `INSERT INTO schema_migrations(version, name, checksum, applied_at, app_version)
           VALUES(99, 'future', 'future-checksum', ?, '9.0.0')`,
        )
        .run(clock.now().toISOString());
      raw.close();
      await expect(
        harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath }),
      ).resolves.toMatchObject({ databaseMode: 'read-only', compatibility: 'future-schema' });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(opened);
      await expect(
        harness.drafts.saveSnapshot(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: opened.draftId,
          blocks: [
            {
              clientBlockId: opened.blocks[0]!.logicalBlockId,
              logicalBlockId: opened.blocks[0]!.logicalBlockId,
              blockType: 'paragraph',
              text: '只读禁止',
              attributes: {},
            },
          ],
        }),
      ).rejects.toBeTruthy();
    } finally {
      await closeHarness(harness);
    }
  });
});
