import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M10-11 Recovery request replay', () => {
  it('replays backup creation and restore across service instances without duplicate artifacts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-replay-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const restoreParent = path.join(root, 'restored');
    const conflictingRestoreParent = path.join(root, 'restored-conflict');
    const backupRoot = path.join(root, 'backups');
    await Promise.all([
      mkdir(parent, { recursive: true }),
      mkdir(restoreParent, { recursive: true }),
      mkdir(conflictingRestoreParent, { recursive: true }),
    ]);
    const clock = { now: () => new Date('2026-08-05T08:00:00.000Z') };
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
    const replica = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '恢复重放'.repeat(15), channel: '长篇' },
        parent,
      );
      const backupRequestId = randomUUID();
      const first = await recovery.createOperationCheckpoint(backupRequestId, {
        projectId: project.projectId,
        operation: 'replace',
      });
      const replayed = await replica.createOperationCheckpoint(backupRequestId, {
        projectId: project.projectId,
        operation: 'replace',
      });

      expect(replayed).toEqual(first);
      expect(first.backupId).toBe(backupRequestId);
      const backupFiles = (await readdir(path.join(backupRoot, project.projectId))).filter(
        (name) => name.endsWith('.sqlite') || name.endsWith('.json'),
      );
      expect(backupFiles).toEqual(
        expect.arrayContaining([
          first.backupFileName,
          `${backupRequestId}.json`,
          `${backupRequestId}.artifacts.json`,
        ]),
      );
      expect(backupFiles).toHaveLength(3);

      const restoreRequestId = randomUUID();
      const restored = await recovery.restoreCheckpoint(
        restoreRequestId,
        { projectId: project.projectId, backupId: first.backupId },
        restoreParent,
      );
      const restoredAgain = await replica.restoreCheckpoint(
        restoreRequestId,
        { projectId: project.projectId, backupId: first.backupId },
        restoreParent,
      );

      expect(restoredAgain).toEqual(restored);
      expect(restored.projectId).toBe(restoreRequestId);
      expect(Buffer.byteLength(path.basename(restored.workspacePath), 'utf8')).toBeLessThanOrEqual(
        200,
      );
      expect(await readdir(restoreParent)).toHaveLength(1);

      const conflictingReplica = new RecoveryService(workspace, {
        backupRootDirectory: backupRoot,
        clock,
      });
      await expect(
        conflictingReplica.restoreCheckpoint(
          restoreRequestId,
          { projectId: project.projectId, backupId: first.backupId },
          conflictingRestoreParent,
        ),
      ).rejects.toMatchObject({ code: 'RESTORE_TARGET_CONFLICT' });
      expect(await readdir(conflictingRestoreParent)).toHaveLength(0);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });

  it('returns the original cleanup result when the same plan request is replayed', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-cleanup-replay-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'backups');
    await mkdir(parent, { recursive: true });
    let current = new Date('2026-08-01T08:00:00.000Z');
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
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
    const replica = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '清理重放', channel: '长篇' },
        parent,
      );
      await recovery.createDailyBackup(randomUUID(), { projectId: project.projectId });
      current = new Date('2026-08-02T08:00:00.000Z');
      await recovery.createDailyBackup(randomUUID(), { projectId: project.projectId });
      current = new Date('2026-08-03T08:00:00.000Z');
      await recovery.createNamedSnapshot(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        name: '保留点',
      });
      await recovery.updatePolicy(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        dailyRetentionCount: 1,
        majorRetentionCount: 1,
        majorRetentionDays: 1,
        quotaBytes: 100 * 1024 * 1024,
      });
      const preview = await recovery.previewCleanup(project.projectId);
      expect(preview.items.some((item) => item.action === 'delete')).toBe(true);
      const cleanupRequestId = randomUUID();
      const first = await recovery.applyCleanup(cleanupRequestId, {
        projectId: project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      const replayed = await replica.applyCleanup(cleanupRequestId, {
        projectId: project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });

      expect(replayed).toEqual(first);
      expect(first.deletedBackupIds.length).toBeGreaterThan(0);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});