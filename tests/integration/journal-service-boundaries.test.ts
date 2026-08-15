import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  JournalService,
  JournalServiceError,
} from '../../packages/core-service/src/journal-service.js';
import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const ENTRY_ID = '00000000-0000-4000-8000-000000000002';
const MISSING_ENTRY_ID = '00000000-0000-4000-8000-000000000003';
const RUN_ONE = '00000000-0000-4000-8000-000000000004';
const RUN_TWO = '00000000-0000-4000-8000-000000000005';
const HASH = 'a'.repeat(64);
const OTHER_HASH = 'b'.repeat(64);
const PERIOD_START = '2026-08-14T00:00:00.000Z';
const PERIOD_END = '2026-08-15T00:00:00.000Z';
const UPDATED_AT = '2026-08-15T01:00:00.000Z';

function deterministicSummary() {
  return {
    periodStart: PERIOD_START,
    periodEnd: PERIOD_END,
    writing: { sessions: 0, netCharacters: 0, activeSeconds: 0, touchedChapters: 0 },
    versions: { created: 0, finalized: 0 },
    generation: {
      started: 0,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
      acceptedCandidates: 0,
    },
    review: {
      stateProposalsResolved: 0,
      validationIssuesCreated: 0,
      validationIssuesResolved: 0,
      todosCreated: 0,
      todosCompleted: 0,
      commentsCreated: 0,
      commentsResolved: 0,
    },
    ideas: { created: 0, converted: 0 },
    knowledge: {
      relationshipChanges: 0,
      timelineChanges: 0,
      foreshadowingChanges: 0,
      arcChanges: 0,
    },
    recovery: { backupsCreated: 0 },
    navigationReferences: [],
    digestReferences: [],
  };
}

function schema(database: DatabaseSync): void {
  database.exec(`
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
    .prepare(
      'INSERT INTO project_journal_preferences(project_id, schedule, updated_at) VALUES(?, ?, ?)',
    )
    .run(PROJECT_ID, 'off', UPDATED_AT);
  database
    .prepare(
      `INSERT INTO project_journal_entries(
         id, project_id, period_type, period_start, period_end,
         source_revision, source_hash, deterministic_summary_json,
         ai_summary, author_note, generation_run_id, status, created_at, updated_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'deterministic', ?, ?)`,
    )
    .run(
      ENTRY_ID,
      PROJECT_ID,
      'manual',
      PERIOD_START,
      PERIOD_END,
      1,
      HASH,
      JSON.stringify(deterministicSummary()),
      UPDATED_AT,
      UPDATED_AT,
    );
}

describe('M12-01 JournalService boundary protection', () => {
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

  it('returns the existing catalog without generating when scheduled catch-up is disabled', async () => {
    const result = await service.catchUp('request-catch-up', {
      projectId: PROJECT_ID,
      now: '2026-08-15T03:36:00.000Z',
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]?.id).toBe(ENTRY_ID);
    expect(result.preferences.schedule).toBe('off');
  });

  it('distinguishes a missing note target from an optimistic-concurrency conflict', async () => {
    await expect(
      service.updateNote('request-note', {
        projectId: PROJECT_ID,
        entryId: MISSING_ENTRY_ID,
        expectedUpdatedAt: UPDATED_AT,
        authorNote: '不存在的日志',
      }),
    ).rejects.toBeInstanceOf(JournalServiceError);
  });

  it('rejects stale Journal AI sources and competing active runs', async () => {
    await expect(
      service.markAiPending('request-stale', {
        projectId: PROJECT_ID,
        entryId: ENTRY_ID,
        generationRunId: RUN_ONE,
        expectedSourceHash: OTHER_HASH,
      }),
    ).rejects.toBeInstanceOf(JournalServiceError);

    await service.markAiPending('request-first', {
      projectId: PROJECT_ID,
      entryId: ENTRY_ID,
      generationRunId: RUN_ONE,
      expectedSourceHash: HASH,
    });
    await expect(
      service.markAiPending('request-second', {
        projectId: PROJECT_ID,
        entryId: ENTRY_ID,
        generationRunId: RUN_TWO,
        expectedSourceHash: HASH,
      }),
    ).rejects.toBeInstanceOf(JournalServiceError);
  });

  it('keeps terminal AI state idempotent and rejects a mismatched failure identity', async () => {
    database
      .prepare(
        "UPDATE project_journal_entries SET generation_run_id = ?, status = 'ready' WHERE id = ?",
      )
      .run(RUN_ONE, ENTRY_ID);

    await service.markAiPending('request-terminal', {
      projectId: PROJECT_ID,
      entryId: ENTRY_ID,
      generationRunId: RUN_ONE,
      expectedSourceHash: HASH,
    });
    expect(
      service.list({ projectId: PROJECT_ID, limit: 30, before: null }).entries[0]?.status,
    ).toBe('ready');

    database
      .prepare(
        "UPDATE project_journal_entries SET generation_run_id = ?, status = 'ai_pending' WHERE id = ?",
      )
      .run(RUN_ONE, ENTRY_ID);
    await expect(
      service.markAiFailed('request-failed-mismatch', {
        projectId: PROJECT_ID,
        entryId: ENTRY_ID,
        generationRunId: RUN_TWO,
      }),
    ).rejects.toBeInstanceOf(JournalServiceError);

    database
      .prepare("UPDATE project_journal_entries SET status = 'ready' WHERE id = ?")
      .run(ENTRY_ID);
    const result = await service.markAiFailed('request-ready', {
      projectId: PROJECT_ID,
      entryId: ENTRY_ID,
      generationRunId: RUN_ONE,
    });
    expect(result.entries[0]?.status).toBe('ready');
  });
});
