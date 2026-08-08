import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';
import { latestProjectMigrationVersion } from '../../packages/testkit/src/index.js';

const directories: string[] = [];
const clock = { now: () => new Date('2026-07-28T08:45:00.000Z') };

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((item) => rm(item, { recursive: true, force: true })),
  );
});

describe('M8-02 backup failure ledger migration', () => {
  it('preserves the schema 29 failure ledger in the latest schema', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-backup-failure-migration-'));
    directories.push(root);
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
      { name: '备份失败账本', channel: '长篇' },
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
        schema_version: BigInt(await latestProjectMigrationVersion()),
      });
      expect(
        database
          .prepare("SELECT strict FROM pragma_table_list WHERE name = 'backup_failures'")
          .get(),
      ).toEqual({ strict: 1n });
      expect(() =>
        database
          .prepare(
            `INSERT INTO backup_failures(
               id, project_id, operation, backup_track, error_code, occurred_at, resolved_at
             ) VALUES(?, ?, 'import', 'daily', 'UNKNOWN', ?, NULL)`,
          )
          .run(randomUUID(), project.projectId, clock.now().toISOString()),
      ).toThrow();
      expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      database.close();
    }
  });
});
