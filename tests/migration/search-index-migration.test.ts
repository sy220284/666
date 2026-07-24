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
const clock = { now: () => new Date('2026-07-24T06:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-01 search index migrations', () => {
  it('installs Schema 20-21 search index and dictionary', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-search-migration-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const migrations = await loadMigrations('migrations/project', 'project');
    expect(latestMigrationVersion(migrations)).toBe(21);

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
      { name: '检索迁移', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await appRuntime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readOnly: true,
      readBigInts: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: 21n,
      });
      expect(
        database
          .prepare(
            `SELECT name FROM pragma_table_list
              WHERE name IN (
                'search_index_state', 'search_index_queue', 'fts_draft_blocks',
                'fts_version_blocks', 'fts_entities', 'project_dictionary'
              )
              ORDER BY name`,
          )
          .all(),
      ).toEqual([
        { name: 'fts_draft_blocks' },
        { name: 'fts_entities' },
        { name: 'fts_version_blocks' },
        { name: 'project_dictionary' },
        { name: 'search_index_queue' },
        { name: 'search_index_state' },
      ]);
      expect(
        database
          .prepare(
            `SELECT COUNT(*) AS count FROM sqlite_master
              WHERE type = 'trigger' AND name LIKE 'trg_search_queue_%'`,
          )
          .get(),
      ).toEqual({ count: 16n });
      expect(
        database
          .prepare(`SELECT strict FROM pragma_table_list WHERE name = 'project_dictionary'`)
          .get(),
      ).toEqual({ strict: 1n });
      expect(
        database
          .prepare(`SELECT sql FROM sqlite_master WHERE name = 'fts_draft_blocks'`)
          .get(),
      ).toMatchObject({
        sql: expect.stringContaining("tokenize = 'trigram'"),
      });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
