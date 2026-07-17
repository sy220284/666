import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { corruptSqliteHeader } from '../../packages/testkit/src/index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('SQLite header integrity fault', () => {
  it('makes a deliberately damaged closed database fail integrity access', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-header-integrity-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'damaged.sqlite');
    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE intact(value TEXT);');
    database.close();

    await expect(corruptSqliteHeader(databasePath)).resolves.toMatchObject({
      injectedMarker: 'WF_CORRUPTED_DB!',
    });
    expect(() => {
      const damaged = new DatabaseSync(databasePath);
      try {
        damaged.prepare('PRAGMA schema_version').get();
      } finally {
        if (damaged.isOpen) damaged.close();
      }
    }).toThrow();
  });
});
