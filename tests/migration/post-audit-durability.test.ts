import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import {
  AppDatabase,
  ProjectDatabase,
  loadMigrations,
  type ManagedDatabase,
} from '../../packages/core-service/src/database/index.js';

const temporaryDirectories: string[] = [];

async function temporaryDatabase(name: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'worldforge-durability-'));
  temporaryDirectories.push(directory);
  return path.join(directory, name);
}

function synchronousLevel(connection: DatabaseSync): number {
  const row = connection.prepare('PRAGMA synchronous').get();
  return Number(row ? Object.values(row)[0] : -1);
}

async function writerSynchronousLevel(database: ManagedDatabase): Promise<number> {
  return (
    await database.write(
      randomUUID(),
      (connection) => synchronousLevel(connection),
      'post-audit-durability-probe',
    )
  ).value;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('post-audit SQLite durability policy', () => {
  it('uses FULL synchronous commits for project author data', async () => {
    const database = await ProjectDatabase.open({
      path: await temporaryDatabase('project.sqlite'),
      migrations: await loadMigrations('migrations/project', 'project'),
      appVersion: 'post-audit',
    });
    try {
      await expect(writerSynchronousLevel(database)).resolves.toBe(2);
    } finally {
      await database.close();
    }
  });

  it('keeps app metadata on NORMAL synchronous commits', async () => {
    const database = await AppDatabase.open({
      path: await temporaryDatabase('app.sqlite'),
      migrations: await loadMigrations('migrations/app', 'app'),
      appVersion: 'post-audit',
    });
    try {
      await expect(writerSynchronousLevel(database)).resolves.toBe(1);
    } finally {
      await database.close();
    }
  });
});
