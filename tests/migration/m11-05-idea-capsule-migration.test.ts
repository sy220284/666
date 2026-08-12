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
const clock = { now: () => new Date('2026-08-12T09:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M11-05 generation scope and Idea Capsule migration', () => {
  it('creates strict Idea tables and keeps chapter runs compatible with generic scope', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-m11-05-migration-'));
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
      { name: 'M11-05 迁移验证', channel: '长篇' },
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
      for (const table of ['idea_cards', 'idea_conversions', 'generation_result_refs']) {
        expect(
          database.prepare('SELECT strict FROM pragma_table_list WHERE name = ?').get(table),
        ).toEqual({ strict: 1n });
      }
      const runColumns = database.prepare("PRAGMA table_info('generation_runs')").all() as Array<{
        readonly name: string;
      }>;
      expect(runColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(['scope_type', 'scope_id', 'chapter_id', 'run_type']),
      );
      expect(
        database
          .prepare(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'generation_runs'",
          )
          .get(),
      ).toMatchObject({
        sql: expect.stringContaining("'idea_explore'"),
      });
      expect(
        database
          .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'idea_cards'")
          .get(),
      ).toMatchObject({
        sql: expect.stringContaining("'relationship'"),
      });
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
