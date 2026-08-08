import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { RhythmService } from '../../packages/core-service/src/rhythm.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-08T03:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M10-17 rhythm read/write ownership', () => {
  it('returns an in-memory default profile without writing, while run materializes the profile', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m10-17-rhythm-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    await mkdir(projectParent, { recursive: true });
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '1.0.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '1.0.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const rhythm = new RhythmService(workspace, { clock });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '节奏只读作品', channel: '网络小说' },
        projectParent,
      );
      await workspace.writeProject(randomUUID(), project.projectId, (database) => {
        database.prepare('DELETE FROM genre_rhythm_profiles WHERE project_id = ?').run(project.projectId);
      });

      const countProfiles = (): number =>
        workspace.readProject(project.projectId, (database) => {
          const row = database
            .prepare('SELECT COUNT(*) AS count FROM genre_rhythm_profiles WHERE project_id = ?')
            .get(project.projectId) as { readonly count: number | bigint };
          return Number(row.count);
        });

      expect(countProfiles()).toBe(0);
      const dashboard = await rhythm.get(randomUUID(), project.projectId);
      expect(dashboard.profile.projectId).toBe(project.projectId);
      expect(dashboard.profile.channel).toBe('网络小说');
      expect(countProfiles()).toBe(0);

      await rhythm.run(randomUUID(), project.projectId);
      expect(countProfiles()).toBe(1);
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });

  it('allows rhythm reads in read-only compatibility mode and blocks run/update writes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m10-17-rhythm-readonly-'));
    temporaryDirectories.push(root);
    const projectParent = path.join(root, 'projects');
    await mkdir(projectParent, { recursive: true });
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '1.0.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '1.0.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const rhythm = new RhythmService(workspace, { clock });
    try {
      const project = await workspace.create(
        randomUUID(),
        { name: '节奏兼容作品', channel: '网络小说' },
        projectParent,
      );
      const before = await rhythm.run(randomUUID(), project.projectId);
      await workspace.close(randomUUID(), project.projectId);

      const databasePath = path.join(project.workspacePath, 'project.sqlite');
      const damaged = new DatabaseSync(databasePath, {
        allowExtension: false,
        enableForeignKeyConstraints: false,
      });
      damaged.exec('PRAGMA foreign_keys = OFF');
      damaged.prepare('UPDATE volumes SET project_id = ?').run(randomUUID());
      damaged.close();

      const opened = await workspace.open(randomUUID(), { workspacePath: project.workspacePath });
      expect(opened.databaseMode).toBe('read-only');

      const readOnlyDashboard = await rhythm.get(randomUUID(), project.projectId);
      expect(readOnlyDashboard.profile.projectId).toBe(project.projectId);
      expect(readOnlyDashboard.profile.timeZone).toBe(before.profile.timeZone);

      await expect(rhythm.run(randomUUID(), project.projectId)).rejects.toMatchObject({
        code: 'PROJECT_READ_ONLY',
      });
      await expect(
        rhythm.updateProfile(randomUUID(), {
          projectId: project.projectId,
          authority: 'author',
          enabled: before.profile.enabled,
          excitementMinPer1000: before.profile.excitementMinPer1000,
          excitementMaxPer1000: before.profile.excitementMaxPer1000,
          hookEnabled: before.profile.hookEnabled,
          goldenThreeEnabled: before.profile.goldenThreeEnabled,
          targetDailyCharacters: before.profile.targetDailyCharacters,
          idleThresholdSeconds: before.profile.idleThresholdSeconds,
          timeZone: before.profile.timeZone,
        }),
      ).rejects.toMatchObject({ code: 'PROJECT_READ_ONLY' });
    } finally {
      await workspace.shutdown();
      await runtime.close();
    }
  });
});
