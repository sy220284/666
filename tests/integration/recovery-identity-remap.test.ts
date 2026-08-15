import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { remapProjectIdentity } from '../../packages/core-service/src/recovery.js';
import { projectCloneAction } from '../../packages/core-service/src/recovery/project-clone-policy.js';

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
  it('classifies M11 relationship, validation, and M12 Journal tables for identity remap', () => {
    expect(projectCloneAction('character_relationships')).toBe('clone-remap');
    expect(projectCloneAction('validation_exceptions')).toBe('clone-remap');
    expect(projectCloneAction('project_journal_preferences')).toBe('clone-remap');
    expect(projectCloneAction('project_journal_entries')).toBe('clone-remap');
  });

  it('remaps Journal ownership while preserving the derived entry and author note', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-journal-remap-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'project.sqlite');
    const previousProjectId = randomUUID();
    const nextProjectId = randomUUID();
    const entryId = randomUUID();
    const database = openDatabase(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects(
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE project_journal_preferences(
          project_id TEXT PRIMARY KEY REFERENCES projects(id),
          schedule TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE project_journal_entries(
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id),
          period_type TEXT NOT NULL,
          period_start TEXT NOT NULL,
          period_end TEXT NOT NULL,
          source_revision INTEGER NOT NULL,
          source_hash TEXT NOT NULL,
          deterministic_summary_json TEXT NOT NULL,
          ai_summary TEXT,
          author_note TEXT,
          generation_run_id TEXT,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
      `);
      database
        .prepare('INSERT INTO projects(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)')
        .run(previousProjectId, '原项目', '2026-08-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z');
      database
        .prepare(
          'INSERT INTO project_journal_preferences(project_id, schedule, updated_at) VALUES(?, ?, ?)',
        )
        .run(previousProjectId, 'daily', '2026-08-15T00:10:00.000Z');
      database
        .prepare(
          `INSERT INTO project_journal_entries(
             id, project_id, period_type, period_start, period_end,
             source_revision, source_hash, deterministic_summary_json,
             ai_summary, author_note, generation_run_id, status, created_at, updated_at
           ) VALUES(?, ?, 'daily', ?, ?, 3, ?, '{}', NULL, ?, NULL, 'deterministic', ?, ?)`,
        )
        .run(
          entryId,
          previousProjectId,
          '2026-08-14T00:00:00.000Z',
          '2026-08-15T00:00:00.000Z',
          'a'.repeat(64),
          '恢复后继续写第二章',
          '2026-08-15T00:10:00.000Z',
          '2026-08-15T00:10:00.000Z',
        );
    } finally {
      database.close();
    }

    remapProjectIdentity(
      databasePath,
      previousProjectId,
      nextProjectId,
      '恢复副本',
      '2026-08-15T01:00:00.000Z',
    );

    const verified = openDatabase(databasePath);
    try {
      expect(
        verified
          .prepare('SELECT project_id AS projectId, schedule FROM project_journal_preferences')
          .get(),
      ).toEqual({ projectId: nextProjectId, schedule: 'daily' });
      expect(
        verified
          .prepare(
            'SELECT id, project_id AS projectId, author_note AS authorNote FROM project_journal_entries',
          )
          .get(),
      ).toEqual({
        id: entryId,
        projectId: nextProjectId,
        authorNote: '恢复后继续写第二章',
      });
      expect(verified.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      verified.close();
    }
  });

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
        CREATE TABLE project_settings(
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id)
        ) STRICT;
        CREATE TRIGGER inject_invalid_project_reference
        AFTER UPDATE OF id ON projects
        BEGIN
          INSERT INTO project_settings(id, project_id)
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
      expect(verified.prepare('SELECT COUNT(*) AS count FROM project_settings').get()).toEqual({
        count: 0n,
      });
      expect(verified.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
    } finally {
      verified.close();
    }
  });

  it('fails closed when a restored schema contains an unclassified project table', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worldforge-recovery-policy-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'project.sqlite');
    const previousProjectId = randomUUID();
    const database = openDatabase(databasePath);
    try {
      database.exec(`
        CREATE TABLE projects(
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        ) STRICT;
        CREATE TABLE future_external_artifacts(
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id)
        ) STRICT;
      `);
      database
        .prepare('INSERT INTO projects(id, name, created_at, updated_at) VALUES(?, ?, ?, ?)')
        .run(previousProjectId, '原项目', '2026-08-09T00:00:00.000Z', '2026-08-09T00:00:00.000Z');
    } finally {
      database.close();
    }

    expect(() =>
      remapProjectIdentity(
        databasePath,
        previousProjectId,
        randomUUID(),
        '恢复副本',
        '2026-08-09T01:00:00.000Z',
      ),
    ).toThrow('PROJECT_CLONE_POLICY_INCOMPLETE unknown=future_external_artifacts');
  });
});
