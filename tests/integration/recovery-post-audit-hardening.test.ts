import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';

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

async function createHarness(name: string) {
  const root = await mkdtemp(path.join(tmpdir(), `worldforge-${name}-`));
  temporaryDirectories.push(root);
  const projectParent = path.join(root, 'projects');
  const backupRoot = path.join(root, 'backups');
  await mkdir(projectParent, { recursive: true });
  const current = new Date('2026-08-07T01:00:00.000Z');
  const clock = { now: () => current };
  const appRuntime = await openAppRuntime({
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
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  const project = await workspace.create(
    randomUUID(),
    { name: '恢复审计', channel: '长篇' },
    projectParent,
  );
  return { root, backupRoot, clock, appRuntime, workspace, project };
}

async function closeHarness(harness: Awaited<ReturnType<typeof createHarness>>): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

describe('M10-14 recovery post-audit hardening', () => {
  it('shares one long-running daily backup across RecoveryService instances', async () => {
    const harness = await createHarness('daily-owner');
    let backupCalls = 0;
    let releaseBackup = () => undefined;
    let markStarted = () => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      releaseBackup = resolve;
    });
    const onlineBackup = async (sourceDatabasePath: string, targetDatabasePath: string) => {
      backupCalls += 1;
      markStarted();
      await gate;
      const source = new DatabaseSync(sourceDatabasePath, {
        readOnly: true,
        allowExtension: false,
        enableForeignKeyConstraints: true,
        readBigInts: true,
      });
      try {
        await backup(source, targetDatabasePath);
      } finally {
        source.close();
      }
    };
    const firstService = new RecoveryService(harness.workspace, {
      backupRootDirectory: harness.backupRoot,
      clock: harness.clock,
      onlineBackup,
    });
    const secondService = new RecoveryService(harness.workspace, {
      backupRootDirectory: harness.backupRoot,
      clock: harness.clock,
      onlineBackup,
    });

    try {
      const first = firstService.createDailyBackup(randomUUID(), {
        projectId: harness.project.projectId,
      });
      await started;
      const second = secondService.createDailyBackup(randomUUID(), {
        projectId: harness.project.projectId,
      });
      expect(backupCalls).toBe(1);

      releaseBackup();
      const [firstRecord, secondRecord] = await Promise.all([first, second]);
      expect(secondRecord.backupId).toBe(firstRecord.backupId);
      expect(backupCalls).toBe(1);
    } finally {
      releaseBackup();
      await closeHarness(harness);
    }
  });

  it('fails closed when the persisted cleanup policy cannot be read', async () => {
    const harness = await createHarness('cleanup-policy');
    const recovery = new RecoveryService(harness.workspace, {
      backupRootDirectory: harness.backupRoot,
      clock: harness.clock,
    });

    try {
      await recovery.updatePolicy(randomUUID(), {
        projectId: harness.project.projectId,
        authority: 'author',
        dailyRetentionCount: 30,
        majorRetentionCount: 100,
        majorRetentionDays: 365,
        quotaBytes: 10 * 1024 * 1024 * 1024,
      });
      await harness.workspace.writeProject(
        randomUUID(),
        harness.project.projectId,
        (database) => {
          database.exec('DROP TABLE backup_policies');
        },
        { operation: 'test.drop-backup-policies' },
      );

      await expect(recovery.previewCleanup(harness.project.projectId)).rejects.toMatchObject({
        code: 'BACKUP_CLEANUP_STALE',
      });
      await expect(
        recovery.applyCleanup(randomUUID(), {
          projectId: harness.project.projectId,
          authority: 'author',
          planHash: 'a'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
      expect(() => recovery.getOverview(harness.project.projectId)).toThrow(/backup_policies/u);
    } finally {
      await closeHarness(harness);
    }
  });
});
