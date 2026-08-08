import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { latestProjectMigrationVersion } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T03:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 project continuation migration', () => {
  it('installs schema 22 with a strict project settings store', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-continuation-migration-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
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
      { name: '继续写作迁移', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await appRuntime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readBigInts: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: BigInt(await latestProjectMigrationVersion()),
      });
      expect(
        database
          .prepare(`SELECT strict FROM pragma_table_list WHERE name = 'project_settings'`)
          .get(),
      ).toEqual({ strict: 1n });
      database
        .prepare(
          `INSERT INTO project_settings(setting_key, value_json, updated_at)
           VALUES(?, ?, ?)`,
        )
        .run('writing.continuation', '{}', clock.now().toISOString());
      expect(() =>
        database
          .prepare(
            `INSERT INTO project_settings(setting_key, value_json, updated_at)
             VALUES(?, ?, ?)`,
          )
          .run('invalid', '{', clock.now().toISOString()),
      ).toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
