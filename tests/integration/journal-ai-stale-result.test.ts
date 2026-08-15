import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { afterEach, describe, expect, it } from 'vitest';

import { JournalService } from '../../packages/core-service/src/journal-service.js';
import type { JournalServiceError } from '../../packages/core-service/src/journal-service.js';
import type { ProjectWorkspaceService } from '../../packages/core-service/src/project-workspace.js';

const PROJECT_ID = '00000000-0000-4000-8000-000000000001';
const ENTRY_ID = '00000000-0000-4000-8000-000000000002';
const RUN_ID = '00000000-0000-4000-8000-000000000003';
const OLD_HASH = 'a'.repeat(64);
const CURRENT_HASH = 'b'.repeat(64);
const NOW = '2026-08-15T08:00:00.000Z';

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

function deterministicSummary(): string {
  return JSON.stringify({
    periodStart: '2026-08-14T00:00:00.000Z',
    periodEnd: '2026-08-15T00:00:00.000Z',
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
  });
}

describe('JournalService stale AI completion', () => {
  let database: DatabaseSync | null = null;

  afterEach(() => {
    database?.close();
    database = null;
  });

  it('rejects an AI result whose recorded source hash no longer matches the Journal entry', async () => {
    database = new DatabaseSync(':memory:');
    database.exec(`
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
        updated_at TEXT NOT NULL
      );
      CREATE TABLE generation_runs(
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        run_type TEXT NOT NULL,
        status TEXT NOT NULL,
        stage TEXT NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        error_code TEXT,
        retryable INTEGER,
        finished_at TEXT
      );
      CREATE TABLE generation_input_sources(
        run_id TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_order INTEGER NOT NULL,
        content_hash TEXT
      );
      CREATE TABLE generation_result_refs(
        run_id TEXT NOT NULL,
        result_type TEXT NOT NULL,
        result_id TEXT NOT NULL,
        candidate_kind TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(run_id, result_type, result_id)
      );
    `);
    database
      .prepare(
        `INSERT INTO project_journal_entries(
           id, project_id, period_type, period_start, period_end,
           source_revision, source_hash, deterministic_summary_json,
           ai_summary, author_note, generation_run_id, status, created_at, updated_at
         ) VALUES(?, ?, 'manual', ?, ?, 2, ?, ?, NULL, NULL, ?, 'ai_pending', ?, ?)`,
      )
      .run(
        ENTRY_ID,
        PROJECT_ID,
        '2026-08-14T00:00:00.000Z',
        '2026-08-15T00:00:00.000Z',
        CURRENT_HASH,
        deterministicSummary(),
        RUN_ID,
        NOW,
        NOW,
      );
    database
      .prepare(
        `INSERT INTO generation_runs(
           id, project_id, scope_type, scope_id, run_type, status, stage
         ) VALUES(?, ?, 'project', ?, 'journal_summarize', 'running', 'provider')`,
      )
      .run(RUN_ID, PROJECT_ID, PROJECT_ID);
    database
      .prepare(
        `INSERT INTO generation_input_sources(
           run_id, source_type, source_id, source_order, content_hash
         ) VALUES(?, 'journal_entry', ?, 0, ?)`,
      )
      .run(RUN_ID, ENTRY_ID, OLD_HASH);

    const service = new JournalService(fakeWorkspace(database), {
      clock: { now: () => new Date(NOW) },
    });

    await expect(
      service.completeAiSummary(randomUUID(), {
        projectId: PROJECT_ID,
        entryId: ENTRY_ID,
        runId: RUN_ID,
        output: { summary: '旧模型结果', highlights: [], nextFocus: [] },
      }),
    ).rejects.toMatchObject<Partial<JournalServiceError>>({
      code: 'JOURNAL_AI_CONFLICT',
    });

    expect(
      database
        .prepare('SELECT ai_summary AS aiSummary, status FROM project_journal_entries WHERE id = ?')
        .get(ENTRY_ID),
    ).toEqual({ aiSummary: null, status: 'ai_pending' });
    expect(database.prepare('SELECT status FROM generation_runs WHERE id = ?').get(RUN_ID)).toEqual(
      {
        status: 'running',
      },
    );
  });
});
