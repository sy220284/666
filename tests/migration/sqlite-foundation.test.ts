import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { failMigrationAt } from '../../packages/testkit/src/index.js';
import {
  AppDatabase,
  DatabaseFoundationError,
  ProjectDatabase,
  defineMigration,
  latestMigrationVersion,
  loadMigrations,
  type SqlMigration,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

async function temporaryDatabase(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-database-'));
  temporaryDirectories.push(directory);
  return path.join(directory, name);
}

const scalar = (database: DatabaseSync, sql: string): unknown => {
  const row = database.prepare(sql).get();
  return row ? Object.values(row)[0] : undefined;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SQLite foundation migrations', () => {
  it('creates the app database with frozen pragmas and no project-content tables', async () => {
    const databasePath = await temporaryDatabase('app.sqlite');
    const migrations = await loadMigrations('migrations/app', 'app');
    const database = await AppDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
      clock: { now: () => new Date('2026-07-15T01:02:03.456Z') },
    });

    expect(database.mode).toBe('read-write');
    expect(database.compatibility).toBe('migrated');
    expect(database.schemaVersion).toBe(2);
    expect(
      database.read((connection) => ({
        journalMode: scalar(connection, 'PRAGMA journal_mode'),
        foreignKeys: scalar(connection, 'PRAGMA foreign_keys'),
        busyTimeout: scalar(connection, 'PRAGMA busy_timeout'),
        synchronous: scalar(connection, 'PRAGMA synchronous'),
      })),
    ).toEqual({ journalMode: 'wal', foreignKeys: 1n, busyTimeout: 5000n, synchronous: 1n });

    const tables = database.read((connection) =>
      connection
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
    );
    expect(tables).toEqual([
      'app_settings',
      'provider_configs',
      'recent_projects',
      'schema_migrations',
      'window_preferences',
    ]);
    expect(tables).not.toEqual(expect.arrayContaining(['drafts', 'candidates', 'versions']));

    const providerColumns = database.read((connection) =>
      connection
        .prepare('PRAGMA table_info(provider_configs)')
        .all()
        .map((row) => row.name),
    );
    expect(providerColumns).toContain('credential_ref');
    expect(providerColumns).not.toEqual(
      expect.arrayContaining(['credential', 'api_key', 'secret']),
    );
    expect(
      database.read((connection) =>
        connection
          .prepare(
            'SELECT version, name, checksum, applied_at, app_version FROM schema_migrations ORDER BY version',
          )
          .all(),
      ),
    ).toEqual([
      {
        version: 1n,
        name: 'initial',
        checksum: migrations[0]?.checksum,
        applied_at: '2026-07-15T01:02:03.456Z',
        app_version: '0.1.0',
      },
      {
        version: 2n,
        name: 'window_preferences',
        checksum: migrations[1]?.checksum,
        applied_at: '2026-07-15T01:02:03.456Z',
        app_version: '0.1.0',
      },
    ]);
    await database.close();
  });

  it('reopens an applied migration without changing history', async () => {
    const databasePath = await temporaryDatabase('project.sqlite');
    const migrations = await loadMigrations('migrations/project', 'project');
    const latestProjectSchemaVersion = latestMigrationVersion(migrations);
    const first = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
    });
    expect(first.compatibility).toBe('migrated');
    await first.close();

    const second = await ProjectDatabase.open({
      path: databasePath,
      migrations,
      appVersion: '0.1.0',
    });
    expect(second.compatibility).toBe('current');
    expect(
      second.read((connection) =>
        connection
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
          )
          .all()
          .map((row) => row.name),
      ),
    ).toEqual([
      'arc_milestone_dependencies',
      'arc_milestone_timeline_dependencies',
      'arc_milestones',
      'backup_records',
      'candidate_apply_checkpoints',
      'candidate_apply_records',
      'candidate_block_sources',
      'candidate_blocks',
      'candidate_conflict_sets',
      'candidates',
      'canon_facts',
      'chapters',
      'character_arcs',
      'draft_blocks',
      'draft_patch_log',
      'drafts',
      'entities',
      'entity_states',
      'foreshadowing_chapters',
      'foreshadowing_relations',
      'foreshadowings',
      'knowledge_states',
      'migration_journal',
      'plot_nodes',
      'project_briefs',
      'projects',
      'scene_beat_block_links',
      'scene_beat_entities',
      'scene_beats',
      'schema_migrations',
      'timeline_event_dependencies',
      'timeline_event_entities',
      'timeline_events',
      'trash_entries',
      'version_blocks',
      'versions',
      'volumes',
    ]);
    expect(
      second.read((connection) => scalar(connection, 'SELECT count(*) FROM schema_migrations')),
    ).toBe(BigInt(latestProjectSchemaVersion));
    expect(second.capabilities).toEqual({ fts5: true, trigram: true });
    expect(second.quickCheck()).toEqual({ ok: true, messages: ['ok'] });
    expect(second.integrityCheck()).toEqual({ ok: true, messages: ['ok'] });
    expect(second.foreignKeyCheck()).toEqual([]);
    await expect(second.checkpoint('PASSIVE')).resolves.toMatchObject({ busy: 0 });
    await second.close();
  });

  it('rolls back the whole migration when a deterministic fault is injected', async () => {
    const databasePath = await temporaryDatabase('project.sqlite');
    const first = defineMigration(
      'project',
      1,
      'initial',
      'CREATE TABLE first_table(id INTEGER PRIMARY KEY) STRICT;',
    );
    const second = defineMigration(
      'project',
      2,
      'second',
      'CREATE TABLE second_table(id INTEGER PRIMARY KEY) STRICT;',
    );
    const database = await ProjectDatabase.open({
      path: databasePath,
      migrations: [first],
      appVersion: '0.1.0',
    });
    await database.close();

    await expect(
      ProjectDatabase.open({
        path: databasePath,
        migrations: [first, second],
        appVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_RECOVERY_POINT_REQUIRED' });

    const interrupted = await ProjectDatabase.open({
      path: databasePath,
      migrations: [first, second],
      appVersion: '0.1.0',
      prepareRecoveryPoint: async () => undefined,
      faultInjector: failMigrationAt({ version: 2, stage: 'after-sql' }),
    });
    expect(interrupted).toMatchObject({
      mode: 'read-only',
      compatibility: 'migration-failed',
      schemaVersion: 1,
      lastErrorCode: 'MIGRATION_FAILED',
    });
    await interrupted.close();

    const raw = new DatabaseSync(databasePath);
    expect(
      scalar(raw, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='second_table'"),
    ).toBe(0);
    expect(scalar(raw, 'SELECT count(*) FROM schema_migrations')).toBe(1);
    raw.close();

    const recovered = await ProjectDatabase.open({
      path: databasePath,
      migrations: [first, second],
      appVersion: '0.1.0',
      prepareRecoveryPoint: async (context) => {
        expect(context).toMatchObject({
          kind: 'project',
          databasePath,
          fromVersion: 1,
          toVersion: 2,
        });
      },
    });
    expect(recovered.schemaVersion).toBe(2);
    await recovered.close();
  });

  it('opens checksum mismatches and future schemas read-only', async () => {
    const checksumPath = await temporaryDatabase('checksum.sqlite');
    const original = defineMigration(
      'project',
      1,
      'initial',
      'CREATE TABLE stable(id INTEGER PRIMARY KEY) STRICT;',
    );
    const initial = await ProjectDatabase.open({
      path: checksumPath,
      migrations: [original],
      appVersion: '0.1.0',
    });
    await initial.close();

    const changed = defineMigration(
      'project',
      1,
      'initial',
      'CREATE TABLE stable(id INTEGER PRIMARY KEY, changed TEXT) STRICT;',
    );
    const checksumMismatch = await ProjectDatabase.open({
      path: checksumPath,
      migrations: [changed],
      appVersion: '0.1.0',
    });
    expect(checksumMismatch).toMatchObject({
      mode: 'read-only',
      compatibility: 'checksum-mismatch',
      lastErrorCode: 'MIGRATION_CHECKSUM_MISMATCH',
    });
    await expect(checksumMismatch.write(randomUUID(), () => 'forbidden')).rejects.toMatchObject({
      code: 'DATABASE_READ_ONLY',
    });
    await checksumMismatch.close();

    const futurePath = await temporaryDatabase('future.sqlite');
    const raw = new DatabaseSync(futurePath);
    raw.exec(`
      CREATE TABLE schema_migrations(
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        app_version TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES(99, 'future', 'future-checksum', '2026-07-15T00:00:00.000Z', '9.0.0');
    `);
    raw.close();

    const future = await ProjectDatabase.open({
      path: futurePath,
      migrations: [original],
      appVersion: '0.1.0',
    });
    expect(future).toMatchObject({
      mode: 'read-only',
      compatibility: 'future-schema',
      schemaVersion: 99,
      lastErrorCode: 'DATABASE_FUTURE_SCHEMA',
    });
    await future.close();
  });

  it('stops writes but preserves reads when an integrity check finds broken foreign keys', async () => {
    const databasePath = await temporaryDatabase('integrity.sqlite');
    const migration = defineMigration(
      'project',
      1,
      'foreign_keys',
      `
        CREATE TABLE parents(id TEXT PRIMARY KEY) STRICT;
        CREATE TABLE children(
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES parents(id)
        ) STRICT;
      `,
    );
    const healthy = await ProjectDatabase.open({
      path: databasePath,
      migrations: [migration],
      appVersion: '0.1.0',
    });
    await healthy.close();

    const raw = new DatabaseSync(databasePath);
    raw.exec('PRAGMA foreign_keys = OFF');
    raw.prepare('INSERT INTO children(id, parent_id) VALUES(?, ?)').run('child-1', 'missing');
    raw.close();

    const damaged = await ProjectDatabase.open({
      path: databasePath,
      migrations: [migration],
      appVersion: '0.1.0',
    });
    expect(damaged).toMatchObject({
      mode: 'read-only',
      compatibility: 'integrity-failed',
      lastErrorCode: 'DATABASE_INTEGRITY_FAILED',
    });
    expect(
      damaged.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM children').get(),
      ),
    ).toEqual({ count: 1n });
    expect(damaged.foreignKeyCheck()).toHaveLength(1);
    await expect(damaged.write(randomUUID(), () => undefined)).rejects.toMatchObject({
      code: 'DATABASE_READ_ONLY',
    });
    await damaged.close();
  });

  it('rejects migration gaps before touching a database', async () => {
    const databasePath = await temporaryDatabase('gap.sqlite');
    const migrations: SqlMigration[] = [
      defineMigration('app', 1, 'initial', 'CREATE TABLE one(id INTEGER PRIMARY KEY) STRICT;'),
      defineMigration('app', 3, 'gap', 'CREATE TABLE three(id INTEGER PRIMARY KEY) STRICT;'),
    ];

    await expect(
      AppDatabase.open({ path: databasePath, migrations, appVersion: '0.1.0' }),
    ).rejects.toBeInstanceOf(DatabaseFoundationError);
    await expect(
      AppDatabase.open({ path: databasePath, migrations, appVersion: '0.1.0' }),
    ).rejects.toMatchObject({ code: 'MIGRATION_SEQUENCE_INVALID' });

    await expect(
      AppDatabase.open({
        path: databasePath,
        migrations: [
          defineMigration(
            'project',
            1,
            'wrong_kind',
            'CREATE TABLE wrong_kind(id INTEGER PRIMARY KEY) STRICT;',
          ),
        ],
        appVersion: '0.1.0',
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_SEQUENCE_INVALID' });
  });
});
