import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ProjectDatabase, loadMigrations } from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];
const clock = { now: () => new Date('2026-07-16T13:30:00.000Z') };

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Draft schema migration', () => {
  it('upgrades a real v2 chapter to v3 with Draft tables and active Draft FKs', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-draft-migration-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v2 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 2),
      appVersion: '0.1.0',
      clock,
    });
    const projectId = randomUUID();
    const volumeId = randomUUID();
    const chapterId = randomUUID();
    await v2.write(randomUUID(), (database) => {
      const timestamp = clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO projects(
             id, name, channel, active_style_profile_id, schema_version, created_at, updated_at
           ) VALUES(?, '迁移正文', '长篇', NULL, 2, ?, ?)`,
        )
        .run(projectId, timestamp, timestamp);
      database
        .prepare(
          `INSERT INTO volumes(id, project_id, title, order_key, status, deleted_at)
           VALUES(?, ?, '第一卷', 1024, 'pending', NULL)`,
        )
        .run(volumeId, projectId);
      database
        .prepare(
          `INSERT INTO chapters(
             id, volume_id, title, order_key, status, target_word_min, target_word_max,
             active_draft_id, final_version_id, deleted_at
           ) VALUES(?, ?, '第一章', 1024, 'pending', NULL, NULL, NULL, NULL, NULL)`,
        )
        .run(chapterId, volumeId);
    });
    await v2.close();

    const upgraded = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 3),
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
    });
    expect(upgraded).toMatchObject({ schemaVersion: 3, compatibility: 'migrated' });
    expect(
      upgraded.read((database) =>
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('drafts','draft_blocks') ORDER BY name",
          )
          .all()
          .map((row) => row.name),
      ),
    ).toEqual(['draft_blocks', 'drafts']);
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA foreign_key_list(chapters)')
          .all()
          .map((row) => ({ table: row.table, from: row.from, to: row.to })),
      ),
    ).toEqual(
      expect.arrayContaining([
        { table: 'drafts', from: 'active_draft_id', to: 'id' },
        { table: 'volumes', from: 'volume_id', to: 'id' },
      ]),
    );
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA foreign_key_list(drafts)')
          .all()
          .map((row) => ({ table: row.table, from: row.from, to: row.to })),
      ),
    ).toContainEqual({ table: 'chapters', from: 'chapter_id', to: 'id' });
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA foreign_key_list(draft_blocks)')
          .all()
          .map((row) => ({ table: row.table, from: row.from, to: row.to })),
      ),
    ).toContainEqual({ table: 'drafts', from: 'draft_id', to: 'id' });
    expect(upgraded.foreignKeyCheck()).toEqual([]);
    expect(
      upgraded.read((database) => database.prepare('SELECT schema_version FROM projects').get()),
    ).toEqual({ schema_version: 3n });
    await upgraded.close();
  });

  it('upgrades v3 to v4 with a persistent requestId Patch log', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-patch-migration-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v3 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 3),
      appVersion: '0.1.0',
      clock,
    });
    await v3.close();

    const upgraded = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 4),
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
    });
    expect(upgraded).toMatchObject({ schemaVersion: 4, compatibility: 'migrated' });
    expect(
      upgraded.read((database) =>
        database
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='draft_patch_log'")
          .get(),
      ),
    ).toEqual({ name: 'draft_patch_log' });
    expect(
      upgraded.read((database) =>
        database
          .prepare('PRAGMA index_list(draft_patch_log)')
          .all()
          .map((row) => row.name),
      ),
    ).toEqual(
      expect.arrayContaining([
        'idx_draft_patch_log_draft_revision',
        'sqlite_autoindex_draft_patch_log_2',
      ]),
    );
    expect(upgraded.foreignKeyCheck()).toEqual([]);
    await upgraded.close();
  });

  it('rolls back all v3 DDL when the migration transaction is interrupted', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-draft-migration-fault-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const v2 = await ProjectDatabase.open({
      path: databasePath,
      migrations: migrations.slice(0, 2),
      appVersion: '0.1.0',
      clock,
    });
    await v2.close();

    const interrupted = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock,
      prepareRecoveryPoint: async () => undefined,
      faultInjector: ({ version, stage }) => {
        if (version === 3 && stage === 'after-sql') throw new Error('injected-v3-interruption');
      },
    });
    expect(interrupted).toMatchObject({
      mode: 'read-only',
      compatibility: 'migration-failed',
      schemaVersion: 2,
    });
    expect(
      interrupted.read((database) =>
        database
          .prepare(
            "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name='drafts'",
          )
          .get(),
      ),
    ).toEqual({ count: 0n });
    await interrupted.close();
  });
});
