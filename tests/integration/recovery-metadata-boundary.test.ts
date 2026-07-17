import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BackupRecordSchema } from '@worldforge/contracts';
import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T01:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-08 recovery metadata path boundary', () => {
  it('accepts generated SQLite names and rejects every path-bearing backup name', async () => {
    const valid = {
      backupId: randomUUID(),
      projectId: randomUUID(),
      operation: 'manual-protection' as const,
      backupFileName:
        '2026-07-17T01-30-00-manual-protection-00000000-0000-4000-8000-000000000000.sqlite',
      sizeBytes: 1,
      sha256: 'a'.repeat(64),
      createdAt: clock.now().toISOString(),
      verifiedAt: clock.now().toISOString(),
    };
    expect(BackupRecordSchema.safeParse(valid).success).toBe(true);
    for (const backupFileName of [
      '../project.sqlite',
      'nested/project.sqlite',
      String.raw`..\project.sqlite`,
      '/absolute/project.sqlite',
    ]) {
      expect(BackupRecordSchema.safeParse({ ...valid, backupFileName }).success).toBe(false);
    }
  });

  it('ignores a forged traversal sidecar before it can become a selectable checkpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-metadata-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    const backupRoot = path.join(root, 'recovery');
    await mkdir(projectParent, { recursive: true });
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
        { name: '元数据边界', channel: '测试' },
        projectParent,
      );
      const directory = path.join(backupRoot, project.projectId);
      await mkdir(directory, { recursive: true });
      await writeFile(
        path.join(directory, `${randomUUID()}.json`),
        JSON.stringify({
          backupId: randomUUID(),
          projectId: project.projectId,
          operation: 'manual-protection',
          backupFileName: '../project.sqlite',
          sizeBytes: 1,
          sha256: 'a'.repeat(64),
          createdAt: clock.now().toISOString(),
          verifiedAt: clock.now().toISOString(),
        }),
      );
      const recovery = new RecoveryService(workspace, { backupRootDirectory: backupRoot, clock });
      await expect(recovery.getOverview(project.projectId)).resolves.toMatchObject({
        checkpoints: [],
      });
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
