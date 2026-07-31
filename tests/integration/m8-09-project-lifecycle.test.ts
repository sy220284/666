import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly service: ProjectWorkspaceService;
}

async function createHarness(): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-09-lifecycle-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const clock = { now: () => new Date('2026-07-31T16:00:00.000Z') };
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '1.0.0',
    clock,
  });
  const service = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '1.0.0',
    recentProjects: appRuntime.recentProjects,
    clock,
  });
  return { root, parent, appRuntime, service };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.service.shutdown();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M8-09 project lifecycle authority', () => {
  it('keeps a committed project active and on disk when recent-project registration fails', async () => {
    const harness = await createHarness();
    const register = vi
      .spyOn(harness.appRuntime.recentProjects, 'register')
      .mockRejectedValueOnce(new Error('APP_RECENT_PROJECTS_WRITE_FAILED'));
    try {
      const summary = await harness.service.create(
        randomUUID(),
        { name: '保留正式作品', channel: '网络小说' },
        harness.parent,
      );

      expect((await stat(summary.workspacePath)).isDirectory()).toBe(true);
      expect(harness.service.activeProject).toMatchObject({
        projectId: summary.projectId,
        workspacePath: summary.workspacePath,
        databaseMode: 'read-write',
      });
      expect(register).toHaveBeenCalledOnce();
    } finally {
      register.mockRestore();
      await closeHarness(harness);
    }
  });

  it('opens a healthy workspace even when refreshing its recent-project record fails', async () => {
    const harness = await createHarness();
    let register: ReturnType<typeof vi.spyOn> | null = null;
    try {
      const created = await harness.service.create(
        randomUUID(),
        { name: '健康作品', channel: '网络小说' },
        harness.parent,
      );
      await harness.service.close(randomUUID(), created.projectId);

      register = vi
        .spyOn(harness.appRuntime.recentProjects, 'register')
        .mockRejectedValueOnce(new Error('APP_RECENT_PROJECTS_WRITE_FAILED'));
      const opened = await harness.service.open(randomUUID(), {
        workspacePath: created.workspacePath,
      });

      expect(opened).toMatchObject({
        projectId: created.projectId,
        workspacePath: created.workspacePath,
        databaseMode: 'read-write',
      });
      expect(harness.service.activeProject?.projectId).toBe(created.projectId);
      expect(register).toHaveBeenCalledOnce();
    } finally {
      register?.mockRestore();
      await closeHarness(harness);
    }
  });
});
