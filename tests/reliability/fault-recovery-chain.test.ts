import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { FaultInjectionError } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-11T07:40:00.000Z') };

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly restoreParent: string;
  readonly backupRootDirectory: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly structure: ProjectStructureService;
  readonly drafts: DraftService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-fault-chain-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
  const backupRootDirectory = path.join(root, 'operation-recovery');
  await Promise.all([
    mkdir(parent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
  ]);
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
    restoreParent,
    backupRootDirectory,
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
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: system fault recovery chains', () => {
  it('rolls back a post-persist Draft fault and safely retries the same requestId', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '事务故障恢复', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const baseline = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const requestId = randomUUID();
      const operation = {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: baseline.draftId,
        baseRevision: baseline.revision,
        operations: [
          {
            type: 'update' as const,
            logicalBlockId: baseline.blocks[0]!.logicalBlockId,
            expectedHash: baseline.blocks[0]!.contentHash!,
            content: '这次写入必须先失败再安全重试',
          },
        ],
      };
      const faultyDrafts = new DraftService(harness.workspace, {
        clock,
        faultInjector: (stage) => {
          if (stage === 'after-patch-persist') {
            throw new FaultInjectionError(
              'transaction-interrupted',
              'FAULT_INJECTED_AFTER_PATCH_PERSIST',
            );
          }
        },
      });

      await expect(faultyDrafts.applyPatch(requestId, operation)).rejects.toThrow(
        'FAULT_INJECTED_AFTER_PATCH_PERSIST',
      );

      const afterFailure = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(afterFailure.revision).toBe(baseline.revision);
      expect(afterFailure.blocks).toEqual(baseline.blocks);
      expect(
        harness.workspace.readProject(project.projectId, (database) => ({
          patchLogCount: Number(
            database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()?.count ?? 0,
          ),
          mutationCount: Number(
            database.prepare('SELECT COUNT(*) AS count FROM writing_mutations').get()?.count ?? 0,
          ),
        })),
      ).toEqual({ patchLogCount: 0, mutationCount: 0 });

      const retried = await harness.drafts.applyPatch(requestId, operation);
      expect(retried.revision).toBe(baseline.revision + 1);
      expect(retried.blocks[0]!.text).toBe('这次写入必须先失败再安全重试');
      expect(
        harness.workspace.readProject(project.projectId, (database) => ({
          patchLogCount: Number(
            database.prepare('SELECT COUNT(*) AS count FROM draft_patch_log').get()?.count ?? 0,
          ),
          mutationCount: Number(
            database.prepare('SELECT COUNT(*) AS count FROM writing_mutations').get()?.count ?? 0,
          ),
        })),
      ).toEqual({ patchLogCount: 1, mutationCount: 1 });
    } finally {
      await closeHarness(harness);
    }
  });

  it('retries the same restore intent after a transient copied-database fault without residue', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.workspace.create(
        randomUUID(),
        { name: '恢复二次故障', channel: '长篇' },
        harness.parent,
      );
      const chapter = harness.structure.list(project.projectId).volumes[0]!.chapters[0]!;
      const baseline = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      const committed = await harness.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: baseline.draftId,
        baseRevision: baseline.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: baseline.blocks[0]!.logicalBlockId,
            expectedHash: baseline.blocks[0]!.contentHash!,
            content: '恢复链权威正文',
          },
        ],
      });
      let injectRestoreFault = true;
      const recovery = new RecoveryService(harness.workspace, {
        backupRootDirectory: harness.backupRootDirectory,
        clock,
        afterRestoreCopied: () => {
          if (!injectRestoreFault) return;
          injectRestoreFault = false;
          throw new FaultInjectionError(
            'transaction-interrupted',
            'FAULT_INJECTED_TRANSIENT_RESTORE_COPY',
          );
        },
      });
      const checkpoint = await recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'replace',
      });
      const restoreRequestId = randomUUID();
      const restoreInput = { projectId: project.projectId, backupId: checkpoint.backupId };

      await expect(
        recovery.restoreCheckpoint(restoreRequestId, restoreInput, harness.restoreParent),
      ).rejects.toMatchObject({ code: 'RESTORE_VERIFY_FAILED' });
      expect(harness.workspace.activeProject?.projectId).toBe(project.projectId);
      expect(await readdir(harness.restoreParent)).toEqual([]);
      const sourceAfterFailure = await harness.drafts.open(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
      });
      expect(sourceAfterFailure.revision).toBe(committed.revision);
      expect(sourceAfterFailure.blocks[0]!.text).toBe('恢复链权威正文');

      const restored = await recovery.restoreCheckpoint(
        restoreRequestId,
        restoreInput,
        harness.restoreParent,
      );
      expect(restored).toMatchObject({
        projectId: restoreRequestId,
        sourceProjectId: project.projectId,
        backupId: checkpoint.backupId,
        databaseMode: 'read-write',
        compatibility: 'current',
      });
      expect(await readdir(harness.restoreParent)).toHaveLength(1);
      expect(harness.workspace.activeProject?.projectId).toBe(project.projectId);

      await harness.workspace.close(randomUUID(), project.projectId);
      await harness.workspace.open(randomUUID(), { workspacePath: restored.workspacePath });
      const restoredChapter = harness.structure.list(restored.projectId).volumes[0]!.chapters[0]!;
      const restoredDraft = await harness.drafts.open(randomUUID(), {
        projectId: restored.projectId,
        chapterId: restoredChapter.id,
      });
      expect(restoredDraft.blocks[0]!.text).toBe('恢复链权威正文');
    } finally {
      await closeHarness(harness);
    }
  });
});
