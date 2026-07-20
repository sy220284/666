import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import {
  latestMigrationVersion,
  loadMigrations,
} from '../../packages/core-service/src/database/index.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-18T12:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M3-01 project planning migration', () => {
  it('keeps strict ProjectBrief and PlotNode tables through the current project schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-planning-migration-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const projectMigrations = await loadMigrations('migrations/project', 'project');
    const currentProjectSchemaVersion = latestMigrationVersion(projectMigrations);
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
    const project = await workspace.create(
      randomUUID(),
      { name: '规划迁移', channel: '长篇', initialStructure: 'blank' },
      parent,
    );
    expect(project.schemaVersion).toBe(currentProjectSchemaVersion);
    await workspace.shutdown();
    await appRuntime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readOnly: true,
      readBigInts: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: BigInt(currentProjectSchemaVersion),
      });
      expect(
        database
          .prepare(
            "SELECT name, strict FROM pragma_table_list WHERE name IN ('project_briefs', 'plot_nodes') ORDER BY name",
          )
          .all(),
      ).toEqual([
        { name: 'plot_nodes', strict: 1n },
        { name: 'project_briefs', strict: 1n },
      ]);
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
