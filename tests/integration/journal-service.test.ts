import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  JournalService,
  JournalServiceError,
} from '../../packages/core-service/src/journal-service.js';
import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000000002';
const VOLUME_ID = '00000000-0000-4000-8000-000000000010';
const CHAPTER_ID = '00000000-0000-4000-8000-000000000020';
const VERSION_ID = '00000000-0000-4000-8000-000000000030';
const HASH = 'a'.repeat(64);
const START = '2026-08-14T16:00:00.000Z';
const END = '2026-08-15T16:00:00.000Z';

function schema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE projects(id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE volumes(id TEXT PRIMARY KEY, project_id TEXT NOT NULL);
    CREATE TABLE chapters(
      id TEXT PRIMARY KEY,
      volume_id TEXT NOT NULL,
      title TEXT NOT NULL,
      final_version_id TEXT
    );
    CREATE TABLE versions(id TEXT PRIMARY KEY, chapter_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE writing_sessions(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      last_input_at TEXT NOT NULL,
      active_seconds INTEGER NOT NULL,
      net_characters INTEGER NOT NULL
    );
    CREATE TABLE story_digests(
      project_id TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      freshness TEXT NOT NULL,
      semantic_revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE TABLE generation_runs(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE TABLE candidates(
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL,
      status TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE state_proposals(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE validation_issues(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      chapter_id TEXT,
      source_version_id TEXT,
      logical_block_id TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE story_todos(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE story_comments(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE idea_cards(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE idea_conversions(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE character_relationships(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      superseded_at TEXT
    );
    CREATE TABLE timeline_events(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE foreshadowings(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE character_arcs(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE arc_milestones(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE backup_records(id TEXT PRIMARY KEY, project_id TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE entities(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE genre_rhythm_profiles(project_id TEXT PRIMARY KEY, time_zone TEXT NOT NULL);
    CREATE TABLE project_journal_preferences(
      project_id TEXT PRIMARY KEY,
      schedule TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE project_journal_entries(
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
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
      updated_at TEXT NOT NULL,
      UNIQUE(project_id, period_type, period_start, period_end)
    );
  `);
}

function fakeWorkspace(database: DatabaseSync): ProjectWorkspaceService {
  return {
    readProject: (_projectId: string, reader: (db: DatabaseSync) => unknown) => reader(database),
    writeProject: async (
      _requestId: string,
      _projectId: string,
      writer: (db: DatabaseSync) => unknown,
    ) => writer(database),
  } as unknown as ProjectWorkspaceService;
}

function seed(database: DatabaseSync): void {
  database
    .prepare('INSERT INTO projects(id, created_at) VALUES(?, ?), (?, ?)')
    .run(PROJECT_ID, '2026-08-01T00:00:00.000Z', OTHER_PROJECT_ID, '2026-08-01T00:00:00.000Z');
  database.prepare('INSERT INTO volumes(id, project_id) VALUES(?, ?)').run(VOLUME_ID, PROJECT_ID);
  database
    .prepare('INSERT INTO chapters(id, volume_id, title, final_version_id) VALUES(?, ?, ?, ?)')
    .run(CHAPTER_ID, VOLUME_ID, '第一章', VERSION_ID);
  database
    .prepare('INSERT INTO versions(id, chapter_id, created_at) VALUES(?, ?, ?)')
    .run(VERSION_ID, CHAPTER_ID, '2026-08-15T01:00:00.000Z');
  database
    .prepare(
      `INSERT INTO writing_sessions(
         id, project_id, chapter_id, last_input_at, active_seconds, net_characters
       ) VALUES(?, ?, ?, ?, ?, ?)`,
    )
    .run(randomUUID(), PROJECT_ID, CHAPTER_ID, '2026-08-15T02:00:00.000Z', 1800, 2200);
  database
    .prepare(
      `INSERT INTO story_digests(
         project_id, scope_type, scope_id, source_hash, freshness, semantic_revision, updated_at, content
       ) VALUES(?, 'project', ?, ?, 'fresh', 4, ?, ?)`,
    )
    .run(PROJECT_ID, PROJECT_ID, HASH, '2026-08-15T02:30:00.000Z', '项目剧情摘要');
  database
    .prepare('INSERT INTO genre_rhythm_profiles(project_id, time_zone) VALUES(?, ?)')
    .run(PROJECT_ID, 'Asia/Shanghai');
}

describe('JournalService', () => {
  let database: DatabaseSync;
  let service: JournalService;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    schema(database);
    seed(database);
    service = new JournalService(fakeWorkspace(database), {
      clock: { now: () => new Date('2026-08-15T03:36:00.000Z') },
    });
  });

  afterEach(() => database.close());

  it('aggregates existing authority records and keeps a period idempotent', async () => {
    const first = await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });
    const second = await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.id).toBe(first.entries[0]?.id);
    expect(second.entries[0]?.deterministicSummary.writing).toMatchObject({
      sessions: 1,
      netCharacters: 2200,
      activeSeconds: 1800,
      touchedChapters: 1,
    });
    expect(second.entries[0]?.deterministicSummary.versions).toEqual({ created: 1, finalized: 1 });
    expect(second.entries[0]?.deterministicSummary.navigationReferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ targetType: 'chapter', targetId: CHAPTER_ID }),
        expect.objectContaining({ targetType: 'version', targetId: VERSION_ID }),
      ]),
    );
  });

  it('refreshes the deterministic source hash when existing authority changes', async () => {
    const first = await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });
    database
      .prepare(
        `INSERT INTO writing_sessions(
           id, project_id, chapter_id, last_input_at, active_seconds, net_characters
         ) VALUES(?, ?, ?, ?, ?, ?)`,
      )
      .run(randomUUID(), PROJECT_ID, CHAPTER_ID, '2026-08-15T03:00:00.000Z', 600, 500);
    const second = await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });

    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.id).toBe(first.entries[0]?.id);
    expect(second.entries[0]?.sourceHash).not.toBe(first.entries[0]?.sourceHash);
    expect(second.entries[0]?.deterministicSummary.writing.netCharacters).toBe(2700);
  });

  it('protects author notes with optimistic concurrency', async () => {
    const catalog = await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });
    const entry = catalog.entries[0]!;
    const saved = await service.updateNote(randomUUID(), {
      projectId: PROJECT_ID,
      entryId: entry.id,
      expectedUpdatedAt: entry.updatedAt,
      authorNote: '今天把第一章定稿。',
    });
    expect(saved.entries[0]?.authorNote).toBe('今天把第一章定稿。');

    await expect(
      service.updateNote(randomUUID(), {
        projectId: PROJECT_ID,
        entryId: entry.id,
        expectedUpdatedAt: entry.updatedAt,
        authorNote: '过期写入',
      }),
    ).rejects.toBeInstanceOf(JournalServiceError);
  });

  it('catches up the previous completed local day once when daily scheduling is enabled', async () => {
    await service.updatePreferences(randomUUID(), { projectId: PROJECT_ID, schedule: 'daily' });
    const first = await service.catchUp(randomUUID(), {
      projectId: PROJECT_ID,
      now: '2026-08-15T03:36:00.000Z',
    });
    const second = await service.catchUp(randomUUID(), {
      projectId: PROJECT_ID,
      now: '2026-08-15T03:36:00.000Z',
    });

    expect(first.entries).toHaveLength(1);
    expect(second.entries).toHaveLength(1);
    expect(second.entries[0]?.periodType).toBe('daily');
    expect(second.entries[0]?.periodStart).toBe('2026-08-13T16:00:00.000Z');
    expect(second.entries[0]?.periodEnd).toBe('2026-08-14T16:00:00.000Z');
  });

  it('keeps journal catalog data isolated by project', async () => {
    await service.generate(randomUUID(), {
      projectId: PROJECT_ID,
      periodType: 'manual',
      periodStart: START,
      periodEnd: END,
    });
    expect(service.list({ projectId: OTHER_PROJECT_ID, limit: 30, before: null }).entries).toEqual(
      [],
    );
  });
});
