import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { runWithoutCommandIdentity } from '../../packages/core-service/src/command-identity-context.js';
import {
  AppDatabase,
  ProjectDatabase,
  defineMigration,
} from '../../packages/core-service/src/database/index.js';

const directories: string[] = [];
async function databasePath(name: string): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'worldforge-db-edge-'));
  directories.push(dir);
  return path.join(dir, name);
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const initial = defineMigration(
  'project',
  1,
  'initial',
  'CREATE TABLE items(id TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;',
);
const second = defineMigration('project', 2, 'second', 'ALTER TABLE items ADD COLUMN note TEXT;');

describe('database lifecycle edge coverage', () => {
  it('rejects the in-memory production database path', async () => {
    await expect(
      ProjectDatabase.open({ path: ':memory:', migrations: [initial], appVersion: '1.0.0' }),
    ).rejects.toMatchObject({ code: 'DATABASE_OPEN_FAILED' });
  });

  it('wraps a failed required pre-migration recovery point', async () => {
    const file = await databasePath('migration.sqlite');
    const first = await ProjectDatabase.open({
      path: file,
      migrations: [initial],
      appVersion: '1',
    });
    await first.close();

    await expect(
      ProjectDatabase.open({
        path: file,
        migrations: [initial, second],
        appVersion: '2',
        prepareRecoveryPoint: async () => {
          throw new Error('backup unavailable');
        },
      }),
    ).rejects.toMatchObject({ code: 'MIGRATION_RECOVERY_POINT_FAILED' });
  });

  it('rejects invalid request ids and missing command identity before starting a write', async () => {
    const file = await databasePath('identity.sqlite');
    const database = await ProjectDatabase.open({
      path: file,
      migrations: [initial],
      appVersion: '1',
    });

    await expect(database.write('bad-id', () => undefined, 'command')).rejects.toMatchObject({
      code: 'REQUEST_ID_INVALID',
    });
    await expect(
      runWithoutCommandIdentity(() => database.write(randomUUID(), () => undefined)),
    ).rejects.toMatchObject({ code: 'COMMAND_IDENTITY_REQUIRED' });
    await database.close();
  });

  it('rejects checkpoint in read-only compatibility mode and allows queue-less drain', async () => {
    const file = await databasePath('future.sqlite');
    const migration = defineMigration(
      'app',
      1,
      'initial',
      'CREATE TABLE stable(id INTEGER PRIMARY KEY) STRICT;',
    );
    const current = await AppDatabase.open({
      path: file,
      migrations: [migration],
      appVersion: '1',
    });
    await current.close();

    const changed = defineMigration(
      'app',
      1,
      'initial',
      'CREATE TABLE stable(id INTEGER PRIMARY KEY, changed TEXT) STRICT;',
    );
    const readOnly = await AppDatabase.open({ path: file, migrations: [changed], appVersion: '1' });
    expect(readOnly.mode).toBe('read-only');
    await expect(readOnly.checkpoint()).rejects.toMatchObject({ code: 'DATABASE_READ_ONLY' });
    await expect(readOnly.drain()).resolves.toBeUndefined();
    await readOnly.close();
  });

  it('makes close idempotent and rejects every database operation after close', async () => {
    const file = await databasePath('closed.sqlite');
    const database = await ProjectDatabase.open({
      path: file,
      migrations: [initial],
      appVersion: '1',
    });
    await database.close();
    await expect(database.close()).resolves.toBeUndefined();

    expect(() => database.read(() => 1)).toThrowError(
      expect.objectContaining({ code: 'DATABASE_CLOSED' }),
    );
    expect(() => database.quickCheck()).toThrowError(
      expect.objectContaining({ code: 'DATABASE_CLOSED' }),
    );
    expect(() => database.integrityCheck()).toThrowError(
      expect.objectContaining({ code: 'DATABASE_CLOSED' }),
    );
    expect(() => database.foreignKeyCheck()).toThrowError(
      expect.objectContaining({ code: 'DATABASE_CLOSED' }),
    );
    await expect(database.checkpoint()).rejects.toMatchObject({ code: 'DATABASE_CLOSED' });
    await expect(
      database.write(randomUUID(), () => undefined, 'closed-command'),
    ).rejects.toMatchObject({
      code: 'DATABASE_CLOSED',
    });
  });

  it('rolls back synchronous non-SQLite errors and stays usable', async () => {
    const file = await databasePath('rollback.sqlite');
    const database = await ProjectDatabase.open({
      path: file,
      migrations: [initial],
      appVersion: '1',
    });
    const failure = new Error('author operation failed');
    await expect(
      database.write(
        randomUUID(),
        (connection) => {
          connection
            .prepare('INSERT INTO items(id, value) VALUES(?, ?)')
            .run('one', 'before-error');
          throw failure;
        },
        'rollback-command',
      ),
    ).rejects.toBe(failure);
    expect(
      database.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM items').get(),
      ),
    ).toEqual({ count: 0n });
    await database.close();
  });

  it('opens a gapped migration history in read-only integrity-failed mode', async () => {
    const file = await databasePath('history-gap.sqlite');
    const raw = new DatabaseSync(file);
    raw.exec(`
      CREATE TABLE schema_migrations(
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        checksum TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        app_version TEXT NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations VALUES(1, 'one', 'x', '2026-08-17T00:00:00.000Z', '1');
      INSERT INTO schema_migrations VALUES(3, 'three', 'z', '2026-08-17T00:00:00.000Z', '1');
    `);
    raw.close();
    const migrations = [
      defineMigration('project', 1, 'one', 'SELECT 1;'),
      defineMigration('project', 2, 'two', 'SELECT 2;'),
      defineMigration('project', 3, 'three', 'SELECT 3;'),
    ];
    const database = await ProjectDatabase.open({ path: file, migrations, appVersion: '1' });
    expect(database).toMatchObject({
      mode: 'read-only',
      compatibility: 'integrity-failed',
      lastErrorCode: 'MIGRATION_HISTORY_INVALID',
    });
    await database.close();
  });

  it('closes the probe and propagates malformed migration-table SQLite errors', async () => {
    const file = await databasePath('malformed-history.sqlite');
    const raw = new DatabaseSync(file);
    raw.exec(
      'CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL) STRICT;',
    );
    raw.close();
    await expect(
      ProjectDatabase.open({ path: file, migrations: [initial], appVersion: '1' }),
    ).rejects.toMatchObject({ code: expect.stringContaining('ERR_SQLITE') });
  });

  it('supports a file-backed database with an empty migration set', async () => {
    const file = await databasePath('empty.sqlite');
    const database = await ProjectDatabase.open({ path: file, migrations: [], appVersion: '1' });
    expect(database).toMatchObject({
      mode: 'read-write',
      compatibility: 'current',
      schemaVersion: 0,
    });
    await database.close();
  });

  it('reports null row ids for WITHOUT ROWID foreign-key violations', async () => {
    const file = await databasePath('without-rowid.sqlite');
    const migration = defineMigration(
      'project',
      1,
      'foreign_keys',
      `
        CREATE TABLE parents(id TEXT PRIMARY KEY) WITHOUT ROWID;
        CREATE TABLE children(
          id TEXT PRIMARY KEY,
          parent_id TEXT NOT NULL REFERENCES parents(id)
        ) WITHOUT ROWID;
      `,
    );
    const healthy = await ProjectDatabase.open({
      path: file,
      migrations: [migration],
      appVersion: '1',
    });
    await healthy.close();
    const raw = new DatabaseSync(file);
    raw.exec('PRAGMA foreign_keys = OFF');
    raw.prepare('INSERT INTO children(id, parent_id) VALUES(?, ?)').run('child', 'missing');
    raw.close();
    const damaged = await ProjectDatabase.open({
      path: file,
      migrations: [migration],
      appVersion: '1',
    });
    expect(damaged.foreignKeyCheck()[0]).toMatchObject({ rowId: null, foreignKeyId: 0n });
    await damaged.close();
  });
});
