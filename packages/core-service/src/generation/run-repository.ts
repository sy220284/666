import { createHash } from 'node:crypto';
import { type DatabaseSync } from 'node:sqlite';

import {
  type CandidateBlockInput,
  type CandidateDocument,
  type CandidateType,
  type ConstraintPackage,
  type ErrorCode,
  type GenerationGetRunInput,
  GenerationGetRunInputSchema,
  type GenerationListRunsInput,
  GenerationListRunsInputSchema,
  type GenerationResultRef,
  type GenerationRun,
  GenerationRunListSchema,
  GenerationRunSchema,
  type GenerationRunStage,
  GenerationRunStageSchema,
  type GenerationRunType,
  type GenerationScopeType,
  type ModelSupportStatus,
  type PromptOutputMode,
  type SkeletonCandidateDocument,
  type SkeletonCandidateOutput,
} from '@worldforge/contracts';

import { type DatabaseClock } from '../database/index.js';
import { type ProjectWorkspaceService } from '../project-workspace.js';
import { sqliteResult } from '../database/sqlite-result.js';

export interface GenerationRunServiceContext {
  readonly workspace: ProjectWorkspaceService;
  readonly clock: DatabaseClock;
  readonly idFactory: () => string;
}

export type GenerationRunServiceErrorCode =
  | 'GENERATION_RUN_NOT_FOUND'
  | 'GENERATION_RUN_TERMINAL'
  | 'GENERATION_RUN_NOT_ACTIVE'
  | 'GENERATION_PARTIAL_UNAVAILABLE'
  | 'GENERATION_PARTIAL_DECIDED'
  | 'GENERATION_CANDIDATE_INVALID'
  | 'GENERATION_BASE_CONFLICT'
  | 'GENERATION_RESULT_CONFLICT'
  | 'GENERATION_MODEL_SUPPORT_INVALID';

export class GenerationRunServiceError extends Error {
  readonly code: GenerationRunServiceErrorCode;
  constructor(code: GenerationRunServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'GenerationRunServiceError';
    this.code = code;
  }
}

export interface GenerationRunServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface GenerationRunCreateInput {
  readonly projectId: string;
  readonly scopeType: GenerationScopeType;
  readonly scopeId: string;
  readonly chapterId: string | null;
  readonly baseDraftId: string | null;
  readonly baseDraftRevision: number | null;
  readonly runType: GenerationRunType;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly outputMode: PromptOutputMode;
  readonly providerId: string;
  readonly actualModel: string;
  readonly supportStatus: ModelSupportStatus;
  readonly constraintPackage: ConstraintPackage | null;
  readonly inputSources?: readonly GenerationInputSourceInput[];
  readonly taskId?: string;
}

export interface GenerationInputSourceInput {
  readonly sourceType:
    | 'chapter_goal'
    | 'skeleton_candidate'
    | 'scene_beat'
    | 'draft_block'
    | 'candidate'
    | 'current_draft'
    | 'generation_run'
    | 'version'
    | 'scope'
    | 'idea_card'
    | 'journal_entry';
  readonly sourceId: string;
  readonly sourceOrder: number;
  readonly contentHash?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GenerationRunIdentity {
  readonly projectId: string;
  readonly runId: string;
}

export interface GenerationRunStageInput extends GenerationRunIdentity {
  readonly stage: GenerationRunStage;
}

export interface GenerationUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
}

export interface GenerationProseCandidateInput extends GenerationRunIdentity {
  readonly title: string;
  readonly candidateType: Exclude<CandidateType, 'skeleton'>;
  readonly completeness: 'complete' | 'partial';
  readonly sourceVersionId?: string | null;
  readonly blocks: readonly CandidateBlockInput[];
  readonly sourceMappings?: readonly GenerationCandidateSourceMappingInput[];
  readonly usage?: GenerationUsage;
}

export interface GenerationCandidateSourceMappingInput {
  readonly mappingType: 'rewrite' | 'beat' | 'segment';
  readonly sourceUnitId: string;
  readonly sourceOrder: number;
  readonly sourceCandidateId?: string | null;
  readonly sceneBeatId?: string | null;
  readonly sourceBlockIds: readonly string[];
  readonly keepCurrentDraft?: boolean;
  readonly rangeAnchor?: Readonly<Record<string, unknown>> | null;
}

export interface GenerationSkeletonCandidateInput {
  readonly title: string;
  readonly structuredPayload: SkeletonCandidateOutput;
}

export interface GenerationSkeletonCompletionInput extends GenerationRunIdentity {
  readonly candidates: readonly GenerationSkeletonCandidateInput[];
  readonly usage?: GenerationUsage;
}

export interface GenerationCompletion {
  readonly run: GenerationRun;
  readonly candidate: CandidateDocument;
}

export interface GenerationSkeletonCompletion {
  readonly run: GenerationRun;
  readonly candidates: readonly SkeletonCandidateDocument[];
}

export interface GenerationPartialDecision {
  readonly run: GenerationRun;
  readonly candidate: CandidateDocument | null;
}

export interface GenerationContinuationContext {
  readonly originalRunId: string;
  readonly receivedText: string;
  readonly originalPromptId: string;
  readonly originalPromptVersion: number;
  readonly originalConstraintHash: string;
}

export interface GenerationRunRow {
  readonly runId: string;
  readonly requestId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly scopeType: string;
  readonly scopeId: string;
  readonly chapterId: string | null;
  readonly baseDraftId: string | null;
  readonly baseDraftRevision: number | bigint | null;
  readonly runType: string;
  readonly promptId: string;
  readonly promptVersion: number | bigint;
  readonly outputMode: string;
  readonly providerId: string;
  readonly actualModel: string;
  readonly supportStatus: string;
  readonly status: string;
  readonly stage: string;
  readonly retryCount: number | bigint;
  readonly inputTokens: number | bigint | null;
  readonly outputTokens: number | bigint | null;
  readonly errorCode: string | null;
  readonly retryable: number | bigint | null;
  readonly partialStatus: string;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

export interface GenerationResultRefRow {
  readonly resultType: string;
  readonly resultId: string;
  readonly candidateKind: string | null;
}

export interface PartialBufferRow {
  readonly text: string;
}

export interface DraftBaseRow {
  readonly draftId: string;
  readonly revision: number | bigint;
}

export interface DraftHashRow {
  readonly logicalBlockId: string;
  readonly contentHash: string;
}

export const runSelect = `SELECT generation.id AS runId, generation.request_id AS requestId,
                          generation.task_id AS taskId, generation.project_id AS projectId,
                          generation.scope_type AS scopeType, generation.scope_id AS scopeId,
                          generation.chapter_id AS chapterId,
                          generation.base_draft_id AS baseDraftId,
                          generation.base_draft_revision AS baseDraftRevision,
                          generation.run_type AS runType, generation.prompt_id AS promptId,
                          generation.prompt_version AS promptVersion,
                          generation.output_mode AS outputMode,
                          generation.provider_id AS providerId,
                          generation.actual_model AS actualModel,
                          generation.support_status AS supportStatus,
                          generation.status, generation.stage,
                          generation.retry_count AS retryCount,
                          generation.input_tokens AS inputTokens,
                          generation.output_tokens AS outputTokens,
                          generation.error_code AS errorCode,
                          generation.retryable, generation.partial_status AS partialStatus,
                          generation.created_at AS createdAt,
                          generation.started_at AS startedAt,
                          generation.finished_at AS finishedAt
                     FROM generation_runs generation`;

export function resultRefs(database: DatabaseSync, runId: string): GenerationResultRef[] {
  const rows = sqliteResult<GenerationResultRefRow[]>(
    database
      .prepare(
        `SELECT result_type AS resultType, result_id AS resultId,
              candidate_kind AS candidateKind
         FROM generation_result_refs
        WHERE run_id = ?
        ORDER BY created_at, result_type, result_id`,
      )
      .all(runId),
  );
  const refs: GenerationResultRef[] = [];
  for (const row of rows) {
    if (row.resultType === 'candidate') {
      refs.push({
        resultType: 'candidate',
        resultId: row.resultId,
        candidateKind: row.candidateKind as 'prose' | 'skeleton',
      });
    } else if (row.resultType === 'state_proposal_batch') {
      refs.push({ resultType: 'state_proposal_batch', resultId: row.resultId });
    } else if (row.resultType === 'validation_batch') {
      refs.push({ resultType: 'validation_batch', resultId: row.resultId });
    } else if (row.resultType === 'idea_card') {
      refs.push({ resultType: 'idea_card', resultId: row.resultId });
    } else if (row.resultType === 'journal_entry') {
      refs.push({ resultType: 'journal_entry', resultId: row.resultId });
    }
  }
  return refs;
}

export function mapRun(database: DatabaseSync, row: GenerationRunRow): GenerationRun {
  return GenerationRunSchema.parse({
    runId: row.runId,
    requestId: row.requestId,
    taskId: row.taskId,
    projectId: row.projectId,
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    chapterId: row.chapterId,
    baseDraftId: row.baseDraftId,
    baseDraftRevision: row.baseDraftRevision === null ? null : Number(row.baseDraftRevision),
    runType: row.runType,
    promptId: row.promptId,
    promptVersion: Number(row.promptVersion),
    outputMode: row.outputMode,
    providerId: row.providerId,
    actualModel: row.actualModel,
    supportStatus: row.supportStatus,
    status: row.status,
    stage: row.stage,
    retryCount: Number(row.retryCount),
    inputTokens: row.inputTokens === null ? null : Number(row.inputTokens),
    outputTokens: row.outputTokens === null ? null : Number(row.outputTokens),
    errorCode: row.errorCode,
    retryable: row.retryable === null ? null : Number(row.retryable) === 1,
    partialStatus: row.partialStatus,
    resultRefs: resultRefs(database, row.runId),
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  });
}

export function readRun(database: DatabaseSync, input: GenerationRunIdentity): GenerationRun {
  const row = database
    .prepare(`${runSelect} WHERE generation.id = ? AND generation.project_id = ?`)
    .get(input.runId, input.projectId) as GenerationRunRow | undefined;
  if (!row) {
    throw new GenerationRunServiceError(
      'GENERATION_RUN_NOT_FOUND',
      'The GenerationRun was not found.',
    );
  }
  return mapRun(database, row);
}

export function assertActive(run: GenerationRun): void {
  if (run.status !== 'queued' && run.status !== 'running') {
    throw new GenerationRunServiceError(
      'GENERATION_RUN_TERMINAL',
      'The GenerationRun is already terminal.',
    );
  }
}

export function auditSources(constraints: ConstraintPackage) {
  return (['P0', 'P1', 'P2', 'P3', 'P4'] as const).flatMap((priority) =>
    constraints.sections[priority].map((source) => ({
      id: source.id,
      priority: source.priority,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      sourceVersionId: source.sourceVersionId,
      chapterId: source.chapterId,
      entityId: source.entityId,
      semanticKey: source.semanticKey,
      temporalStatus: source.temporalStatus,
      contentHash: source.contentHash,
      estimatedTokens: source.estimatedTokens,
    })),
  );
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function assertGenerationScope(database: DatabaseSync, input: GenerationRunCreateInput): void {
  let found: unknown;
  if (input.scopeType === 'project') {
    found =
      input.scopeId === input.projectId
        ? database.prepare('SELECT 1 FROM projects WHERE id = ?').get(input.projectId)
        : undefined;
  } else if (input.scopeType === 'volume') {
    found = database
      .prepare(
        `SELECT 1 FROM volumes
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
      )
      .get(input.scopeId, input.projectId);
  } else if (input.scopeType === 'chapter') {
    found = database
      .prepare(
        `SELECT 1
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(input.scopeId, input.projectId);
    if (input.chapterId !== input.scopeId) found = undefined;
  } else if (input.scopeType === 'scene') {
    found = database
      .prepare(
        `SELECT 1 FROM scene_beats
          WHERE id = ? AND project_id = ? AND deleted_at IS NULL`,
      )
      .get(input.scopeId, input.projectId);
  } else if (input.scopeType === 'entity') {
    found = database
      .prepare(
        `SELECT 1 FROM entities
          WHERE id = ? AND project_id = ? AND status = 'active'`,
      )
      .get(input.scopeId, input.projectId);
  } else {
    found = database
      .prepare(
        `SELECT 1
           FROM draft_blocks block
           JOIN drafts draft ON draft.id = block.draft_id
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE block.logical_block_id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(input.scopeId, input.projectId);
  }
  if (!found) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The GenerationRun scope is missing, stale, or outside the project.',
    );
  }
  if (input.chapterId !== null && input.scopeType !== 'chapter') {
    const chapter = database
      .prepare(
        `SELECT 1
           FROM chapters chapter
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE chapter.id = ? AND volume.project_id = ?
            AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
      )
      .get(input.chapterId, input.projectId);
    if (!chapter) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'The GenerationRun compatibility chapter is outside the project.',
      );
    }
  }
}

export function create(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunCreateInput,
): Promise<GenerationRun> {
  const constraints = input.constraintPackage;
  if (input.runType === 'idea_explore' || input.runType === 'journal_summarize') {
    if (constraints !== null) {
      return Promise.reject(
        new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'Project-scoped Generation workflows must not persist a chapter ConstraintPackage.',
        ),
      );
    }
  } else if (
    constraints === null ||
    input.chapterId === null ||
    constraints.projectId !== input.projectId ||
    constraints.chapterId !== input.chapterId ||
    constraints.taskType !== input.runType
  ) {
    return Promise.reject(
      new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'The ConstraintPackage scope does not match the GenerationRun.',
      ),
    );
  }
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const existing = database
      .prepare(`${runSelect} WHERE generation.request_id = ? AND generation.project_id = ?`)
      .get(requestId, input.projectId) as GenerationRunRow | undefined;
    if (existing) return mapRun(database, existing);

    assertGenerationScope(database, input);
    if ((input.baseDraftId === null) !== (input.baseDraftRevision === null)) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'Draft ID and Revision must be provided together.',
      );
    }
    if (input.baseDraftId !== null) {
      if (input.chapterId === null) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'A GenerationRun Draft baseline requires a chapter scope.',
        );
      }
      const base = database
        .prepare(
          `SELECT draft.revision
               FROM drafts draft
              WHERE draft.id = ? AND draft.chapter_id = ?`,
        )
        .get(input.baseDraftId, input.chapterId);
      if (!base || Number(base.revision) !== input.baseDraftRevision) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'The GenerationRun Draft baseline is stale.',
        );
      }
    }
    const runId = context.idFactory();
    const taskId = input.taskId ?? context.idFactory();
    const createdAt = context.clock.now().toISOString();
    database
      .prepare(
        `INSERT INTO generation_runs(
             id, request_id, task_id, project_id, scope_type, scope_id, chapter_id,
             base_draft_id, base_draft_revision, run_type, prompt_id, prompt_version,
             output_mode, provider_id, actual_model, support_status, status, stage,
             retry_count, input_tokens, output_tokens, error_code, retryable,
             partial_status, created_at, started_at, finished_at
           ) VALUES(
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', 0,
             NULL, NULL, NULL, NULL, 'unavailable', ?, NULL, NULL
           )`,
      )
      .run(
        runId,
        requestId,
        taskId,
        input.projectId,
        input.scopeType,
        input.scopeId,
        input.chapterId,
        input.baseDraftId,
        input.baseDraftRevision,
        input.runType,
        input.promptId,
        input.promptVersion,
        input.outputMode,
        input.providerId,
        input.actualModel,
        input.supportStatus,
        createdAt,
      );
    if (constraints !== null) {
      database
        .prepare(
          `INSERT INTO generation_constraint_packages(
               run_id, constraint_hash, content_hash, snapshot_source,
               source_version_ids_json, sources_json, estimated_tokens,
               trim_log_json, created_at
             ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          runId,
          constraints.constraintHash,
          constraints.contentHash,
          constraints.snapshotSource,
          JSON.stringify(constraints.sourceVersionIds),
          JSON.stringify(auditSources(constraints)),
          constraints.estimatedTokens,
          JSON.stringify(constraints.trimLog),
          createdAt,
        );
    }
    const insertInputSource = database.prepare(
      `INSERT INTO generation_input_sources(
           run_id, source_type, source_id, source_order,
           content_hash, metadata_json, created_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const source of input.inputSources ?? []) {
      if (
        !source.sourceId ||
        !Number.isInteger(source.sourceOrder) ||
        source.sourceOrder < 0 ||
        (source.contentHash !== undefined &&
          source.contentHash !== null &&
          !/^[0-9a-f]{64}$/u.test(source.contentHash))
      ) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'A GenerationRun input source is invalid.',
        );
      }
      insertInputSource.run(
        runId,
        source.sourceType,
        source.sourceId,
        source.sourceOrder,
        source.contentHash ?? null,
        JSON.stringify(source.metadata ?? {}),
        createdAt,
      );
    }
    return readRun(database, { projectId: input.projectId, runId });
  });
}

export function get(
  context: GenerationRunServiceContext,
  raw: GenerationGetRunInput,
): GenerationRun {
  const input = GenerationGetRunInputSchema.parse(raw);
  return context.workspace.readProject(input.projectId, (database) => readRun(database, input));
}

export function list(
  context: GenerationRunServiceContext,
  raw: GenerationListRunsInput,
): {
  readonly runs: readonly GenerationRun[];
} {
  const input = GenerationListRunsInputSchema.parse(raw);
  return context.workspace.readProject(input.projectId, (database) => {
    const rows = sqliteResult<GenerationRunRow[]>(
      database
        .prepare(
          `${runSelect}
            WHERE generation.project_id = ?
              AND (? IS NULL OR generation.chapter_id = ?)
              AND (? IS NULL OR generation.scope_type = ?)
              AND (? IS NULL OR generation.scope_id = ?)
            ORDER BY generation.created_at DESC, generation.id DESC`,
        )
        .all(
          input.projectId,
          input.chapterId,
          input.chapterId,
          input.scopeType,
          input.scopeType,
          input.scopeId,
          input.scopeId,
        ),
    );
    return GenerationRunListSchema.parse({ runs: rows.map((row) => mapRun(database, row)) });
  });
}

export function getContinuationContext(
  context: GenerationRunServiceContext,
  input: GenerationRunIdentity,
): GenerationContinuationContext {
  return context.workspace.readProject(input.projectId, (database) => {
    const run = readRun(database, input);
    if (
      (run.status !== 'failed' && run.status !== 'cancelled') ||
      (run.partialStatus !== 'available' && run.partialStatus !== 'saved')
    ) {
      throw new GenerationRunServiceError(
        'GENERATION_PARTIAL_UNAVAILABLE',
        'The GenerationRun has no partial output that can be continued.',
      );
    }
    const receivedText =
      run.partialStatus === 'available'
        ? ((
            database
              .prepare(`SELECT text FROM generation_partial_buffers WHERE run_id = ?`)
              .get(run.runId) as PartialBufferRow | undefined
          )?.text ?? '')
        : sqliteResult<Array<{ readonly text: string }>>(
            database
              .prepare(
                `SELECT block.text
               FROM candidates candidate
               JOIN candidate_blocks block ON block.candidate_id = candidate.id
              WHERE candidate.generation_run_id = ?
                AND candidate.completeness = 'partial'
              ORDER BY candidate.created_at DESC, block.order_key, block.id`,
              )
              .all(run.runId),
          )
            .map((row) => row.text)
            .join('\n\n');
    const constraint = database
      .prepare(
        `SELECT constraint_hash AS constraintHash
             FROM generation_constraint_packages WHERE run_id = ?`,
      )
      .get(run.runId) as { readonly constraintHash: string } | undefined;
    if (!receivedText.trim() || !constraint) {
      throw new GenerationRunServiceError(
        'GENERATION_PARTIAL_UNAVAILABLE',
        'The persisted partial continuation boundary is missing.',
      );
    }
    return {
      originalRunId: run.runId,
      receivedText,
      originalPromptId: run.promptId,
      originalPromptVersion: run.promptVersion,
      originalConstraintHash: constraint.constraintHash,
    };
  });
}

export function markRunning(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity,
): Promise<GenerationRun> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    const startedAt = context.clock.now().toISOString();
    database
      .prepare(
        `UPDATE generation_runs
              SET status = 'running', stage = 'assembling_constraints',
                  started_at = COALESCE(started_at, ?)
            WHERE id = ? AND project_id = ?`,
      )
      .run(startedAt, input.runId, input.projectId);
    return readRun(database, input);
  });
}

export function markStage(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunStageInput,
): Promise<GenerationRun> {
  const stage = GenerationRunStageSchema.parse(input.stage);
  if (stage === 'completed' || stage === 'failed' || stage === 'cancelled') {
    return Promise.reject(
      new GenerationRunServiceError(
        'GENERATION_RUN_TERMINAL',
        'Terminal stages require their dedicated transition.',
      ),
    );
  }
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    database
      .prepare(`UPDATE generation_runs SET status = 'running', stage = ? WHERE id = ?`)
      .run(stage, input.runId);
    return readRun(database, input);
  });
}

export function updateUsage(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity & GenerationUsage,
): Promise<GenerationRun> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    database
      .prepare(
        `UPDATE generation_runs
              SET input_tokens = COALESCE(?, input_tokens),
                  output_tokens = COALESCE(?, output_tokens)
            WHERE id = ?`,
      )
      .run(input.inputTokens ?? null, input.outputTokens ?? null, input.runId);
    return readRun(database, input);
  });
}

export function cancel(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity,
  partialText?: string,
): Promise<GenerationRun> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    const now = context.clock.now().toISOString();
    let partialStatus = run.partialStatus;
    if (partialText) {
      database
        .prepare(
          `INSERT INTO generation_partial_buffers(
               run_id, text, content_hash, received_characters, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?)
             ON CONFLICT(run_id) DO UPDATE SET
               text = excluded.text,
               content_hash = excluded.content_hash,
               received_characters = excluded.received_characters,
               updated_at = excluded.updated_at`,
        )
        .run(input.runId, partialText, sha256(partialText), partialText.length, now, now);
      partialStatus = 'available';
    }
    database
      .prepare(
        `UPDATE generation_runs
              SET status = 'cancelled', stage = 'cancelled', partial_status = ?,
                  error_code = NULL, retryable = NULL, finished_at = ?
            WHERE id = ?`,
      )
      .run(partialStatus, now, input.runId);
    return readRun(database, input);
  });
}

export function fail(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationRunIdentity & {
    readonly errorCode: ErrorCode;
    readonly retryable: boolean;
    readonly partialText?: string;
  },
): Promise<GenerationRun> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    const now = context.clock.now().toISOString();
    let partialStatus = run.partialStatus;
    if (input.partialText) {
      database
        .prepare(
          `INSERT INTO generation_partial_buffers(
               run_id, text, content_hash, received_characters, created_at, updated_at
             ) VALUES(?, ?, ?, ?, ?, ?)
             ON CONFLICT(run_id) DO UPDATE SET
               text = excluded.text,
               content_hash = excluded.content_hash,
               received_characters = excluded.received_characters,
               updated_at = excluded.updated_at`,
        )
        .run(
          input.runId,
          input.partialText,
          sha256(input.partialText),
          input.partialText.length,
          now,
          now,
        );
      partialStatus = 'available';
    }
    database
      .prepare(
        `UPDATE generation_runs
              SET status = 'failed', stage = 'failed', partial_status = ?,
                  error_code = ?, retryable = ?, finished_at = ?
            WHERE id = ?`,
      )
      .run(partialStatus, input.errorCode, input.retryable ? 1 : 0, now, input.runId);
    return readRun(database, input);
  });
}

export function recoverInterrupted(
  context: GenerationRunServiceContext,
  requestId: string,
  projectId: string,
): Promise<number> {
  return context.workspace.writeProject(requestId, projectId, (database) => {
    const now = context.clock.now().toISOString();
    const result = database
      .prepare(
        `UPDATE generation_runs
              SET status = 'failed', stage = 'failed',
                  error_code = 'AI_STREAM_INTERRUPTED_009', retryable = 1,
                  partial_status = CASE
                    WHEN EXISTS(
                      SELECT 1 FROM generation_partial_buffers partial
                       WHERE partial.run_id = generation_runs.id
                    ) THEN 'available'
                    ELSE partial_status
                  END,
                  finished_at = ?
            WHERE project_id = ? AND status IN ('queued', 'running')`,
      )
      .run(now, projectId);
    return Number(result.changes);
  });
}
