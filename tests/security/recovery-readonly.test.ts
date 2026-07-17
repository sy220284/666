import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T02:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-08 damaged project read-only recovery', () => {
  it('blocks every source write while external checkpoints remain restorable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-readonly-recovery-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    const restoreParent = path.join(root, 'restored');
    await Promise.all([mkdir(projectParent), mkdir(restoreParent)]);
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
      backupRootDirectory: path.join(root, 'operation-recovery'),
      clock,
    });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '损坏项目', channel: '测试' },
        projectParent,
      );
      const checkpoint = await recovery.createOperationCheckpoint(randomUUID(), {
        projectId: project.projectId,
        operation: 'manual-protection',
      });
      await workspace.close(randomUUID(), project.projectId);

      const databasePath = path.join(project.workspacePath, 'project.sqlite');
      const damaged = new DatabaseSync(databasePath, {
        allowExtension: false,
        enableForeignKeyConstraints: false,
      });
      damaged.exec('PRAGMA foreign_keys = OFF');
      damaged.prepare('UPDATE volumes SET project_id = ?').run(randomUUID());
      damaged.close();

      const readOnly = await workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      expect(readOnly).toMatchObject({
        databaseMode: 'read-only',
        compatibility: 'integrity-failed',
      });
      await expect(
        workspace.writeProject(randomUUID(), project.projectId, () => undefined),
      ).rejects.toMatchObject({ code: 'PROJECT_READ_ONLY' });
      const overview = await recovery.getOverview(project.projectId);
      expect(overview.checkpoints.map((item) => item.backupId)).toContain(checkpoint.backupId);
      const restored = await recovery.restoreCheckpoint(
        randomUUID(),
        { projectId: project.projectId, backupId: checkpoint.backupId },
        restoreParent,
      );
      expect(restored.databaseMode).toBe('read-write');
      expect(restored.projectId).not.toBe(project.projectId);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
