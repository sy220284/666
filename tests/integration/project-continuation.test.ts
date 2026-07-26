import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectContinuationService } from '../../packages/core-service/src/project-continuation.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T03:10:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
  readonly continuation: ProjectContinuationService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-continuation-'));
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
    continuation: new ProjectContinuationService(workspace, { clock }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 project continuation', () => {
  it('persists a minimal verified writing anchor across restart', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '跨重启续写', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const block = draft.blocks[0]!;
      await harness.continuation.save(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        draftRevision: draft.revision,
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash!,
        cursorOffset: 0,
        scrollTop: 320,
        panel: 'editor',
      });

      expect(harness.continuation.get(project.projectId)).toMatchObject({
        status: 'ready',
        projectId: project.projectId,
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        draftId: draft.draftId,
        draftRevision: draft.revision,
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        cursorOffset: 0,
        scrollTop: 320,
        panel: 'editor',
        updatedAt: clock.now().toISOString(),
      });

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      expect(harness.continuation.get(project.projectId)).toMatchObject({
        status: 'ready',
        chapterId: chapter.id,
        logicalBlockId: block.logicalBlockId,
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('marks a changed logical block stale and rejects a cross-project write', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '续写失效保护', channel: '悬疑' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const draft = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const block = draft.blocks[0]!;
      const input = {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        draftRevision: draft.revision,
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash!,
        cursorOffset: 0,
        scrollTop: 0,
        panel: 'editor' as const,
      };
      await harness.continuation.save(randomUUID(), input);
      await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: block.logicalBlockId,
            expectedHash: block.contentHash!,
            content: '正文已经变化。',
          },
        ],
      });

      expect(harness.continuation.get(project.projectId)).toMatchObject({
        status: 'stale',
        reason: 'block-changed',
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      await expect(
        harness.continuation.save(randomUUID(), {
          ...input,
          projectId: randomUUID(),
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_ID_MISMATCH' });
    } finally {
      await closeHarness(harness);
    }
  });
});
