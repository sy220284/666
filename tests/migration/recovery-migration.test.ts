import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-17T02:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('M1-08 BackupRecord migration', () => {
  it('upgrades v5 through current project schema with verified backup records', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-migration-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v5 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 5),
      appVersion: '0.1.0',
      clock,
    });
    await v5.close();
    const upgraded = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
    });
    expect(upgraded).toMatchObject({ schemaVersion: 11, compatibility: 'migrated' });
    expect(
      upgraded.read((database) =>
        database
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='backup_records'")
          .get(),
      ),
    ).toEqual({ name: 'backup_records' });
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA foreign_key_list(backup_records)')
          .all()
          .map((row) => ({ table: row.table, from: row.from, to: row.to })),
      ),
    ).toContainEqual({ table: 'projects', from: 'project_id', to: 'id' });
    expect(
      upgraded.read((database) =>
        database
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='candidates'")
          .get(),
      ),
    ).toEqual({ name: 'candidates' });
    await upgraded.close();
  });

  it('rolls back the complete v6 table when migration is interrupted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-migration-fault-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v5 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 5),
      appVersion: '0.1.0',
      clock,
    });
    await v5.close();
    const interrupted = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
      faultInjector: ({ version, stage }) => {
        if (version === 6 && stage === 'after-sql') throw new Error('injected-v6-interruption');
      },
    });
    expect(interrupted).toMatchObject({
      mode: 'read-only',
      compatibility: 'migration-failed',
      schemaVersion: 5,
    });
    expect(
      interrupted.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='backup_records'",
          )
          .get(),
      ),
    ).toEqual({ count: 0n });
    await interrupted.close();
  });
});
