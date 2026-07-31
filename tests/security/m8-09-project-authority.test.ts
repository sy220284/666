import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import type { RecentProjectsRepository } from '../../packages/core-service/src/recent-projects.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-m8-09-authority-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function failingRecentProjects(): RecentProjectsRepository {
  return {
    register: async () => {
      throw new Error('injected-recent-projects-write-failure');
    },
  } as unknown as RecentProjectsRepository;
}

function workspaceService(root: string): ProjectWorkspaceService {
  return new ProjectWorkspaceService({
    projectMigrationsDirectory: 'migrations/project',
    projectMigrationRecoveryDirectory: path.join(root, 'project-migration-recovery'),
    appVersion: '1.0.0',
    recentProjects: failingRecentProjects(),
    clock: { now: () => new Date('2026-07-31T16:30:00.000Z') },
  });
}

describe('M8-09 project authority boundary', () => {
  it('keeps a committed project active when recent-project metadata cannot be written', async () => {
    const root = await temporaryDirectory();
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const service = workspaceService(root);

    try {
      const summary = await service.create(
        randomUUID(),
        { name: '权威作品', channel: '未分类' },
        parent,
      );

      expect((await stat(summary.workspacePath)).isDirectory()).toBe(true);
      expect(service.activeProject).toMatchObject({
        projectId: summary.projectId,
        workspacePath: summary.workspacePath,
        databaseMode: 'read-write',
      });
    } finally {
      await service.shutdown();
    }
  });

  it('opens and moves a healthy project even when recent-project metadata remains unavailable', async () => {
    const root = await temporaryDirectory();
    const parent = path.join(root, 'projects');
    const targetParent = path.join(root, 'moved');
    await Promise.all([mkdir(parent, { recursive: true }), mkdir(targetParent, { recursive: true })]);

    const creator = workspaceService(root);
    const created = await creator.create(
      randomUUID(),
      { name: '迁移权威作品', channel: '未分类' },
      parent,
    );
    await creator.close(randomUUID(), created.projectId);
    await creator.shutdown();

    const opener = workspaceService(root);
    try {
      const opened = await opener.open(randomUUID(), { workspacePath: created.workspacePath });
      expect(opened.projectId).toBe(created.projectId);

      const moved = await opener.move(randomUUID(), opened.projectId, targetParent);
      expect(moved).toMatchObject({
        projectId: created.projectId,
        sourceRetained: false,
        databaseMode: 'read-write',
      });
      expect((await stat(moved.workspacePath)).isDirectory()).toBe(true);
      await expect(stat(created.workspacePath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await opener.shutdown();
    }
  });
});
