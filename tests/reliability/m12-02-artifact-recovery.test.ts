import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { ResearchService } from '../../packages/core-service/src/research-service.js';

const temporaryDirectories: string[] = [];

async function exists(filePath: string): Promise<boolean> {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

async function harness() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m12-02-recovery-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
  const backupRoot = path.join(root, 'backups');
  await Promise.all([
    mkdir(parent, { recursive: true }),
    mkdir(restoreParent, { recursive: true }),
  ]);
  let current = new Date('2026-08-10T08:00:00.000Z');
  const clock = { now: () => current };
  const runtime = await openAppRuntime({
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
    recentProjects: runtime.recentProjects,
    clock,
  });
  const research = new ResearchService(workspace, { clock });
  const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
  const project = await workspace.create(
    randomUUID(),
    { name: 'M12-02 资产恢复', channel: '长篇' },
    parent,
  );
  const catalog = await research.createNote(randomUUID(), {
    projectId: project.projectId,
    title: '恢复资料',
    body: '',
    sourceUri: null,
    tags: [],
  });
  const note = catalog.notes.find((candidate) => candidate.title === '恢复资料');
  if (!note) throw new Error('Research note was not created.');
  const sourcePath = path.join(root, 'artifact.txt');
  await writeFile(sourcePath, '必须与数据库一起恢复的附件', 'utf8');
  const imported = await research.importAttachment(
    randomUUID(),
    { projectId: project.projectId, noteId: note.id },
    sourcePath,
  );
  const attachment = imported.attachments[0];
  if (!attachment) throw new Error('Research attachment was not imported.');
  return {
    root,
    parent,
    restoreParent,
    backupRoot,
    runtime,
    workspace,
    research,
    recovery,
    project,
    attachment,
    setDay(day: number) {
      current = new Date(`2026-08-${String(day).padStart(2, '0')}T08:00:00.000Z`);
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M12-02 managed artifact recovery', () => {
  it('does not publish a half-restored project when a backed-up artifact is missing', async () => {
    const value = await harness();
    try {
      const checkpoint = await value.recovery.createOperationCheckpoint(randomUUID(), {
        projectId: value.project.projectId,
        operation: 'replace',
      });
      const backedUpArtifact = path.join(
        value.backupRoot,
        value.project.projectId,
        `${checkpoint.backupId}.artifacts`,
        ...value.attachment.managedRelativePath.split('/'),
      );
      expect(await exists(backedUpArtifact)).toBe(true);
      await rm(backedUpArtifact, { force: true });

      await expect(
        value.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: value.project.projectId, backupId: checkpoint.backupId },
          value.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_SOURCE_INVALID' });
      expect(await readdir(value.restoreParent)).toEqual([]);
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });

  it('removes managed artifact bundles as part of backup cleanup completion', async () => {
    const value = await harness();
    try {
      for (const day of [10, 11, 12, 13]) {
        value.setDay(day);
        await value.recovery.createDailyBackup(randomUUID(), {
          projectId: value.project.projectId,
        });
      }
      await value.recovery.updatePolicy(randomUUID(), {
        projectId: value.project.projectId,
        authority: 'author',
        dailyRetentionCount: 1,
        majorRetentionCount: 1,
        majorRetentionDays: 1,
        quotaBytes: 100 * 1024 * 1024,
      });
      const preview = await value.recovery.previewCleanup(value.project.projectId);
      const deleteIds = preview.items
        .filter((item) => item.action === 'delete')
        .map((item) => item.backupId);
      expect(deleteIds.length).toBeGreaterThanOrEqual(2);

      const result = await value.recovery.applyCleanup(randomUUID(), {
        projectId: value.project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      expect(result.deletedBackupIds).toEqual(deleteIds);
      for (const backupId of deleteIds) {
        expect(
          await exists(
            path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts`),
          ),
        ).toBe(false);
        expect(
          await exists(
            path.join(value.backupRoot, value.project.projectId, `${backupId}.artifacts.json`),
          ),
        ).toBe(false);
      }
    } finally {
      await value.workspace.shutdown();
      await value.runtime.close();
    }
  });
});
