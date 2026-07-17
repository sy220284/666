import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { openAppRuntime } from '../../packages/core-service/src/app-runtime.js';
import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';
import { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T11:00:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('project structure migration', () => {
  it('upgrades a v1 project only after a verified private SQLite recovery point', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-migration-'));
    temporaryDirectories.push(root);
    const projects = path.join(root, 'projects');
    const v1Migrations = path.join(root, 'project-migrations-v1');
    const recoveryRoot = path.join(root, 'migration-recovery');
    await Promise.all([mkdir(projects), mkdir(v1Migrations)]);
    await writeFile(
      path.join(v1Migrations, '0001_initial.sql'),
      await readFile('migrations/project/0001_initial.sql'),
    );
    const appRuntime = await openAppRuntime({
      databasePath: path.join(root, 'app.sqlite'),
      migrationsDirectory: 'migrations/app',
      recoveryDirectory: path.join(root, 'app-recovery'),
      appVersion: '0.1.0',
      clock,
    });

    const legacyService = new ProjectWorkspaceService({
      projectMigrationsDirectory: v1Migrations,
      projectMigrationRecoveryDirectory: recoveryRoot,
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    const legacy = await legacyService.create(
      randomUUID(),
      { name: '旧项目', channel: '历史', initialStructure: 'blank' },
      projects,
    );
    await legacyService.shutdown();
    expect(
      JSON.parse(await readFile(path.join(legacy.workspacePath, 'manifest.json'), 'utf8')),
    ).toMatchObject({
      projectSchemaVersion: 1,
    });

    const upgradedService = new ProjectWorkspaceService({
      projectMigrationsDirectory: 'migrations/project',
      projectMigrationRecoveryDirectory: recoveryRoot,
      appVersion: '0.1.0',
      recentProjects: appRuntime.recentProjects,
      clock,
    });
    const upgraded = await upgradedService.open(randomUUID(), {
      workspacePath: legacy.workspacePath,
    });
    expect(upgraded).toMatchObject({ schemaVersion: 6, compatibility: 'migrated' });

    const recoveryProjectDirectory = path.join(recoveryRoot, legacy.projectId);
    const recoveryFiles = await readdir(recoveryProjectDirectory);
    expect(recoveryFiles).toHaveLength(1);
    expect(recoveryFiles[0]).toMatch(/^project-v1-to-v6-[0-9a-f-]+\.sqlite$/u);
    const recoveryPath = path.join(recoveryProjectDirectory, recoveryFiles[0]!);
    expect((await stat(recoveryProjectDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(recoveryPath)).mode & 0o777).toBe(0o600);

    const recovery = new DatabaseSync(recoveryPath, { readOnly: true, readBigInts: true });
    expect(recovery.prepare('PRAGMA quick_check').get()).toEqual({ quick_check: 'ok' });
    expect(recovery.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual(
      {
        version: 1n,
      },
    );
    expect(
      recovery
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='volumes'",
        )
        .get(),
    ).toEqual({ count: 0n });
    recovery.close();

    const current = new DatabaseSync(path.join(legacy.workspacePath, 'project.sqlite'), {
      readOnly: true,
      readBigInts: true,
    });
    expect(current.prepare('SELECT max(version) AS version FROM schema_migrations').get()).toEqual({
      version: 6n,
    });
    expect(current.prepare('SELECT schema_version FROM projects').get()).toEqual({
      schema_version: 6n,
    });
    expect(
      current
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='volumes'",
        )
        .get(),
    ).toEqual({ count: 1n });
    expect(
      current
        .prepare(
          "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='draft_patch_log'",
        )
        .get(),
    ).toEqual({ count: 1n });
    current.close();
    expect(
      JSON.parse(await readFile(path.join(legacy.workspacePath, 'manifest.json'), 'utf8')),
    ).toMatchObject({
      projectSchemaVersion: 6,
    });

    await upgradedService.shutdown();
    await appRuntime.close();
  });

  it('rolls back the real v2 schema and project version marker on an injected interruption', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-project-migration-fault-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const initial = await ProjectDatabase.open({
      path: databasePath,
      migrations: [migrations[0]!],
      appVersion: '0.1.0',
      clock,
    });
    await initial.write(randomUUID(), (database) => {
      const timestamp = clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, '故障注入', '测试', NULL, 1, ?, ?)`,
        )
        .run(randomUUID(), timestamp, timestamp);
    });
    await initial.close();

    const interrupted = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
      faultInjector: ({ version, stage }) => {
        if (version === 2 && stage === 'after-sql') {
          throw new Error('injected-v2-interruption');
        }
      },
    });
    expect(interrupted).toMatchObject({
      mode: 'read-only',
      compatibility: 'migration-failed',
      schemaVersion: 1,
    });
    expect(
      interrupted.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='volumes'",
          )
          .get(),
      ),
    ).toEqual({ count: 0n });
    expect(
      interrupted.read((database) => database.prepare('SELECT schema_version FROM projects').get()),
    ).toEqual({ schema_version: 1n });
    await interrupted.close();

    const recovered = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
    });
    expect(recovered).toMatchObject({ schemaVersion: 6, compatibility: 'migrated' });
    expect(
      recovered.read((database) => database.prepare('SELECT schema_version FROM projects').get()),
    ).toEqual({ schema_version: 6n });
    expect(
      recovered.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='drafts'",
          )
          .get(),
      ),
    ).toEqual({ count: 1n });
    expect(
      recovered.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='draft_patch_log'",
          )
          .get(),
      ),
    ).toEqual({ count: 1n });
    await recovered.close();
  });
});
