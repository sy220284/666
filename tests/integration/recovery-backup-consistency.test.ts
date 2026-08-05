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

describe('M10-11 backup registration consistency', () => {
  it('rejects replay when metadata and the committed database record diverge', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-consistency-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'backups');
    await mkdir(parent, { recursive: true });
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
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '备份登记一致性', channel: '长篇' },
        parent,
      );
      const requestId = randomUUID();
      const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
      const record = await recovery.createOperationCheckpoint(requestId, {
        projectId: project.projectId,
        operation: 'replace',
      });

      await workspace.writeProject(randomUUID(), project.projectId, (database) => {
        const changed = database
          .prepare('UPDATE backup_records SET sha256 = ? WHERE id = ? AND project_id = ?')
          .run('0'.repeat(64), requestId, project.projectId);
        expect(Number(changed.changes)).toBe(1);
      });

      const replica = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
      await expect(
        replica.createOperationCheckpoint(requestId, {
          projectId: project.projectId,
          operation: 'replace',
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_VERIFY_FAILED' });

      const entries = await readdir(path.join(backupRoot, project.projectId));
      expect(entries).toEqual(expect.arrayContaining([record.backupFileName, `${requestId}.json`]));
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
