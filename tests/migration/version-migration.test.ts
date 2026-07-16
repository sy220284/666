import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T18:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M1-07 Version schema migration', () => {
  it('upgrades v4 to v5 with Version and VersionBlock ownership constraints', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-version-migration-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v4 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 4),
      appVersion: '0.1.0',
      clock,
    });
    await v4.close();

    const upgraded = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
    });
    expect(upgraded).toMatchObject({ schemaVersion: 5, compatibility: 'migrated' });
    expect(
      upgraded.read((database) =>
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('versions','version_blocks') ORDER BY name",
          )
          .all()
          .map((row) => row.name),
      ),
    ).toEqual(['version_blocks', 'versions']);
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA foreign_key_list(version_blocks)')
          .all()
          .map((row) => ({ table: row.table, from: row.from, to: row.to })),
      ),
    ).toContainEqual({ table: 'versions', from: 'version_id', to: 'id' });
    expect(upgraded.foreignKeyCheck()).toEqual([]);
    await upgraded.close();
  });

  it('rolls back all Version tables when v5 is interrupted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-version-migration-fault-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v4 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 4),
      appVersion: '0.1.0',
      clock,
    });
    await v4.close();

    const interrupted = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
      faultInjector: ({ version, stage }) => {
        if (version === 5 && stage === 'after-sql') throw new Error('injected-v5-interruption');
      },
    });
    expect(interrupted).toMatchObject({
      mode: 'read-only',
      compatibility: 'migration-failed',
      schemaVersion: 4,
    });
    expect(
      interrupted.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('versions','version_blocks')",
          )
          .get(),
      ),
    ).toEqual({ count: 0n });
    await interrupted.close();
  });
});
