import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-11T07:10:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

interface SeededProject {
  readonly projectId: string;
  readonly workspacePath: string;
  readonly chapterId: string;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-lifecycle-'));
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

async function seedProject(
  harness: Harness,
  name: string,
  content: string,
): Promise<SeededProject> {
  const project = await harness.workspace.create(
    randomUUID(),
    { name, channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  await harness.drafts.applyPatch(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    operations: [
      {
        type: 'update',
        logicalBlockId: draft.blocks[0]!.logicalBlockId,
        expectedHash: draft.blocks[0]!.contentHash!,
        content,
      },
    ],
  });
  await harness.workspace.close(randomUUID(), project.projectId);
  return {
    projectId: project.projectId,
    workspacePath: project.workspacePath,
    chapterId: chapter.id,
  };
}

async function readDraftText(harness: Harness, project: SeededProject): Promise<string> {
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: project.chapterId,
  });
  return draft.blocks[0]!.text;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: project lifecycle ordering', () => {
  it('serializes rapid cross-project lifecycle commands without leaking active state', async () => {
    const harness = await createHarness();
    try {
      const first = await seedProject(harness, '快速切换甲', '甲作品正文');
      const second = await seedProject(harness, '快速切换乙', '乙作品正文');
      const queued: Array<Promise<{ readonly projectId: string }>> = [];
      const expectedProjectIds: string[] = [];

      for (let round = 0; round < 16; round += 1) {
        queued.push(
          harness.workspace.open(randomUUID(), { workspacePath: first.workspacePath }),
          harness.workspace.close(randomUUID(), first.projectId),
          harness.workspace.open(randomUUID(), { workspacePath: second.workspacePath }),
          harness.workspace.close(randomUUID(), second.projectId),
        );
        expectedProjectIds.push(
          first.projectId,
          first.projectId,
          second.projectId,
          second.projectId,
        );
      }

      const results = await Promise.all(queued);
      expect(results.map((result) => result.projectId)).toEqual(expectedProjectIds);
      expect(harness.workspace.activeProject).toBeNull();

      await harness.workspace.open(randomUUID(), { workspacePath: first.workspacePath });
      expect(await readDraftText(harness, first)).toBe('甲作品正文');
      await harness.workspace.close(randomUUID(), first.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: second.workspacePath });
      expect(await readDraftText(harness, second)).toBe('乙作品正文');
      await harness.workspace.close(randomUUID(), second.projectId);
    } finally {
      await closeHarness(harness);
    }
  });

  it('does not lose a draft write that entered the queue immediately before project close', async () => {
    const harness = await createHarness();
    try {
      const project = await seedProject(harness, '保存关闭交错', '初始正文');
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      let current = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: project.chapterId,
      });

      for (let round = 0; round < 12; round += 1) {
        const content = `保存关闭交错-${round.toString().padStart(2, '0')}`;
        const save = harness.drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: project.chapterId,
          draftId: current.draftId,
          baseRevision: current.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: current.blocks[0]!.logicalBlockId,
              expectedHash: current.blocks[0]!.contentHash!,
              content,
            },
          ],
        });
        const close = harness.workspace.close(randomUUID(), project.projectId);
        const [committed, closed] = await Promise.all([save, close]);

        expect(committed.blocks[0]!.text).toBe(content);
        expect(closed).toEqual({ projectId: project.projectId, closed: true });
        expect(harness.workspace.activeProject).toBeNull();

        const reopened = await harness.workspace.open(randomUUID(), {
          workspacePath: project.workspacePath,
        });
        expect(reopened.projectId).toBe(project.projectId);
        current = await harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: project.chapterId,
        });
        expect(current.blocks[0]!.text).toBe(content);
        expect(current.revision).toBe(committed.revision);
      }

      await harness.workspace.close(randomUUID(), project.projectId);
    } finally {
      await closeHarness(harness);
    }
  });
});
