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
const clock = { now: () => new Date('2026-07-16T16:00:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-draft-patch-'));
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

async function createOpenedDraft(harness: Harness) {
  const project = await harness.workspace.create(
    randomUUID(),
    { name: 'Patch项目', channel: '长篇' },
    harness.parent,
  );
  const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await harness.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  return { project, chapter, draft };
}

function patchLogCount(harness: Harness, projectId: string): number {
  return harness.workspace.readProject(projectId, (connection) =>
    Number(connection.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()?.count ?? 0),
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-05 atomic Draft Patch persistence', () => {
  it('applies ordered operations atomically and increments Revision once per batch', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createOpenedDraft(harness);
      const first = draft.blocks[0]!;
      expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);

      const firstBatch = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: 0,
        operations: [
          {
            type: 'insert',
            afterLogicalBlockId: first.logicalBlockId,
            block: { blockType: 'dialogue', content: '“新块。”', attributes: {} },
          },
          {
            type: 'update',
            logicalBlockId: first.logicalBlockId,
            expectedHash: first.contentHash!,
            content: '第一段\r\n第二行',
          },
        ],
      });

      expect(firstBatch.revision).toBe(1);
      expect(firstBatch.blocks.map((block) => [block.blockType, block.text])).toEqual([
        ['paragraph', '第一段\n第二行'],
        ['dialogue', '“新块。”'],
      ]);
      expect(firstBatch.blocks.every((block) => block.contentHash !== null)).toBe(true);

      const moved = firstBatch.blocks[1]!;
      const secondBatch = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: 1,
        operations: [
          {
            type: 'move',
            logicalBlockId: moved.logicalBlockId,
            expectedHash: moved.contentHash!,
            afterLogicalBlockId: null,
          },
          {
            type: 'delete',
            logicalBlockId: firstBatch.blocks[0]!.logicalBlockId,
            expectedHash: firstBatch.blocks[0]!.contentHash!,
          },
        ],
      });

      expect(secondBatch).toMatchObject({
        revision: 2,
        blocks: [
          {
            logicalBlockId: moved.logicalBlockId,
            blockType: 'dialogue',
            text: '“新块。”',
          },
        ],
      });
      expect(patchLogCount(harness, project.projectId)).toBe(2);
    } finally {
      await closeHarness(harness);
    }
  });

  it('rejects stale Revision and Hash conflicts without partial writes', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createOpenedDraft(harness);
      const initial = draft.blocks[0]!;

      await expect(
        harness.drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: initial.logicalBlockId,
              expectedHash: 'f'.repeat(64),
              content: '不得覆盖',
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_BLOCK_HASH_CONFLICT' });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(draft);

      const committed = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            content: '已提交',
          },
        ],
      });

      await expect(
        harness.drafts.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseRevision: draft.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: initial.logicalBlockId,
              expectedHash: committed.blocks[0]!.contentHash!,
              content: '旧Revision不得覆盖',
            },
          ],
        }),
      ).rejects.toMatchObject<DraftServiceError>({ code: 'DRAFT_REVISION_CONFLICT' });
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(committed);
      expect(patchLogCount(harness, project.projectId)).toBe(1);
    } finally {
      await closeHarness(harness);
    }
  });

  it('persists requestId idempotency across reopen and rolls back injected failures', async () => {
    const harness = await createHarness();
    try {
      const { project, chapter, draft } = await createOpenedDraft(harness);
      const initial = draft.blocks[0]!;
      const requestId = randomUUID();
      const input = {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        operations: [
          {
            type: 'update' as const,
            logicalBlockId: initial.logicalBlockId,
            expectedHash: initial.contentHash!,
            content: '只提交一次',
          },
        ],
      };
      const committed = await harness.drafts.applyPatch(requestId, input);
      expect(committed.revision).toBe(1);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      await expect(harness.drafts.applyPatch(requestId, input)).resolves.toEqual(committed);
      expect(patchLogCount(harness, project.projectId)).toBe(1);

      const interrupted = new DraftService(harness.workspace, {
        clock,
        faultInjector: (stage) => {
          if (stage === 'after-patch-persist') throw new Error('injected-patch-failure');
        },
      });
      await expect(
        interrupted.applyPatch(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
          draftId: draft.draftId,
          baseRevision: committed.revision,
          operations: [
            {
              type: 'update',
              logicalBlockId: committed.blocks[0]!.logicalBlockId,
              expectedHash: committed.blocks[0]!.contentHash!,
              content: '事务失败不得落库',
            },
          ],
        }),
      ).rejects.toThrow('injected-patch-failure');
      await expect(
        harness.drafts.open(randomUUID(), {
          projectId: project.projectId,
          chapterId: chapter.id,
        }),
      ).resolves.toEqual(committed);
      expect(patchLogCount(harness, project.projectId)).toBe(1);
    } finally {
      await closeHarness(harness);
    }
  });
});
