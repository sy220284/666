import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 three-track recovery center', () => {
  it('deduplicates daily backups, protects named/migration/last and applies a stale-safe cleanup', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-three-track-recovery-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'backups');
    await mkdir(parent, { recursive: true });
    let current = new Date('2026-07-01T08:00:00.000Z');
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
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '三轨恢复', channel: '长篇' },
        parent,
      );
      const daily1 = await recovery.createDailyBackup(randomUUID(), {
        projectId: project.projectId,
      });
      const daily1Again = await recovery.createDailyBackup(randomUUID(), {
        projectId: project.projectId,
      });
      expect(daily1Again.backupId).toBe(daily1.backupId);

      current = new Date('2026-07-02T08:00:00.000Z');
      const daily2 = await recovery.createDailyBackup(randomUUID(), {
        projectId: project.projectId,
      });
      current = new Date('2026-07-03T08:00:00.000Z');
      const major = await recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'replace',
      });
      current = new Date('2026-07-04T08:00:00.000Z');
      const migration = await recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'migration',
      });
      current = new Date('2026-07-05T08:00:00.000Z');
      const named = await recovery.createNamedSnapshot(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        name: '投稿前',
        note: '作者明确保留',
      });
      expect(named).toMatchObject({
        track: 'named',
        displayName: '投稿前',
        authorProtected: true,
      });
      expect(migration.migrationProtected).toBe(true);

      await expect(
        recovery.setProtection(randomUUID(), {
          projectId: project.projectId,
          backupId: named.backupId,
          authority: 'author',
          protected: false,
          confirmationBackupId: null,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_PROTECTED' });
      const unprotected = await recovery.setProtection(randomUUID(), {
        projectId: project.projectId,
        backupId: named.backupId,
        authority: 'author',
        protected: false,
        confirmationBackupId: named.backupId,
      });
      expect(unprotected.authorProtected).toBe(false);
      expect(unprotected.protectionReasons).toContain('last-verified');

      await recovery.updatePolicy(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        dailyRetentionCount: 1,
        majorRetentionCount: 1,
        majorRetentionDays: 1,
        quotaBytes: 100 * 1024 * 1024,
      });
      const preview = await recovery.previewCleanup(project.projectId);
      expect(preview.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            backupId: daily1.backupId,
            action: 'delete',
            reason: 'daily-over-limit',
          }),
          expect.objectContaining({
            backupId: daily2.backupId,
            action: 'retain',
            reason: 'daily-retention',
          }),
          expect.objectContaining({
            backupId: major.backupId,
            action: 'delete',
            reason: 'major-expired',
          }),
          expect.objectContaining({
            backupId: migration.backupId,
            action: 'protect',
            reason: 'migration-protected',
          }),
          expect.objectContaining({
            backupId: named.backupId,
            action: 'protect',
            reason: 'last-verified',
          }),
        ]),
      );
      await expect(
        recovery.applyCleanup(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          planHash: 'a'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
      const cleaned = await recovery.applyCleanup(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        planHash: preview.planHash,
      });
      expect(cleaned.deletedBackupIds).toEqual(
        expect.arrayContaining([daily1.backupId, major.backupId]),
      );
      const overview = await recovery.getOverview(project.projectId);
      expect(overview.checkpoints.map((record) => record.backupId)).not.toEqual(
        expect.arrayContaining([daily1.backupId, major.backupId]),
      );
      expect(overview.checkpoints.map((record) => record.backupId)).toEqual(
        expect.arrayContaining([daily2.backupId, migration.backupId, named.backupId]),
      );
      const names = await readdir(path.join(backupRoot, project.projectId));
      expect(names).not.toContain(daily1.backupFileName);
      expect(names).not.toContain(major.backupFileName);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
