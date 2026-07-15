import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ProjectDatabase,
  defineMigration,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-queue-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'project.sqlite');
}

const migration = defineMigration(
  'project',
  1,
  'write_fixture',
  `
    CREATE TABLE writes(
      id TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    ) STRICT;
  `,
);

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('serialized SQLite write queue', () => {
  it('commits 100 concurrent requests without lost writes or SQLITE_BUSY', async () => {
    const filePath = await databasePath();
    const database = await ProjectDatabase.open({
      path: filePath,
      migrations: [migration],
      appVersion: '0.1.0',
    });

    const writes = Array.from({ length: 100 }, (_, index) =>
      database.write(randomUUID(), (connection) => {
        connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(randomUUID(), index);
        return index;
      }),
    );
    await expect(Promise.all(writes)).resolves.toHaveLength(100);
    expect(
      database.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM writes').get(),
      ),
    ).toEqual({ count: 100n });
    await database.close();
  });

  it('returns the original result for a concurrent duplicate requestId', async () => {
    const filePath = await databasePath();
    const database = await ProjectDatabase.open({
      path: filePath,
      migrations: [migration],
      appVersion: '0.1.0',
    });
    const requestId = randomUUID();
    let executions = 0;
    const operation = (connection: DatabaseSync): number => {
      executions += 1;
      connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(randomUUID(), 42);
      return 42;
    };

    const [first, duplicate] = await Promise.all([
      database.write(requestId, operation),
      database.write(requestId, operation),
    ]);

    expect(executions).toBe(1);
    expect(first).toEqual({ value: 42, replayed: false });
    expect(duplicate).toEqual({ value: 42, replayed: true });
    expect(
      database.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM writes').get(),
      ),
    ).toEqual({ count: 1n });
    await database.close();
  });

  it('rolls back interrupted transactions and drains accepted writes before close', async () => {
    const filePath = await databasePath();
    const database = await ProjectDatabase.open({
      path: filePath,
      migrations: [migration],
      appVersion: '0.1.0',
    });

    await expect(
      database.write(randomUUID(), (connection) => {
        connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(randomUUID(), -1);
        throw new Error('INTERRUPTED_WRITE');
      }),
    ).rejects.toThrow('INTERRUPTED_WRITE');
    expect(
      database.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM writes').get(),
      ),
    ).toEqual({ count: 0n });

    await expect(
      database.write(randomUUID(), async (connection) => {
        connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(randomUUID(), -2);
        return -2;
      }),
    ).rejects.toMatchObject({ code: 'DATABASE_WRITE_FAILED' });
    expect(
      database.read((connection) =>
        connection.prepare('SELECT count(*) AS count FROM writes').get(),
      ),
    ).toEqual({ count: 0n });

    const accepted = Array.from({ length: 100 }, (_, index) =>
      database.write(randomUUID(), (connection) => {
        connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(randomUUID(), index);
        return index;
      }),
    );
    await database.close();
    await expect(Promise.all(accepted)).resolves.toHaveLength(100);

    const reopened = new DatabaseSync(filePath, { readOnly: true });
    expect(reopened.prepare('SELECT count(*) AS count FROM writes').get()).toEqual({ count: 100 });
    reopened.close();
  });
});
