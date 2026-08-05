import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { runWithCommandIdentity } from '../../packages/core-service/src/command-identity-context.js';
import {
  ProjectDatabase,
  defineMigration,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-command-identity-'));
  temporaryDirectories.push(directory);
  return path.join(directory, 'project.sqlite');
}

const migration = defineMigration(
  'project',
  1,
  'command_identity_fixture',
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

describe('M10-12 Core命令身份上下文', () => {
  it('同一调用点使用不同规范化输入时拒绝requestId重放', async () => {
    const database = await ProjectDatabase.open({
      path: await databasePath(),
      migrations: [migration],
      appVersion: '0.1.0',
    });
    const requestId = randomUUID();
    const write = (id: string, value: number) =>
      runWithCommandIdentity('core.project.command', { operation: 'write', id, value }, () =>
        database.write(requestId, (connection) => {
          connection.prepare('INSERT INTO writes(id, value) VALUES(?, ?)').run(id, value);
          return value;
        }),
      );

    await expect(write('first', 1)).resolves.toEqual({ value: 1, replayed: false });
    await expect(write('first', 1)).resolves.toEqual({ value: 1, replayed: true });
    await expect(write('second', 2)).rejects.toMatchObject({ code: 'REQUEST_ID_CONFLICT' });
    expect(
      database.read((connection) => connection.prepare('SELECT id, value FROM writes').all()),
    ).toEqual([{ id: 'first', value: 1n }]);
    await database.close();
  });
});
