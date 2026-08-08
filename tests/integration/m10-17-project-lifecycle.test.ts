import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openAppRuntime, type AppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectTaskBarrier } from '../../packages/core-service/src/project-task-protocol.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { TaskProtocol } from '../../packages/core-service/src/task-protocol.js';

const temporaryDirectories: string[] = [];

interface Harness {
  readonly root: string;
  readonly parent: string;
  readonly appRuntime: AppRuntime;
  readonly tasks: TaskProtocol;
  readonly barrier: ProjectTaskBarrier;
  readonly service: ProjectWorkspaceService;
}

async function createHarness(timeoutMs = 1_000): Promise<Harness> {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m10-17-lifecycle-'));
  temporaryDirectories.push(root);
  const parent = path.join(root, 'projects');
  await mkdir(parent, { recursive: true });
  const clock = { now: () => new Date('2026-08-08T03:20:00.000Z') };
  const appRuntime = await openAppRuntime({
    databasePath: path.join(root, 'app.sqlite'),
    migrationsDirectory: 'migrations/app',
    recoveryDirectory: path.join(root, 'app-recovery'),
    appVersion: '1.0.0',
    clock,
  });
  const tasks = new TaskProtocol();
  const barrier = new ProjectTaskBarrier(tasks, { timeoutMs, pollIntervalMs: 2 });
  const service = new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '1.0.0',
    recentProjects: appRuntime.recentProjects,
    clock,
    taskDrain: barrier,
  });
  return { root, parent, appRuntime, tasks, barrier, service };
}

async function closeHarness(harness: Harness): Promise<void> {
  await harness.service.shutdown();
  harness.tasks.close();
  await harness.appRuntime.close();
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M10-17 project lifecycle task barrier', () => {
  it('waits for an atomic task before closing and blocks new project tasks while draining', async () => {
    const harness = await createHarness();
    try {
      const project = await harness.service.create(
        randomUUID(),
        { name: '关闭屏障作品', channel: '网络小说' },
        harness.parent,
      );
      const atomicTask = harness.barrier.startTask({
        taskType: 'ai.generation',
        projectId: project.projectId,
        cancellable: false,
      });

      const closing = harness.service.close(randomUUID(), project.projectId);
      await vi.waitFor(() => expect(harness.barrier.isProjectDraining(project.projectId)).toBe(true));
      expect(harness.service.activeProject?.projectId).toBe(project.projectId);
      expect(() =>
        harness.barrier.startTask({ taskType: 'ai.generation', projectId: project.projectId }),
      ).toThrowError();

      atomicTask.complete();
      await expect(closing).resolves.toEqual({ projectId: project.projectId, closed: true });
      expect(harness.service.activeProject).toBeNull();
      expect(harness.barrier.isProjectDraining(project.projectId)).toBe(false);
    } finally {
      await closeHarness(harness);
    }
  });

  it('keeps the project active when an atomic task misses the lifecycle timeout', async () => {
    const harness = await createHarness(15);
    try {
      const project = await harness.service.create(
        randomUUID(),
        { name: '超时保留作品', channel: '网络小说' },
        harness.parent,
      );
      const atomicTask = harness.barrier.startTask({
        taskType: 'ai.generation',
        projectId: project.projectId,
        cancellable: false,
      });

      await expect(harness.service.close(randomUUID(), project.projectId)).rejects.toMatchObject({
        code: 'PROJECT_TARGET_CONFLICT',
      });
      expect(harness.service.activeProject?.projectId).toBe(project.projectId);
      expect(harness.barrier.isProjectDraining(project.projectId)).toBe(false);

      atomicTask.complete();
    } finally {
      await closeHarness(harness);
    }
  });

  it('waits for the atomic stage before moving the workspace', async () => {
    const harness = await createHarness();
    const targetParent = path.join(harness.root, 'moved-projects');
    await mkdir(targetParent, { recursive: true });
    try {
      const project = await harness.service.create(
        randomUUID(),
        { name: '移动屏障作品', channel: '网络小说' },
        harness.parent,
      );
      const atomicTask = harness.barrier.startTask({
        taskType: 'ai.generation',
        projectId: project.projectId,
        cancellable: false,
      });

      const moving = harness.service.move(randomUUID(), project.projectId, targetParent);
      await vi.waitFor(() => expect(harness.barrier.isProjectDraining(project.projectId)).toBe(true));
      expect(harness.service.activeProject?.workspacePath).toBe(project.workspacePath);

      atomicTask.complete();
      const moved = await moving;
      expect(moved.projectId).toBe(project.projectId);
      expect(moved.workspacePath).not.toBe(project.workspacePath);
      expect(moved.workspacePath.startsWith(targetParent)).toBe(true);
      expect(harness.service.activeProject?.workspacePath).toBe(moved.workspacePath);
    } finally {
      await closeHarness(harness);
    }
  });
});
