import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { remapProjectIdentity } from '../../packages/core-service/src/recovery/backup-restore.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('recovery project clone semantic revision', () => {
  it('regenerates semantic_revision after trigger-driven project id remap', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'worldforge-clone-semantic-revision-'));
    temporaryDirectories.push(root);
    const databasePath = path.join(root, 'project.sqlite');
    const previousProjectId = '11111111-1111-4111-8111-111111111111';
    const nextProjectId = '22222222-2222-4222-8222-222222222222';
    const timestamp = '2026-08-12T00:00:00.000Z';

    const database = new DatabaseSync(databasePath, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
    });
    try {
      database.exec(`
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) WITHOUT ROWID;

        CREATE TABLE entities (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE
        ) WITHOUT ROWID;

        CREATE TABLE semantic_revision (
          project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
        ) WITHOUT ROWID;

        CREATE TRIGGER semantic_revision_entities_update
        AFTER UPDATE ON entities BEGIN
          INSERT INTO semantic_revision(project_id, revision) VALUES(NEW.project_id, 1)
          ON CONFLICT(project_id) DO UPDATE SET revision = revision + 1;
        END;
      `);
      database
        .prepare('INSERT INTO projects(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)')
        .run(previousProjectId, '恢复前项目', timestamp, timestamp);
      database
        .prepare('INSERT INTO entities(id, project_id) VALUES(?, ?)')
        .run('33333333-3333-4333-8333-333333333333', previousProjectId);
      database
        .prepare('INSERT INTO semantic_revision(project_id, revision) VALUES(?, ?)')
        .run(previousProjectId, 17);
    } finally {
      database.close();
    }

    remapProjectIdentity(databasePath, previousProjectId, nextProjectId, '恢复副本', timestamp);

    const verified = new DatabaseSync(databasePath, {
      allowExtension: false,
      enableForeignKeyConstraints: true,
      readBigInts: true,
    });
    try {
      expect(
        verified
          .prepare('SELECT id, name FROM projects')
          .all()
          .map((row) => ({
            id: String(row.id),
            name: String(row.name),
          })),
      ).toEqual([{ id: nextProjectId, name: '恢复副本' }]);
      expect(
        verified
          .prepare('SELECT project_id FROM entities')
          .all()
          .map((row) => String(row.project_id)),
      ).toEqual([nextProjectId]);
      expect(
        verified
          .prepare('SELECT project_id, revision FROM semantic_revision')
          .all()
          .map((row) => ({
            projectId: String(row.project_id),
            revision: Number(row.revision),
          })),
      ).toEqual([{ projectId: nextProjectId, revision: 0 }]);
      expect(verified.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      verified.close();
    }
  });
});
