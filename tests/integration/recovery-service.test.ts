import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { DraftService } from '../../packages/core-service/src/draft.js';
import { ProjectStructureService } from '../../packages/core-service/src/project-structure.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { VersionService } from '../../packages/core-service/src/version.js';
import { corruptSqliteHeader } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T01:00:00.000Z') };

async function harness(
  options: ConstructorParameters<typeof RecoveryService>[1] = { backupRootDirectory: '' },
) {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
  const exportDirectory = path.join(root, 'exports');
  const backupRootDirectory = options.backupRootDirectory || path.join(root, 'operation-recovery');
  await Promise.all([
    mkdir(parent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
    mkdir(exportDirectory, { recursive: true }),
  ]);
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
  const structure = new ProjectStructureService(workspace, { clock });
  const drafts = new DraftService(workspace, { clock });
  const versions = new VersionService(workspace, { clock });
  const recovery = new RecoveryService(workspace, {
    ...options,
    backupRootDirectory,
    clock,
  });
  return {
    root,
    parent,
    restoreParent,
    exportDirectory,
    backupRootDirectory,
    appRuntime,
    workspace,
    structure,
    drafts,
    versions,
    recovery,
  };
}

async function seed(value: Awaited<ReturnType<typeof harness>>) {
  const project = await value.workspace.create(
    randomUUID(),
    { name: '恢复基础项目', channel: '长篇' },
    value.parent,
  );
  const chapter = value.structure.list(project.projectId).volumes[0]!.chapters[0]!;
  const draft = await value.drafts.open(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
  });
  const edited = await value.drafts.applyPatch(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    operations: [
      {
        type: 'update',
        logicalBlockId: draft.blocks[0]!.logicalBlockId,
        expectedHash: draft.blocks[0]!.contentHash!,
        content: '恢复点正文',
      },
    ],
  });
  const version = await value.versions.create(randomUUID(), {
    projectId: project.projectId,
    chapterId: chapter.id,
    draftId: edited.draftId,
    baseRevision: edited.revision,
    title: '恢复点版本',
  });
  return { project, chapter, edited, version };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-08 operation checkpoints and restored copies', () => {
  it('creates a verified online checkpoint, exports a Version and restores a new writable project', async () => {
    const value = await harness();
    try {
      const { project, chapter, edited, version } = await seed(value);
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'replace',
      });
      expect(checkpoint.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(
        value.workspace.readProject(project.projectId, (database) =>
          Number(
            database.prepare('SELECT COUNT(*) AS count FROM backup_records').get()?.count ?? 0,
          ),
        ),
      ).toBe(1);
      expect(await readdir(path.join(value.backupRootDirectory, project.projectId))).toEqual(
        expect.arrayContaining([checkpoint.backupFileName, `${checkpoint.backupId}.json`]),
      );

      const changed = await value.drafts.applyPatch(randomUUID(), {
        projectId: project.projectId,
        chapterId: chapter.id,
        draftId: edited.draftId,
        baseRevision: edited.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: edited.blocks[0]!.logicalBlockId,
            expectedHash: edited.blocks[0]!.contentHash!,
            content: '恢复点之后的修改',
          },
        ],
      });
      expect(changed.blocks[0]!.text).toBe('恢复点之后的修改');

      const exported = await value.recovery.exportVersion(
        { projectId: project.projectId, versionId: version.versionId },
        value.exportDirectory,
      );
      expect(await readFile(exported.filePath, 'utf8')).toContain('恢复点正文');

      const restored = await value.recovery.restoreCheckpoint(
        randomUUID(),
        { projectId: project.projectId, backupId: checkpoint.backupId },
        value.restoreParent,
      );
      expect(restored.projectId).not.toBe(project.projectId);
      expect(restored.sourceProjectId).toBe(project.projectId);
      expect(value.workspace.activeProject?.projectId).toBe(project.projectId);
      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_TARGET_CONFLICT' });

      await value.workspace.close(randomUUID(), project.projectId);
      const reopened = await value.workspace.open(randomUUID(), {
        workspacePath: restored.workspacePath,
      });
      const restoredStructure = value.structure.list(reopened.projectId);
      const restoredChapter = restoredStructure.volumes[0]!.chapters[0]!;
      const restoredDraft = await value.drafts.open(randomUUID(), {
        projectId: reopened.projectId,
        chapterId: restoredChapter.id,
      });
      expect(restoredDraft.blocks[0]!.text).toBe('恢复点正文');
      const continued = await value.drafts.applyPatch(randomUUID(), {
        projectId: reopened.projectId,
        chapterId: restoredChapter.id,
        draftId: restoredDraft.draftId,
        baseRevision: restoredDraft.revision,
        operations: [
          {
            type: 'update',
            logicalBlockId: restoredDraft.blocks[0]!.logicalBlockId,
            expectedHash: restoredDraft.blocks[0]!.contentHash!,
            content: '恢复副本继续写作',
          },
        ],
      });
      expect(continued.blocks[0]!.text).toBe('恢复副本继续写作');
      expect(
        (await value.appRuntime.recentProjects.list(randomUUID())).map((item) => item.projectId),
      ).toEqual(expect.arrayContaining([project.projectId, restored.projectId]));
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });

  it('rejects low space and corrupted backup output without recording an unverified checkpoint', async () => {
    const lowSpace = await harness({ backupRootDirectory: '', freeBytes: async () => 0n });
    try {
      const { project } = await seed(lowSpace);
      await expect(
        lowSpace.recovery.createOperationCheckpoint(randomUUID(), {
          projectId: project.projectId,
          operation: 'import',
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_SPACE_LOW' });
    } finally {
      await lowSpace.workspace.shutdown();
      await lowSpace.appRuntime.close();
    }

    const damaged = await harness({
      backupRootDirectory: '',
      afterBackupCreated: async (backupPath) => writeFile(backupPath, 'broken backup'),
    });
    try {
      const { project } = await seed(damaged);
      await expect(
        damaged.recovery.createOperationCheckpoint(randomUUID(), {
          projectId: project.projectId,
          operation: 'merge-chapter',
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CREATE_FAILED' });
      expect(
        damaged.workspace.readProject(project.projectId, (database) =>
          Number(
            database.prepare('SELECT COUNT(*) AS count FROM backup_records').get()?.count ?? 0,
          ),
        ),
      ).toBe(0);
    } finally {
      await damaged.workspace.shutdown();
      await damaged.appRuntime.close();
    }
  });

  it('removes an interrupted restored copy and keeps the source workspace active', async () => {
    const value = await harness({
      backupRootDirectory: '',
      afterRestoreCopied: async (databasePath) => writeFile(databasePath, 'interrupted restore'),
    });
    try {
      const { project } = await seed(value);
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'split-chapter',
      });
      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_VERIFY_FAILED' });
      expect(value.workspace.activeProject?.projectId).toBe(project.projectId);
      expect(await readdir(value.restoreParent)).toEqual([]);
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });

  it('opens a physically unreadable project in recovery-only mode and restores an external checkpoint', async () => {
    const value = await harness();
    try {
      const { project } = await seed(value);
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'manual-protection',
      });
      await value.workspace.close(randomUUID(), project.projectId);

      const databasePath = path.join(project.workspacePath, 'project.sqlite');
      await corruptSqliteHeader(databasePath);
      const damagedSource = await readFile(databasePath);

      const recoveryOnly = await value.workspace.open(randomUUID(), {
        workspacePath: project.workspacePath,
      });
      expect(recoveryOnly).toMatchObject({
        projectId: project.projectId,
        databaseMode: 'read-only',
        compatibility: 'integrity-failed',
        readOnlyReason: 'integrity-failed',
      });
      expect(() => value.workspace.readProject(project.projectId, () => undefined)).toThrow(
        'only external recovery points',
      );
      await expect(
        value.workspace.writeProject(randomUUID(), project.projectId, () => undefined),
      ).rejects.toMatchObject({ code: 'PROJECT_READ_ONLY' });

      const overview = await value.recovery.getOverview(project.projectId);
      expect(overview.databaseMode).toBe('read-only');
      expect(overview.exportableVersions).toEqual([]);
      expect(overview.checkpoints).toEqual([
        expect.objectContaining({ backupId: checkpoint.backupId, projectId: project.projectId }),
      ]);

      const restored = await value.recovery.restoreCheckpoint(
        randomUUID(),
        { projectId: project.projectId, backupId: checkpoint.backupId },
        value.restoreParent,
      );
      expect(restored).toMatchObject({
        sourceProjectId: project.projectId,
        databaseMode: 'read-write',
        compatibility: 'current',
      });
      expect(await readFile(databasePath)).toEqual(damagedSource);

      await value.workspace.close(randomUUID(), project.projectId);
      const reopened = await value.workspace.open(randomUUID(), {
        workspacePath: restored.workspacePath,
      });
      expect(reopened.databaseMode).toBe('read-write');
      expect(value.structure.list(reopened.projectId).volumes[0]?.chapters).toHaveLength(1);
    } finally {
      await value.workspace.shutdown();
      await value.appRuntime.close();
    }
  });
});
