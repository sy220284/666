import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import {
  latestProjectMigrationVersion,
  materializeProjectMigrationsThrough,
} from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-08-11T07:05:00.000Z') };

interface ProjectManifest {
  readonly projectId: string;
  readonly displayName: string;
  readonly projectSchemaVersion: number;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('reliability: full project migration matrix', () => {
  it('upgrades every historical project schema to latest and remains idempotent on reopen', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-reliability-migration-matrix-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    const recoveryRoot = path.join(root, 'project-migration-recovery');
    await mkdir(parent, { recursive: true });

    const appRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const currentWorkspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: recoveryRoot,
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });

    try {
      const latestVersion = await latestProjectMigrationVersion();
      expect(latestVersion).toBeGreaterThan(1);
      const expectedVersions = Array.from({ length: latestVersion }, (_, index) => index + 1);

      for (let historicalVersion = 1; historicalVersion < latestVersion; historicalVersion += 1) {
        const suffix = historicalVersion.toString().padStart(2, '0');
        const historicalMigrationsDirectory = path.join(root, `project-migrations-v${suffix}`);
        await materializeProjectMigrationsThrough(historicalVersion, historicalMigrationsDirectory);
        const historicalWorkspace = new ProjectWorkspaceService({
          projectMigrationsDirectory: historicalMigrationsDirectory,
          projectMigrationRecoveryDirectory: path.join(root, `historical-recovery-v${suffix}`),
          appVersion: '0.1.0',
          recentProjects: appRuntime.recentProjects,
          clock,
        });

        const projectName = `迁移矩阵-v${suffix}`;
        const project = await historicalWorkspace.create(
          randomUUID(),
          {
            name: projectName,
            channel: '长篇',
            initialStructure: 'blank',
          },
          parent,
        );
        expect(project.schemaVersion).toBe(historicalVersion);
        await historicalWorkspace.shutdown();

        const opened = await currentWorkspace.open(randomUUID(), {
          workspacePath: project.workspacePath,
        });
        expect(opened).toMatchObject({
          projectId: project.projectId,
          name: projectName,
          schemaVersion: latestVersion,
          databaseMode: 'read-write',
          compatibility: 'migrated',
        });

        const persisted = currentWorkspace.readProject(project.projectId, (database) => {
          const projectRow = database
            .prepare('SELECT id, name, schema_version AS schemaVersion FROM projects WHERE id = ?')
            .get(project.projectId) as
            | { readonly id: string; readonly name: string; readonly schemaVersion: number }
            | undefined;
          const versions = database
            .prepare('SELECT version FROM schema_migrations ORDER BY version')
            .all()
            .map((row) => Number(row.version));
          const foreignKeyErrors = database.prepare('PRAGMA foreign_key_check').all();
          return { projectRow, versions, foreignKeyErrors };
        });
        expect(persisted.projectRow).toEqual({
          id: project.projectId,
          name: projectName,
          schemaVersion: latestVersion,
        });
        expect(persisted.versions).toEqual(expectedVersions);
        expect(persisted.foreignKeyErrors).toEqual([]);

        await currentWorkspace.close(randomUUID(), project.projectId);
        const manifest = JSON.parse(
          await readFile(path.join(project.workspacePath, 'manifest.json'), 'utf8'),
        ) as ProjectManifest;
        expect(manifest).toMatchObject({
          projectId: project.projectId,
          displayName: projectName,
          projectSchemaVersion: latestVersion,
        });

        const recoveryDirectory = path.join(recoveryRoot, project.projectId);
        const recoveryFiles = await readdir(recoveryDirectory);
        expect(recoveryFiles).toEqual([
          expect.stringMatching(
            new RegExp(`^project-v${historicalVersion}-to-v${latestVersion}-.*\\.sqlite$`, 'u'),
          ),
        ]);

        const reopened = await currentWorkspace.open(randomUUID(), {
          workspacePath: project.workspacePath,
        });
        expect(reopened).toMatchObject({
          projectId: project.projectId,
          schemaVersion: latestVersion,
          databaseMode: 'read-write',
          compatibility: 'current',
        });
        await currentWorkspace.close(randomUUID(), project.projectId);
        expect(await readdir(recoveryDirectory)).toEqual(recoveryFiles);
      }
    } finally {
      await currentWorkspace.shutdown();
      await appRuntime.close();
    }
  });
});
