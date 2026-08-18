import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RecoveryService } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-18T00:00:00.000Z') };

interface Harness {
  readonly parent: string;
  readonly restoreParent: string;
  readonly appRuntime: AppRuntime;
  readonly workspace: ProjectWorkspaceService;
  readonly recovery: RecoveryService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-risk-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  const restoreParent = path.join(root, 'restored');
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
    parent,
    restoreParent,
    appRuntime,
    workspace,
    recovery: new RecoveryService(workspace, {
      backupRootDirectory: path.join(root, 'backups'),
      clock,
    }),
  };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.workspace.shutdown();
  await harness.appRuntime.close();
}

async function createProject(harness: Harness, name: string) {
  return harness.workspace.create(randomUUID(), { name, channel: '长篇' }, harness.parent);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('RecoveryService high-risk fail-closed boundaries', () => {
  it('refuses restore when backup metadata is absent and leaves the target directory untouched', async () => {
    const harness = await createHarness();
    try {
      const project = await createProject(harness, '缺失恢复点');
      await expect(
        harness.recovery.restoreCheckpoint(
          randomUUID(),
          { projectId: project.projectId, backupId: randomUUID() },
          harness.restoreParent,
        ),
      ).rejects.toMatchObject({ code: 'BACKUP_NOT_FOUND' });
      expect(await readdir(harness.restoreParent)).toEqual([]);
    } finally {
      await closeHarness(harness);
    }
  });

  it('disables cleanup when persisted policy data is semantically corrupt', async () => {
    const harness = await createHarness();
    try {
      const project = await createProject(harness, '损坏清理策略');
      await harness.recovery.updatePolicy(randomUUID(), {
        projectId: project.projectId,
        authority: 'author',
        dailyRetentionCount: 7,
        majorRetentionCount: 5,
        majorRetentionDays: 30,
        quotaBytes: 200 * 1024 * 1024,
      });
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database
          .prepare(
            "UPDATE backup_policies SET updated_at = 'not-an-iso-timestamp' WHERE project_id = ?",
          )
          .run(project.projectId);
      });

      await expect(harness.recovery.previewCleanup(project.projectId)).rejects.toMatchObject({
        code: 'BACKUP_CLEANUP_STALE',
      });
      await expect(
        Promise.resolve().then(() => harness.recovery.getOverview(project.projectId)),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
    } finally {
      await closeHarness(harness);
    }
  });

  it('converts unreadable policy storage into a cleanup-stale failure instead of continuing', async () => {
    const harness = await createHarness();
    try {
      const project = await createProject(harness, '策略表损坏');
      await harness.workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.exec('DROP TABLE backup_policies');
      });

      await expect(harness.recovery.previewCleanup(project.projectId)).rejects.toMatchObject({
        code: 'BACKUP_CLEANUP_STALE',
      });
    } finally {
      await closeHarness(harness);
    }
  });

  it('replays identical recovery commands but rejects request-id reuse with changed input', async () => {
    const harness = await createHarness();
    try {
      const project = await createProject(harness, '恢复命令幂等');
      const requestId = randomUUID();
      const input = {
        projectId: project.projectId,
        authority: 'author' as const,
        dailyRetentionCount: 7,
        majorRetentionCount: 5,
        majorRetentionDays: 30,
        quotaBytes: 200 * 1024 * 1024,
      };
      const first = await harness.recovery.updatePolicy(requestId, input);
      const replayed = await harness.recovery.updatePolicy(requestId, input);
      expect(replayed).toEqual(first);

      await expect(
        harness.recovery.updatePolicy(requestId, {
          ...input,
          majorRetentionCount: 6,
        }),
      ).rejects.toMatchObject({ code: 'BACKUP_CLEANUP_STALE' });
      expect((await harness.recovery.getOverview(project.projectId)).policy).toEqual(first);
    } finally {
      await closeHarness(harness);
    }
  });
});
