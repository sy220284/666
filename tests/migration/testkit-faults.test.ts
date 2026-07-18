import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { AppDatabase, defineMigration } from '../../packages/core-service/src/database/index.js';
import {
  acquireSqliteWriteLock,
  createSqliteDiskFullFault,
  createTemporaryWorldforgeWorkspace,
  failMigrationAt,
  failTransactionAfter,
  isSqliteBusyError,
  isSqliteFullError,
} from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-testkit-fault-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('temporary WorldForge workspace', () => {
  it('rejects project IDs that could escape the temporary root', async () => {
    await expect(
      createTemporaryWorldforgeWorkspace({
        parentDirectory: await temporaryDirectory(),
        projectId: '../../outside',
      }),
    ).rejects.toThrow(/must be a UUID/);
  });

  it('opens production app/project migrations and removes every file idempotently', async () => {
    const parentDirectory = await temporaryDirectory();
    const workspace = await createTemporaryWorldforgeWorkspace({ parentDirectory });
    expect(workspace.appDatabase.mode).toBe('read-write');
    expect(workspace.projectDatabase.mode).toBe('read-write');
    expect(workspace.appDatabase.schemaVersion).toBe(2);
    expect(workspace.projectDatabase.schemaVersion).toBe(8);
    expect(
      workspace.appDatabase.read((database) =>
        database.prepare('SELECT count(*) AS count FROM schema_migrations').get(),
      ),
    ).toEqual({ count: 2n });

    await workspace.cleanup();
    await workspace.cleanup();
    await expect(access(workspace.rootDirectory)).rejects.toThrow();
  });

  it('rolls back a write whose injected transaction fault fires after mutation', async () => {
    const workspace = await createTemporaryWorldforgeWorkspace({
      parentDirectory: await temporaryDirectory(),
    });
    try {
      await expect(
        workspace.appDatabase.write(
          workspace.ids.nextUuid(),
          failTransactionAfter((database) =>
            database
              .prepare('INSERT INTO app_settings(key, value_json, updated_at) VALUES(?, ?, ?)')
              .run('fault-probe', '{}', workspace.clock.now().toISOString()),
          ),
        ),
      ).rejects.toMatchObject({ fault: 'transaction-interrupted' });
      expect(
        workspace.appDatabase.read(
          (database) =>
            database
              .prepare("SELECT count(*) AS count FROM app_settings WHERE key='fault-probe'")
              .get()?.count,
        ),
      ).toBe(0n);
    } finally {
      await workspace.cleanup();
    }
  });
});

describe('actual SQLite fault injection', () => {
  it('holds a real write lock until SQLITE_BUSY is observed', async () => {
    const databasePath = path.join(await temporaryDirectory(), 'busy.sqlite');
    const setup = new DatabaseSync(databasePath);
    setup.exec('CREATE TABLE writes(value TEXT NOT NULL);');
    setup.close();

    const fault = acquireSqliteWriteLock(databasePath);
    let observed: unknown;
    try {
      fault.attempt((database) => database.exec("INSERT INTO writes(value) VALUES('blocked')"));
    } catch (error) {
      observed = error;
    } finally {
      fault.release();
    }
    expect(isSqliteBusyError(observed)).toBe(true);

    const recovered = new DatabaseSync(databasePath);
    recovered.exec("INSERT INTO writes(value) VALUES('recovered')");
    expect(recovered.prepare('SELECT count(*) AS count FROM writes').get()?.count).toBe(1);
    recovered.close();
  });

  it('caps real SQLite pages until SQLITE_FULL is observed and rolls back', async () => {
    const databasePath = path.join(await temporaryDirectory(), 'full.sqlite');
    const fault = createSqliteDiskFullFault(databasePath);
    let observed: unknown;
    try {
      fault.trigger();
    } catch (error) {
      observed = error;
    } finally {
      fault.release();
    }
    expect(isSqliteFullError(observed)).toBe(true);
  });

  it('fires inside the production migration transaction and leaves no partial schema', async () => {
    const databasePath = path.join(await temporaryDirectory(), 'migration.sqlite');
    const database = await AppDatabase.open({
      path: databasePath,
      migrations: [
        defineMigration(
          'app',
          1,
          'fault_probe',
          'CREATE TABLE should_rollback(id TEXT PRIMARY KEY) STRICT;',
        ),
      ],
      appVersion: '0.0.0-test',
      faultInjector: failMigrationAt({ version: 1, stage: 'after-sql' }),
    });
    try {
      expect(database).toMatchObject({
        mode: 'read-only',
        compatibility: 'migration-failed',
        lastErrorCode: 'MIGRATION_FAILED',
      });
      expect(
        database.read(
          (connection) =>
            connection
              .prepare("SELECT count(*) AS count FROM sqlite_master WHERE name='should_rollback'")
              .get()?.count,
        ),
      ).toBe(0n);
    } finally {
      await database.close();
    }
  });
});
