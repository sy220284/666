import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-07-28T08:50:00.000Z') };

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((item) => rm(item, { recursive: true, force: true })),
  );
});

describe('backup failure ledger', () => {
  it('persists a privacy-safe failure and resolves it after a successful backup on the same track', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-failure-ledger-'));
    directories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    let freeBytes = 0n;
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
    const recovery = new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'backups'),
      clock,
      freeBytes: async () => freeBytes,
    });

    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '备份失败账本', channel: '长篇' },
        parent,
      );
      await expect(
        recovery.createDailyBackup(randomUUID(), { projectId: project.projectId }),
      ).rejects.toMatchObject({ code: 'BACKUP_SPACE_LOW' });

      const failed = await recovery.getOverview(project.projectId);
      expect(failed.backupFailures).toEqual([
        expect.objectContaining({
          projectId: project.projectId,
          track: 'daily',
          errorCode: 'BACKUP_SPACE_LOW',
          resolvedAt: null,
        }),
      ]);
      expect(JSON.stringify(failed.backupFailures)).not.toContain(project.workspacePath);

      freeBytes = 10_000_000_000n;
      await recovery.createDailyBackup(randomUUID(), { projectId: project.projectId });
      const resolved = await recovery.getOverview(project.projectId);
      expect(resolved.backupFailures).toEqual([]);
      expect(
        workspace.readProject(project.projectId, (database) =>
          database
            .prepare(
              `SELECT error_code AS errorCode, resolved_at AS resolvedAt
                 FROM backup_failures WHERE project_id = ?`,
            )
            .get(project.projectId),
        ),
      ).toMatchObject({ errorCode: 'BACKUP_SPACE_LOW', resolvedAt: expect.any(String) });
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
