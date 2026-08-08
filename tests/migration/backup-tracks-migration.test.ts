import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-26T10:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M4-04 three-track backup migration', () => {
  it('adds track, protection, schema and versioned policy constraints without breaking references', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-tracks-migration-'));
    temporaryDirectories.push(root);
    const parent = path.join(root, 'projects');
    await mkdir(parent, { recursive: true });
    const runtime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });
    const workspace = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: path.join(root, 'migration-recovery'),
      appVersion: '0.1.0',
      recentProjects: runtime.recentProjects,
      clock,
    });
    const project = await workspace.create(
      randomUUID(),
      { name: '三轨备份迁移', channel: '长篇' },
      parent,
    );
    await workspace.shutdown();
    await runtime.close();

    const database = new DatabaseSync(path.join(project.workspacePath, 'project.sqlite'), {
      readBigInts: true,
      enableForeignKeyConstraints: true,
    });
    try {
      expect(database.prepare('SELECT schema_version FROM projects').get()).toEqual({
        schema_version: 30n,
      });
      expect(
        database
          .prepare('PRAGMA table_info(backup_records)')
          .all()
          .map((column) => column.name),
      ).toEqual(
        expect.arrayContaining([
          'backup_track',
          'display_name',
          'note',
          'author_protected',
          'migration_protected',
          'schema_version',
        ]),
      );
      expect(
        database
          .prepare(`SELECT strict FROM pragma_table_list WHERE name = 'backup_policies'`)
          .get(),
      ).toEqual({ strict: 1n });
      expect(() =>
        database
          .prepare(
            `INSERT INTO backup_policies(
               project_id, policy_version, daily_retention_count, major_retention_count,
               major_retention_days, quota_bytes, updated_at
             ) VALUES(?, 1, 0, 30, 90, 5368709120, ?)`,
          )
          .run(project.projectId, clock.now().toISOString()),
      ).toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
