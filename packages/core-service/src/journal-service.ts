import { createHash, randomUUID } from 'node:crypto';

import {
  JournalAiPromptInputSchema,
  JournalCatalogSchema,
  JournalCatchUpInputSchema,
  JournalDeterministicSummarySchema,
  JournalEntrySchema,
  JournalListInputSchema,
  JournalMarkAiFailedInputSchema,
  JournalPreferencesSchema,
  JournalPreviewSchema,
  JournalUpdateNoteInputSchema,
  JournalUpdatePreferencesInputSchema,
  JournalWindowInputSchema,
  type JournalAiPromptInput,
  type JournalAiSummaryOutput,
  type JournalCatalog,
  type JournalCatchUpInput,
  type JournalDeterministicSummary,
  type JournalEntry,
  type JournalListInput,
  type JournalMarkAiFailedInput,
  type JournalPreview,
  type JournalSchedule,
  type JournalUpdateNoteInput,
  type JournalUpdatePreferencesInput,
  type JournalWindowInput,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import { sqliteResult } from './database/sqlite-result.js';
import { journalNavigationReferences } from './journal-navigation.js';
import { journalCatchUpWindow } from './journal-period.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { stableJson } from './stable-json.js';

type ProjectDatabase = Parameters<Parameters<ProjectWorkspaceService['readProject']>[1]>[0];
const systemClock: DatabaseClock = { now: () => new Date() };

export type JournalServiceErrorCode =
  'JOURNAL_NOT_FOUND' | 'JOURNAL_INVALID' | 'JOURNAL_CONFLICT' | 'JOURNAL_AI_CONFLICT';

export class JournalServiceError extends Error {
  readonly code: JournalServiceErrorCode;

  constructor(code: JournalServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'JournalServiceError';
    this.code = code;
  }
}

export interface JournalServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface CountRow {
  readonly count: number | bigint;
}

interface SumRow {
  readonly count: number | bigint;
  readonly total: number | bigint | null;
}

interface JournalRow {
  readonly id: string;
  readonly projectId: string;
  readonly periodType: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly sourceRevision: number | bigint;
  readonly sourceHash: string;
  readonly deterministicSummaryJson: string;
  readonly aiSummary: string | null;
  readonly authorNote: string | null;
  readonly generationRunId: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface PreferenceRow {
  readonly projectId: string;
  readonly schedule: string;
  readonly updatedAt: string;
}

interface DigestRow {
  readonly scopeType: string;
  readonly scopeId: string;
  readonly sourceHash: string;
  readonly freshness: string;
  readonly semanticRevision: number | bigint;
  readonly updatedAt: string;
}

function count(
  database: ProjectDatabase,
  sql: string,
  ...parameters: (string | number | bigint | null)[]
): number {
  const row = database.prepare(sql).get(...parameters) as CountRow | undefined;
  return Number(row?.count ?? 0);
}

function sum(
  database: ProjectDatabase,
  sql: string,
  ...parameters: (string | number | bigint | null)[]
): number {
  const row = database.prepare(sql).get(...parameters) as SumRow | undefined;
  return Number(row?.total ?? 0);
}

function parseSummary(value: string): JournalDeterministicSummary {
  try {
    return JournalDeterministicSummarySchema.parse(JSON.parse(value));
  } catch (error) {
    throw new JournalServiceError('JOURNAL_INVALID', 'Stored Journal summary is invalid.', {
      cause: error,
    });
  }
}

function entryFromRow(row: JournalRow): JournalEntry {
  return JournalEntrySchema.parse({
    id: row.id,
    projectId: row.projectId,
    periodType: row.periodType,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    sourceRevision: Number(row.sourceRevision),
    sourceHash: row.sourceHash,
    deterministicSummary: parseSummary(row.deterministicSummaryJson),
    aiSummary: row.aiSummary,
    authorNote: row.authorNote,
    generationRunId: row.generationRunId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function readEntry(database: ProjectDatabase, projectId: string, entryId: string): JournalEntry {
  const row = database
    .prepare(
      `SELECT id, project_id AS projectId, period_type AS periodType,
              period_start AS periodStart, period_end AS periodEnd,
              source_revision AS sourceRevision, source_hash AS sourceHash,
              deterministic_summary_json AS deterministicSummaryJson,
              ai_summary AS aiSummary, author_note AS authorNote,
              generation_run_id AS generationRunId, status,
              created_at AS createdAt, updated_at AS updatedAt
         FROM project_journal_entries
        WHERE id = ? AND project_id = ?`,
    )
    .get(entryId, projectId) as JournalRow | undefined;
  if (!row) throw new JournalServiceError('JOURNAL_NOT_FOUND', 'Journal entry not found.');
  return entryFromRow(row);
}

function preference(
  database: ProjectDatabase,
  projectId: string,
): ReturnType<typeof JournalPreferencesSchema.parse> {
  const row = database
    .prepare(
      `SELECT project_id AS projectId, schedule, updated_at AS updatedAt
         FROM project_journal_preferences WHERE project_id = ?`,
    )
    .get(projectId) as PreferenceRow | undefined;
  if (row) return JournalPreferencesSchema.parse(row);
  const project = database
    .prepare('SELECT created_at AS createdAt FROM projects WHERE id = ?')
    .get(projectId) as { readonly createdAt?: string } | undefined;
  if (!project?.createdAt) throw new JournalServiceError('JOURNAL_NOT_FOUND', 'Project not found.');
  return JournalPreferencesSchema.parse({
    projectId,
    schedule: 'off',
    updatedAt: project.createdAt,
  });
}

function sourceHash(summary: JournalDeterministicSummary): string {
  return createHash('sha256').update(stableJson(summary)).digest('hex');
}

function revision(summary: JournalDeterministicSummary): number {
  const base =
    summary.writing.sessions +
    Math.abs(summary.writing.netCharacters) +
    summary.writing.activeSeconds +
    summary.versions.created +
    summary.versions.finalized +
    summary.generation.started +
    summary.generation.succeeded +
    summary.generation.failed +
    summary.generation.cancelled +
    summary.generation.acceptedCandidates +
    summary.review.stateProposalsResolved +
    summary.review.validationIssuesCreated +
    summary.review.validationIssuesResolved +
    summary.review.todosCreated +
    summary.review.todosCompleted +
    summary.review.commentsCreated +
    summary.review.commentsResolved +
    summary.ideas.created +
    summary.ideas.converted +
    summary.knowledge.relationshipChanges +
    summary.knowledge.timelineChanges +
    summary.knowledge.foreshadowingChanges +
    summary.knowledge.arcChanges +
    summary.recovery.backupsCreated;
  return base + summary.digestReferences.reduce((total, item) => total + item.semanticRevision, 0);
}

function boundedPeriod(input: JournalWindowInput): JournalWindowInput {
  const parsed = JournalWindowInputSchema.parse(input);
  const span = Date.parse(parsed.periodEnd) - Date.parse(parsed.periodStart);
  if (!Number.isFinite(span) || span <= 0 || span > 366 * 24 * 60 * 60 * 1000) {
    throw new JournalServiceError(
      'JOURNAL_INVALID',
      'A Journal aggregation window must be between one millisecond and 366 days.',
    );
  }
  return parsed;
}

function deterministicSummary(
  database: ProjectDatabase,
  input: JournalWindowInput,
): JournalDeterministicSummary {
  const start = input.periodStart;
  const end = input.periodEnd;
  const projectId = input.projectId;
  const sessionRow = database
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(active_seconds), 0) AS total
         FROM writing_sessions
        WHERE project_id = ? AND last_input_at >= ? AND last_input_at < ?`,
    )
    .get(projectId, start, end) as SumRow | undefined;
  const digestRows = sqliteResult<DigestRow[]>(
    database
      .prepare(
        `SELECT scope_type AS scopeType, scope_id AS scopeId, source_hash AS sourceHash,
              freshness, semantic_revision AS semanticRevision, updated_at AS updatedAt
         FROM story_digests
        WHERE project_id = ?
        ORDER BY CASE scope_type WHEN 'project' THEN 0 WHEN 'volume' THEN 1 ELSE 2 END,
                 updated_at DESC, scope_id
        LIMIT 10000`,
      )
      .all(projectId),
  );

  return JournalDeterministicSummarySchema.parse({
    periodStart: start,
    periodEnd: end,
    writing: {
      sessions: Number(sessionRow?.count ?? 0),
      netCharacters: sum(
        database,
        `SELECT COUNT(*) AS count, COALESCE(SUM(net_characters), 0) AS total
           FROM writing_sessions
          WHERE project_id = ? AND last_input_at >= ? AND last_input_at < ?`,
        projectId,
        start,
        end,
      ),
      activeSeconds: Number(sessionRow?.total ?? 0),
      touchedChapters: count(
        database,
        `SELECT COUNT(DISTINCT chapter_id) AS count FROM writing_sessions
          WHERE project_id = ? AND last_input_at >= ? AND last_input_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    versions: {
      created: count(
        database,
        `SELECT COUNT(*) AS count
           FROM versions version
           JOIN chapters chapter ON chapter.id = version.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE volume.project_id = ? AND version.created_at >= ? AND version.created_at < ?`,
        projectId,
        start,
        end,
      ),
      finalized: count(
        database,
        `SELECT COUNT(*) AS count
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE volume.project_id = ?
            AND chapter.final_version_id IS NOT NULL
            AND chapter.finalized_at >= ? AND chapter.finalized_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    generation: {
      started: count(
        database,
        `SELECT COUNT(*) AS count FROM generation_runs
          WHERE project_id = ? AND created_at >= ? AND created_at < ?
            AND run_type <> 'journal_summarize'`,
        projectId,
        start,
        end,
      ),
      succeeded: count(
        database,
        `SELECT COUNT(*) AS count FROM generation_runs
          WHERE project_id = ? AND status = 'succeeded'
            AND finished_at >= ? AND finished_at < ? AND run_type <> 'journal_summarize'`,
        projectId,
        start,
        end,
      ),
      failed: count(
        database,
        `SELECT COUNT(*) AS count FROM generation_runs
          WHERE project_id = ? AND status = 'failed'
            AND finished_at >= ? AND finished_at < ? AND run_type <> 'journal_summarize'`,
        projectId,
        start,
        end,
      ),
      cancelled: count(
        database,
        `SELECT COUNT(*) AS count FROM generation_runs
          WHERE project_id = ? AND status = 'cancelled'
            AND finished_at >= ? AND finished_at < ? AND run_type <> 'journal_summarize'`,
        projectId,
        start,
        end,
      ),
      acceptedCandidates: count(
        database,
        `SELECT COUNT(*) AS count
           FROM candidates candidate
           JOIN chapters chapter ON chapter.id = candidate.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE volume.project_id = ? AND candidate.status = 'accepted'
            AND candidate.resolved_at >= ? AND candidate.resolved_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    review: {
      stateProposalsResolved: count(
        database,
        `SELECT COUNT(*) AS count FROM state_proposals
          WHERE project_id = ? AND status <> 'pending' AND resolved_at >= ? AND resolved_at < ?`,
        projectId,
        start,
        end,
      ),
      validationIssuesCreated: count(
        database,
        `SELECT COUNT(*) AS count FROM validation_issues
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
      validationIssuesResolved: count(
        database,
        `SELECT COUNT(*) AS count FROM validation_issues
          WHERE project_id = ? AND status <> 'open' AND updated_at >= ? AND updated_at < ?`,
        projectId,
        start,
        end,
      ),
      todosCreated: count(
        database,
        `SELECT COUNT(*) AS count FROM story_todos
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
      todosCompleted: count(
        database,
        `SELECT COUNT(*) AS count FROM story_todos
          WHERE project_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?`,
        projectId,
        start,
        end,
      ),
      commentsCreated: count(
        database,
        `SELECT COUNT(*) AS count FROM story_comments
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
      commentsResolved: count(
        database,
        `SELECT COUNT(*) AS count FROM story_comments
          WHERE project_id = ? AND status = 'resolved' AND resolved_at >= ? AND resolved_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    ideas: {
      created: count(
        database,
        `SELECT COUNT(*) AS count FROM idea_cards
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
      converted: count(
        database,
        `SELECT COUNT(*) AS count FROM idea_conversions
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    knowledge: {
      relationshipChanges: count(
        database,
        `SELECT COUNT(*) AS count FROM character_relationships
          WHERE project_id = ? AND (
            (created_at >= ? AND created_at < ?)
            OR (superseded_at >= ? AND superseded_at < ?)
          )`,
        projectId,
        start,
        end,
        start,
        end,
      ),
      timelineChanges: count(
        database,
        `SELECT COUNT(*) AS count FROM timeline_events
          WHERE project_id = ? AND updated_at >= ? AND updated_at < ?`,
        projectId,
        start,
        end,
      ),
      foreshadowingChanges: count(
        database,
        `SELECT COUNT(*) AS count FROM foreshadowings
          WHERE project_id = ? AND updated_at >= ? AND updated_at < ?`,
        projectId,
        start,
        end,
      ),
      arcChanges: count(
        database,
        `SELECT COUNT(*) AS count FROM (
           SELECT id FROM character_arcs
            WHERE project_id = ? AND updated_at >= ? AND updated_at < ?
           UNION ALL
           SELECT id FROM arc_milestones
            WHERE project_id = ? AND updated_at >= ? AND updated_at < ?
         )`,
        projectId,
        start,
        end,
        projectId,
        start,
        end,
      ),
    },
    recovery: {
      backupsCreated: count(
        database,
        `SELECT COUNT(*) AS count FROM backup_records
          WHERE project_id = ? AND created_at >= ? AND created_at < ?`,
        projectId,
        start,
        end,
      ),
    },
    navigationReferences: journalNavigationReferences(database, projectId, start, end),
    digestReferences: digestRows.map((row) => ({
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      sourceHash: row.sourceHash,
      freshness: row.freshness,
      semanticRevision: Number(row.semanticRevision),
      updatedAt: row.updatedAt,
    })),
  });
}

export class JournalService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: JournalServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  list(raw: JournalListInput): JournalCatalog {
    const input = JournalListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) =>
      this.#catalog(database, input),
    );
  }

  preview(raw: JournalWindowInput): JournalPreview {
    const input = boundedPeriod(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const summary = deterministicSummary(database, input);
      return JournalPreviewSchema.parse({
        projectId: input.projectId,
        periodType: input.periodType,
        sourceRevision: revision(summary),
        sourceHash: sourceHash(summary),
        deterministicSummary: summary,
      });
    });
  }

  async generate(requestId: string, raw: JournalWindowInput): Promise<JournalCatalog> {
    const input = boundedPeriod(raw);
    const preview = this.preview(input);
    const now = this.#clock.now().toISOString();
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const existing = database
        .prepare(
          `SELECT id, source_hash AS sourceHash
             FROM project_journal_entries
            WHERE project_id = ? AND period_type = ? AND period_start = ? AND period_end = ?`,
        )
        .get(input.projectId, input.periodType, input.periodStart, input.periodEnd) as
        { readonly id: string; readonly sourceHash: string } | undefined;
      if (!existing) {
        database
          .prepare(
            `INSERT INTO project_journal_entries(
               id, project_id, period_type, period_start, period_end,
               source_revision, source_hash, deterministic_summary_json,
               ai_summary, author_note, generation_run_id, status, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'deterministic', ?, ?)`,
          )
          .run(
            this.#idFactory(),
            input.projectId,
            input.periodType,
            input.periodStart,
            input.periodEnd,
            preview.sourceRevision,
            preview.sourceHash,
            stableJson(preview.deterministicSummary),
            now,
            now,
          );
        return;
      }
      if (existing.sourceHash === preview.sourceHash) return;
      database
        .prepare(
          `UPDATE project_journal_entries
              SET source_revision = ?, source_hash = ?, deterministic_summary_json = ?,
                  ai_summary = NULL, generation_run_id = NULL,
                  status = 'deterministic', updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          preview.sourceRevision,
          preview.sourceHash,
          stableJson(preview.deterministicSummary),
          now,
          existing.id,
          input.projectId,
        );
    });
    return this.list({ projectId: input.projectId, limit: 30, before: null });
  }

  async updateNote(requestId: string, raw: JournalUpdateNoteInput): Promise<JournalCatalog> {
    const input = JournalUpdateNoteInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const changed = database
        .prepare(
          `UPDATE project_journal_entries SET author_note = ?, updated_at = ?
            WHERE id = ? AND project_id = ? AND updated_at = ?`,
        )
        .run(input.authorNote, now, input.entryId, input.projectId, input.expectedUpdatedAt);
      if (Number(changed.changes) !== 1) {
        if (
          !database
            .prepare('SELECT 1 FROM project_journal_entries WHERE id = ? AND project_id = ?')
            .get(input.entryId, input.projectId)
        ) {
          throw new JournalServiceError('JOURNAL_NOT_FOUND', 'Journal entry not found.');
        }
        throw new JournalServiceError(
          'JOURNAL_CONFLICT',
          'Journal entry changed before note save.',
        );
      }
    });
    return this.list({ projectId: input.projectId, limit: 30, before: null });
  }

  async updatePreferences(
    requestId: string,
    raw: JournalUpdatePreferencesInput,
  ): Promise<JournalCatalog> {
    const input = JournalUpdatePreferencesInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
      database
        .prepare(
          `INSERT INTO project_journal_preferences(project_id, schedule, updated_at)
           VALUES(?, ?, ?)
           ON CONFLICT(project_id) DO UPDATE SET schedule = excluded.schedule,
                                                updated_at = excluded.updated_at`,
        )
        .run(input.projectId, input.schedule, now);
    });
    return this.list({ projectId: input.projectId, limit: 30, before: null });
  }

  async catchUp(requestId: string, raw: JournalCatchUpInput): Promise<JournalCatalog> {
    const input = JournalCatchUpInputSchema.parse(raw);
    const current = this.#workspace.readProject(input.projectId, (database) =>
      preference(database, input.projectId),
    );
    if (current.schedule === 'off') {
      return this.list({ projectId: input.projectId, limit: 30, before: null });
    }
    const now = input.now ? new Date(input.now) : this.#clock.now();
    const periodType = current.schedule as Exclude<JournalSchedule, 'off'>;
    const period = this.#workspace.readProject(input.projectId, (database) =>
      journalCatchUpWindow(database, input.projectId, periodType, now),
    );
    const exists = this.#workspace.readProject(input.projectId, (database) =>
      Boolean(
        database
          .prepare(
            `SELECT 1 FROM project_journal_entries
              WHERE project_id = ? AND period_type = ? AND period_start = ? AND period_end = ?`,
          )
          .get(input.projectId, periodType, period.start, period.end),
      ),
    );
    if (exists) return this.list({ projectId: input.projectId, limit: 30, before: null });
    return this.generate(requestId, {
      projectId: input.projectId,
      periodType,
      periodStart: period.start,
      periodEnd: period.end,
    });
  }

  async markAiPending(
    requestId: string,
    input: {
      readonly projectId: string;
      readonly entryId: string;
      readonly generationRunId: string;
      readonly expectedSourceHash: string;
    },
  ): Promise<void> {
    const now = this.#clock.now().toISOString();
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const entry = readEntry(database, input.projectId, input.entryId);
      if (entry.sourceHash !== input.expectedSourceHash) {
        throw new JournalServiceError(
          'JOURNAL_AI_CONFLICT',
          'Journal source changed before the AI run was bound.',
        );
      }
      if (
        entry.status === 'ai_pending' &&
        entry.generationRunId &&
        entry.generationRunId !== input.generationRunId
      ) {
        throw new JournalServiceError('JOURNAL_AI_CONFLICT', 'Another Journal AI run is active.');
      }
      if (
        entry.generationRunId === input.generationRunId &&
        (entry.status === 'ready' || entry.status === 'ai_failed')
      ) {
        return;
      }
      database
        .prepare(
          `UPDATE project_journal_entries
              SET generation_run_id = ?, status = 'ai_pending', updated_at = ?
            WHERE id = ? AND project_id = ? AND source_hash = ?`,
        )
        .run(input.generationRunId, now, input.entryId, input.projectId, input.expectedSourceHash);
    });
  }

  async markAiFailed(requestId: string, raw: JournalMarkAiFailedInput): Promise<JournalCatalog> {
    const input = JournalMarkAiFailedInputSchema.parse(raw);
    const now = this.#clock.now().toISOString();
    await this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const entry = readEntry(database, input.projectId, input.entryId);
      if (
        input.generationRunId &&
        entry.generationRunId &&
        entry.generationRunId !== input.generationRunId
      ) {
        throw new JournalServiceError('JOURNAL_AI_CONFLICT', 'Journal AI run identity changed.');
      }
      if (entry.status === 'ready') return;
      database
        .prepare(
          `UPDATE project_journal_entries
              SET generation_run_id = COALESCE(generation_run_id, ?),
                  status = 'ai_failed', updated_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(input.generationRunId, now, input.entryId, input.projectId);
    });
    return this.list({ projectId: input.projectId, limit: 30, before: null });
  }

  prepareAiInput(projectId: string, entryId: string): JournalAiPromptInput {
    return this.#workspace.readProject(projectId, (database) => {
      const entry = readEntry(database, projectId, entryId);
      const digest = database
        .prepare(
          `SELECT content FROM story_digests
            WHERE project_id = ? AND scope_type = 'project' AND scope_id = ?
            ORDER BY freshness = 'fresh' DESC, updated_at DESC LIMIT 1`,
        )
        .get(projectId, projectId) as { readonly content?: string } | undefined;
      return JournalAiPromptInputSchema.parse({
        projectId,
        journalEntryId: entry.id,
        periodType: entry.periodType,
        deterministicSummary: entry.deterministicSummary,
        projectDigest: digest?.content ? digest.content.slice(0, 12_000) : null,
        constraintHash: entry.sourceHash,
      });
    });
  }

  async completeAiSummary(
    requestId: string,
    input: {
      readonly projectId: string;
      readonly entryId: string;
      readonly runId: string;
      readonly output: JournalAiSummaryOutput;
      readonly usage?: { readonly inputTokens?: number; readonly outputTokens?: number };
    },
  ): Promise<JournalEntry> {
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const entry = readEntry(database, input.projectId, input.entryId);
      if (
        entry.status === 'ai_pending' &&
        entry.generationRunId &&
        entry.generationRunId !== input.runId
      ) {
        throw new JournalServiceError('JOURNAL_AI_CONFLICT', 'Journal AI run identity changed.');
      }
      const run = database
        .prepare(
          `SELECT id, project_id AS projectId, scope_type AS scopeType, scope_id AS scopeId,
                  run_type AS runType, status
             FROM generation_runs WHERE id = ? AND project_id = ?`,
        )
        .get(input.runId, input.projectId) as
        | {
            readonly id: string;
            readonly projectId: string;
            readonly scopeType: string;
            readonly scopeId: string;
            readonly runType: string;
            readonly status: string;
          }
        | undefined;
      if (
        !run ||
        run.runType !== 'journal_summarize' ||
        run.scopeType !== 'project' ||
        run.scopeId !== input.projectId
      ) {
        throw new JournalServiceError('JOURNAL_AI_CONFLICT', 'Journal AI run scope is invalid.');
      }
      const source = database
        .prepare(
          `SELECT content_hash AS contentHash
             FROM generation_input_sources
            WHERE run_id = ? AND source_type = 'journal_entry' AND source_id = ?
            ORDER BY source_order
            LIMIT 1`,
        )
        .get(input.runId, entry.id) as { readonly contentHash?: string | null } | undefined;
      if (!source?.contentHash || source.contentHash !== entry.sourceHash) {
        throw new JournalServiceError(
          'JOURNAL_AI_CONFLICT',
          'Journal AI source changed before completion.',
        );
      }
      if (run.status !== 'queued' && run.status !== 'running') {
        throw new JournalServiceError('JOURNAL_AI_CONFLICT', 'Journal AI run is no longer active.');
      }
      database
        .prepare(
          `UPDATE project_journal_entries
              SET ai_summary = ?, generation_run_id = ?, status = 'ready', updated_at = ?
            WHERE id = ? AND project_id = ? AND source_hash = ?`,
        )
        .run(input.output.summary, input.runId, now, entry.id, input.projectId, entry.sourceHash);
      database
        .prepare(
          `UPDATE generation_runs
              SET status = 'succeeded', stage = 'completed',
                  input_tokens = COALESCE(?, input_tokens),
                  output_tokens = COALESCE(?, output_tokens),
                  error_code = NULL, retryable = NULL, finished_at = ?
            WHERE id = ? AND project_id = ?`,
        )
        .run(
          input.usage?.inputTokens ?? null,
          input.usage?.outputTokens ?? null,
          now,
          input.runId,
          input.projectId,
        );
      database
        .prepare(
          `INSERT OR IGNORE INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'journal_entry', ?, NULL, ?)`,
        )
        .run(input.runId, entry.id, now);
      return readEntry(database, input.projectId, entry.id);
    });
  }

  #catalog(database: ProjectDatabase, input: JournalListInput): JournalCatalog {
    const parsed = JournalListInputSchema.parse(input);
    const cursorPeriodEnd = parsed.before?.periodEnd ?? null;
    const cursorId = parsed.before?.id ?? null;
    const rows = sqliteResult<JournalRow[]>(
      database
        .prepare(
          `SELECT id, project_id AS projectId, period_type AS periodType,
                period_start AS periodStart, period_end AS periodEnd,
                source_revision AS sourceRevision, source_hash AS sourceHash,
                deterministic_summary_json AS deterministicSummaryJson,
                ai_summary AS aiSummary, author_note AS authorNote,
                generation_run_id AS generationRunId, status,
                created_at AS createdAt, updated_at AS updatedAt
           FROM project_journal_entries
          WHERE project_id = ?
            AND (
              ? IS NULL
              OR period_end < ?
              OR (period_end = ? AND id < ?)
            )
          ORDER BY period_end DESC, id DESC
          LIMIT ?`,
        )
        .all(
          parsed.projectId,
          cursorPeriodEnd,
          cursorPeriodEnd,
          cursorPeriodEnd,
          cursorId,
          parsed.limit + 1,
        ),
    );
    const page = rows.slice(0, parsed.limit);
    const last = page.at(-1);
    return JournalCatalogSchema.parse({
      projectId: parsed.projectId,
      entries: page.map(entryFromRow),
      preferences: preference(database, parsed.projectId),
      nextCursor:
        rows.length > parsed.limit && last ? { periodEnd: last.periodEnd, id: last.id } : null,
    });
  }
}
