import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { remapProjectIdentity } from '../../packages/core-service/src/recovery.js';

const temporaryDirectories: string[] = [];

function openDatabase(databasePath: string): DatabaseSync {
  return new DatabaseSync(databasePath, {
    allowExtension: false,
    enableForeignKeyConstraints: true,
    readBigInts: true,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('M1-08 recovered project identity remap', () => {
  it('rolls back the identity change when foreign_key_check fails before commit', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-remap-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'project.sqlite');
    const previousProjectId = randomUUID();
    const nextProjectId = randomUUID();
    const database = openDatabase(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects(
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE project_children(
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id)
        ) STRICT;
        CREATE TRIGGER inject_invalid_project_reference
        AFTER UPDATE OF id ON projects
        BEGIN
          INSERT INTO project_children(id, project_id)
          VALUES('invalid-child', 'missing-project');
        END;
      `);
      database
        .prepare('INSERT INTO projects(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)')
        .run(previousProjectId, '原项目', '2026-07-23T00:00:00.000Z', '2026-07-23T00:00:00.000Z');
    } finally {
      database.close();
    }

    expect(() =>
      remapProjectIdentity(
        databasePath,
        previousProjectId,
        nextProjectId,
        '恢复副本',
        '2026-07-23T01:00:00.000Z',
      ),
    ).toThrow('PROJECT_ID_REMAP_FOREIGN_KEY_FAILED');

    const verified = openDatabase(databasePath);
    try {
      expect(verified.prepare('SELECT id, name FROM projects').all()).toEqual([
        { id: previousProjectId, name: '原项目' },
      ]);
      expect(verified.prepare('SELECT COUNT(*) AS count FROM project_children').get()).toEqual({
        count: 0n,
      });
      expect(verified.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      verified.close();
    }
  });
});
