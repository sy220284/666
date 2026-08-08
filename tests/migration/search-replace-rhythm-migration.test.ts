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
const clock = { now: () => new Date('2026-07-26T09:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 search, replacement and rhythm migration', () => {
  it('installs schema 26 mutation origins, ReplacePlan and rebuildable writing metrics', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-search-rhythm-migration-'));
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
      { name: '搜索节奏迁移', channel: '长篇' },
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
      const columns = database.prepare(`PRAGMA table_info(draft_patch_log)`).all();
      expect(columns).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'mutation_origin', dflt_value: "'system'" }),
        ]),
      );
      for (const table of [
        'replace_plans',
        'replace_plan_items',
        'genre_rhythm_profiles',
        'writing_sessions',
      ]) {
        expect(
          database.prepare(`SELECT strict FROM pragma_table_list WHERE name = ?`).get(table),
        ).toEqual({ strict: 1n });
      }
      expect(
        database
          .prepare(
            `SELECT name FROM sqlite_master
              WHERE type = 'trigger' AND name = 'trg_replace_plan_item_scope'`,
          )
          .get(),
      ).toEqual({ name: 'trg_replace_plan_item_scope' });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
