import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  CandidateCreateFixtureInputSchema,
  CandidateBlockSchema,
  CandidateDocumentSchema,
  GenerationGetRunInputSchema,
  GenerationListRunsInputSchema,
  GenerationModelSupportInputSchema,
  GenerationRunListSchema,
  GenerationRunSchema,
  GenerationRunStageSchema,
  ModelSupportProfileSchema,
  SkeletonCandidateDocumentSchema,
  SkeletonCandidateOutputSchema,
  type CandidateBlock,
  type CandidateBlockInput,
  type CandidateDocument,
  type CandidateType,
  type ConstraintPackage,
  type ErrorCode,
  type GenerationGetRunInput,
  type GenerationListRunsInput,
  type GenerationModelSupportInput,
  type GenerationResultRef,
  type GenerationRun,
  type GenerationRunStage,
  type GenerationRunType,
  type ModelSupportProfile,
  type ModelSupportStatus,
  type PromptOutputMode,
  type SkeletonCandidateDocument,
  type SkeletonCandidateOutput,
} from '@worldforge/contracts';
import { normalizeDraftBlockSemantic } from '@worldforge/domain';

import {
  candidateDocumentContentHash,
  candidateSkeletonContentHash,
  candidateSkeletonPayloadHash,
} from './candidate-integrity.js';
import type { DatabaseClock } from './database/index.js';
import { draftContentHash } from './draft.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

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
  readonly chapterId: string;
  readonly baseDraftId: string | null;
  readonly baseDraftRevision: number | null;
  readonly runType: GenerationRunType;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly outputMode: PromptOutputMode;
  readonly providerId: string;
  readonly actualModel: string;
  readonly supportStatus: ModelSupportStatus;
  readonly constraintPackage: ConstraintPackage;
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
    | 'version';
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

interface GenerationRunRow {
  readonly runId: string;
  readonly requestId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly chapterId: string;
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

interface GenerationResultRefRow {
  readonly resultType: string;
  readonly resultId: string;
  readonly candidateKind: string | null;
}

interface PartialBufferRow {
  readonly text: string;
}

interface DraftBaseRow {
  readonly draftId: string;
  readonly revision: number | bigint;
}

interface DraftHashRow {
  readonly logicalBlockId: string;
  readonly contentHash: string;
}

const runSelect = `SELECT generation.id AS runId, generation.request_id AS requestId,
                          generation.task_id AS taskId, generation.project_id AS projectId,
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

function resultRefs(database: DatabaseSync, runId: string): GenerationResultRef[] {
  const rows = database
    .prepare(
      `SELECT result_type AS resultType, result_id AS resultId,
              candidate_kind AS candidateKind
         FROM generation_result_refs
        WHERE run_id = ?
        ORDER BY created_at, result_type, result_id`,
    )
    .all(runId) as unknown as GenerationResultRefRow[];
  return rows.map((row) =>
    row.resultType === 'candidate'
      ? {
          resultType: 'candidate' as const,
          resultId: row.resultId,
          candidateKind: row.candidateKind,
        }
      : row.resultType === 'state_proposal_batch'
        ? {
            resultType: 'state_proposal_batch' as const,
            resultId: row.resultId,
          }
        : {
            resultType: 'validation_batch' as const,
            resultId: row.resultId,
          },
  ) as GenerationResultRef[];
}

function mapRun(database: DatabaseSync, row: GenerationRunRow): GenerationRun {
  return GenerationRunSchema.parse({
    runId: row.runId,
    requestId: row.requestId,
    taskId: row.taskId,
    projectId: row.projectId,
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

function readRun(database: DatabaseSync, input: GenerationRunIdentity): GenerationRun {
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

function assertActive(run: GenerationRun): void {
  if (run.status !== 'queued' && run.status !== 'running') {
    throw new GenerationRunServiceError(
      'GENERATION_RUN_TERMINAL',
      'The GenerationRun is already terminal.',
    );
  }
}

function auditSources(constraints: ConstraintPackage) {
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

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function verifyDraftBase(database: DatabaseSync, run: GenerationRun): DraftBaseRow {
  if (!run.baseDraftId || run.baseDraftRevision === null) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'A prose Candidate requires a Draft baseline.',
    );
  }
  const row = database
    .prepare(
      `SELECT draft.id AS draftId, draft.revision
         FROM drafts draft
         JOIN chapters chapter ON chapter.id = draft.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE draft.id = ? AND chapter.id = ? AND volume.project_id = ?
          AND chapter.active_draft_id = draft.id AND draft.status = 'active'
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(run.baseDraftId, run.chapterId, run.projectId) as DraftBaseRow | undefined;
  if (!row || Number(row.revision) !== run.baseDraftRevision) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The Draft baseline changed before the Candidate could be saved.',
    );
  }
  return row;
}

function insertProseCandidate(
  database: DatabaseSync,
  run: GenerationRun,
  input: Omit<GenerationProseCandidateInput, keyof GenerationRunIdentity>,
  idFactory: () => string,
  now: string,
): CandidateDocument {
  verifyDraftBase(database, run);
  const parsed = CandidateCreateFixtureInputSchema.parse({
    projectId: run.projectId,
    chapterId: run.chapterId,
    draftId: run.baseDraftId,
    baseDraftRevision: run.baseDraftRevision,
    candidateType: input.candidateType,
    completeness: input.completeness,
    title: input.title,
    sourceVersionId: input.sourceVersionId ?? null,
    blocks: input.blocks,
  });
  if (parsed.sourceVersionId) {
    const source = database
      .prepare(
        `SELECT 1
           FROM versions version
           JOIN chapters chapter ON chapter.id = version.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE version.id = ? AND chapter.id = ? AND volume.project_id = ?`,
      )
      .get(parsed.sourceVersionId, run.chapterId, run.projectId);
    if (!source) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'The source Version is outside the GenerationRun scope.',
      );
    }
  }

  const draftHashes = new Map(
    (
      database
        .prepare(
          `SELECT logical_block_id AS logicalBlockId, content_hash AS contentHash
             FROM draft_blocks WHERE draft_id = ?`,
        )
        .all(run.baseDraftId) as unknown as DraftHashRow[]
    ).map((row) => [row.logicalBlockId, row.contentHash]),
  );
  const logicalIds = new Set<string>();
  const blocks: CandidateBlock[] = parsed.blocks.map((block, index) => {
    const logicalBlockId = block.logicalBlockId ?? idFactory();
    if (logicalIds.has(logicalBlockId)) {
      throw new GenerationRunServiceError(
        'GENERATION_CANDIDATE_INVALID',
        'Candidate logical block IDs must be unique.',
      );
    }
    logicalIds.add(logicalBlockId);
    const sourceLogicalBlockIds = [
      ...new Set(
        block.sourceLogicalBlockIds ?? (draftHashes.has(logicalBlockId) ? [logicalBlockId] : []),
      ),
    ];
    for (const sourceLogicalBlockId of sourceLogicalBlockIds) {
      if (!draftHashes.has(sourceLogicalBlockId)) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'A Candidate source block is outside the active Draft.',
        );
      }
    }
    if (
      block.sourceBlockHash &&
      (sourceLogicalBlockIds.length !== 1 ||
        draftHashes.get(sourceLogicalBlockIds[0] ?? '') !== block.sourceBlockHash)
    ) {
      throw new GenerationRunServiceError(
        'GENERATION_BASE_CONFLICT',
        'A Candidate source block changed before save.',
      );
    }
    const normalized = normalizeDraftBlockSemantic({
      blockType: block.blockType,
      content: block.text,
      attributes: block.attributes,
    });
    return CandidateBlockSchema.parse({
      candidateBlockId: idFactory(),
      logicalBlockId,
      sourceLogicalBlockIds,
      orderKey: String((index + 1) * 1024),
      blockType: normalized.blockType,
      text: normalized.content,
      attributes: normalized.attributes,
      beatId: block.beatId ?? null,
      sourceBlockHash: block.sourceBlockHash ?? null,
      contentHash: draftContentHash({
        blockType: normalized.blockType,
        content: normalized.content,
        attributes: normalized.attributes,
      }),
    });
  });

  const candidateId = idFactory();
  const contentHash = candidateDocumentContentHash(blocks);
  database
    .prepare(
      `INSERT INTO candidates(
         id, chapter_id, generation_run_id, candidate_type, base_draft_id,
         base_draft_revision, completeness, status, title, source_version_id,
         content_hash, created_at, resolved_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL)`,
    )
    .run(
      candidateId,
      run.chapterId,
      run.runId,
      parsed.candidateType,
      run.baseDraftId,
      run.baseDraftRevision,
      parsed.completeness,
      parsed.title,
      parsed.sourceVersionId ?? null,
      contentHash,
      now,
    );
  const insertBlock = database.prepare(
    `INSERT INTO candidate_blocks(
       id, candidate_id, logical_block_id, order_key, block_type, text,
       attributes_json, beat_id, source_block_hash, content_hash
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertSource = database.prepare(
    `INSERT INTO candidate_block_sources(
       candidate_block_id, source_logical_block_id, source_order
     ) VALUES(?, ?, ?)`,
  );
  for (const block of blocks) {
    insertBlock.run(
      block.candidateBlockId,
      candidateId,
      block.logicalBlockId,
      BigInt(block.orderKey),
      block.blockType,
      block.text,
      JSON.stringify(block.attributes),
      block.beatId,
      block.sourceBlockHash,
      block.contentHash,
    );
    block.sourceLogicalBlockIds.forEach((sourceLogicalBlockId, index) =>
      insertSource.run(block.candidateBlockId, sourceLogicalBlockId, index),
    );
  }
  const insertMapping = database.prepare(
    `INSERT INTO candidate_source_mappings(
       candidate_id, mapping_type, source_unit_id, source_order,
       source_candidate_id, scene_beat_id, source_block_ids_json,
       keep_current_draft, range_anchor_json, created_at
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const mapping of input.sourceMappings ?? []) {
    if (!Number.isInteger(mapping.sourceOrder) || mapping.sourceOrder < 0) {
      throw new GenerationRunServiceError(
        'GENERATION_CANDIDATE_INVALID',
        'Candidate source mapping order must be a non-negative integer.',
      );
    }
    if (mapping.sourceCandidateId) {
      const source = database
        .prepare(
          `SELECT 1
             FROM candidates source
             JOIN chapters chapter ON chapter.id = source.chapter_id
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE source.id = ? AND source.chapter_id = ? AND volume.project_id = ?
              AND source.candidate_type <> 'skeleton'`,
        )
        .get(mapping.sourceCandidateId, run.chapterId, run.projectId);
      if (!source) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'A Candidate source mapping is outside the GenerationRun scope.',
        );
      }
    }
    if (mapping.sceneBeatId) {
      const beat = database
        .prepare(
          `SELECT 1 FROM scene_beats
            WHERE id = ? AND project_id = ? AND chapter_id = ? AND deleted_at IS NULL`,
        )
        .get(mapping.sceneBeatId, run.projectId, run.chapterId);
      if (!beat) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'A SceneBeat source mapping is outside the GenerationRun scope.',
        );
      }
    }
    insertMapping.run(
      candidateId,
      mapping.mappingType,
      mapping.sourceUnitId,
      mapping.sourceOrder,
      mapping.sourceCandidateId ?? null,
      mapping.sceneBeatId ?? null,
      JSON.stringify(mapping.sourceBlockIds),
      mapping.keepCurrentDraft ? 1 : 0,
      mapping.rangeAnchor ? JSON.stringify(mapping.rangeAnchor) : null,
      now,
    );
  }
  return CandidateDocumentSchema.parse({
    candidateId,
    projectId: run.projectId,
    chapterId: run.chapterId,
    generationRunId: run.runId,
    candidateType: parsed.candidateType,
    baseDraftId: run.baseDraftId,
    baseDraftRevision: run.baseDraftRevision,
    completeness: parsed.completeness,
    status: 'pending',
    title: parsed.title,
    sourceVersionId: parsed.sourceVersionId ?? null,
    contentHash,
    blockCount: blocks.length,
    createdAt: now,
    resolvedAt: null,
    blocks,
  });
}

function insertSkeletonCandidate(
  database: DatabaseSync,
  run: GenerationRun,
  input: GenerationSkeletonCandidateInput,
  idFactory: () => string,
  now: string,
): SkeletonCandidateDocument {
  verifyDraftBase(database, run);
  if (run.runType !== 'skeleton') {
    throw new GenerationRunServiceError(
      'GENERATION_CANDIDATE_INVALID',
      'Only a Skeleton GenerationRun can save Skeleton Candidates.',
    );
  }
  const structuredPayload = SkeletonCandidateOutputSchema.parse(input.structuredPayload);
  const title = input.title.trim();
  if (!title || title.length > 240) {
    throw new GenerationRunServiceError(
      'GENERATION_CANDIDATE_INVALID',
      'Skeleton Candidate titles must contain 1 to 240 characters.',
    );
  }
  const candidateId = idFactory();
  const skeletonRevisionId = idFactory();
  const payloadSchemaVersion = 1;
  const payloadHash = candidateSkeletonPayloadHash(structuredPayload);
  const contentHash = candidateSkeletonContentHash(payloadSchemaVersion, payloadHash);
  const constraint = database
    .prepare(
      `SELECT constraint_hash AS constraintHash
         FROM generation_constraint_packages WHERE run_id = ?`,
    )
    .get(run.runId) as { readonly constraintHash: string } | undefined;
  if (!constraint) {
    throw new GenerationRunServiceError(
      'GENERATION_BASE_CONFLICT',
      'The GenerationRun constraint fingerprint is missing.',
    );
  }
  database
    .prepare(
      `INSERT INTO candidates(
         id, chapter_id, generation_run_id, candidate_type, base_draft_id,
         base_draft_revision, completeness, status, title, source_version_id,
         content_hash, created_at, resolved_at
       ) VALUES(?, ?, ?, 'skeleton', ?, ?, 'complete', 'pending', ?, NULL, ?, ?, NULL)`,
    )
    .run(
      candidateId,
      run.chapterId,
      run.runId,
      run.baseDraftId,
      run.baseDraftRevision,
      title,
      contentHash,
      now,
    );
  database
    .prepare(
      `INSERT INTO candidate_skeleton_revisions(
         id, candidate_id, revision, parent_revision_id, payload_schema_version,
         structured_payload_json, payload_hash, source_fingerprint, edited_by, created_at
       ) VALUES(?, ?, 1, NULL, ?, ?, ?, ?, 'ai', ?)`,
    )
    .run(
      skeletonRevisionId,
      candidateId,
      payloadSchemaVersion,
      JSON.stringify(structuredPayload),
      payloadHash,
      constraint.constraintHash,
      now,
    );
  return SkeletonCandidateDocumentSchema.parse({
    candidateId,
    projectId: run.projectId,
    chapterId: run.chapterId,
    generationRunId: run.runId,
    candidateType: 'skeleton',
    baseDraftId: run.baseDraftId,
    baseDraftRevision: run.baseDraftRevision,
    completeness: 'complete',
    status: 'pending',
    title,
    sourceVersionId: null,
    contentHash,
    blockCount: 0,
    createdAt: now,
    resolvedAt: null,
    skeletonRevisionId,
    skeletonRevision: 1,
    payloadSchemaVersion,
    structuredPayload,
    payloadHash,
    sourceState: 'current',
    parentSkeletonRevisionId: null,
    editedBy: 'ai',
  });
}

function candidateTypeForPartial(runType: GenerationRunType): Exclude<CandidateType, 'skeleton'> {
  if (runType === 'chapter') return 'full';
  if (runType === 'rewrite') return 'rewrite';
  if (runType === 'merge') return 'merge';
  throw new GenerationRunServiceError(
    'GENERATION_CANDIDATE_INVALID',
    'This GenerationRun cannot save prose partial output.',
  );
}

export class GenerationRunService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: GenerationRunServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  create(requestId: string, input: GenerationRunCreateInput): Promise<GenerationRun> {
    const constraints = input.constraintPackage;
    if (
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
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const existing = database
        .prepare(`${runSelect} WHERE generation.request_id = ? AND generation.project_id = ?`)
        .get(requestId, input.projectId) as GenerationRunRow | undefined;
      if (existing) return mapRun(database, existing);

      const scope = database
        .prepare(
          `SELECT 1
             FROM chapters chapter
             JOIN volumes volume ON volume.id = chapter.volume_id
            WHERE chapter.id = ? AND volume.project_id = ?
              AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
        )
        .get(input.chapterId, input.projectId);
      if (!scope) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'The chapter is outside the GenerationRun project.',
        );
      }
      if ((input.baseDraftId === null) !== (input.baseDraftRevision === null)) {
        throw new GenerationRunServiceError(
          'GENERATION_BASE_CONFLICT',
          'Draft ID and Revision must be provided together.',
        );
      }
      if (input.baseDraftId !== null) {
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
      const runId = this.#idFactory();
      const taskId = input.taskId ?? this.#idFactory();
      const createdAt = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO generation_runs(
             id, request_id, task_id, project_id, chapter_id, base_draft_id,
             base_draft_revision, run_type, prompt_id, prompt_version, output_mode,
             provider_id, actual_model, support_status, status, stage, retry_count,
             input_tokens, output_tokens, error_code, retryable, partial_status,
             created_at, started_at, finished_at
           ) VALUES(
             ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'queued', 0,
             NULL, NULL, NULL, NULL, 'unavailable', ?, NULL, NULL
           )`,
        )
        .run(
          runId,
          requestId,
          taskId,
          input.projectId,
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

  get(raw: GenerationGetRunInput): GenerationRun {
    const input = GenerationGetRunInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => readRun(database, input));
  }

  list(raw: GenerationListRunsInput): { readonly runs: readonly GenerationRun[] } {
    const input = GenerationListRunsInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const rows = database
        .prepare(
          `${runSelect}
            WHERE generation.project_id = ?
              AND (? IS NULL OR generation.chapter_id = ?)
            ORDER BY generation.created_at DESC, generation.id DESC`,
        )
        .all(input.projectId, input.chapterId, input.chapterId) as unknown as GenerationRunRow[];
      return GenerationRunListSchema.parse({ runs: rows.map((row) => mapRun(database, row)) });
    });
  }

  getContinuationContext(input: GenerationRunIdentity): GenerationContinuationContext {
    return this.#workspace.readProject(input.projectId, (database) => {
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
          : (
              database
                .prepare(
                  `SELECT block.text
               FROM candidates candidate
               JOIN candidate_blocks block ON block.candidate_id = candidate.id
              WHERE candidate.generation_run_id = ?
                AND candidate.completeness = 'partial'
              ORDER BY candidate.created_at DESC, block.order_key, block.id`,
                )
                .all(run.runId) as unknown as Array<{ readonly text: string }>
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

  markRunning(requestId: string, input: GenerationRunIdentity): Promise<GenerationRun> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      const startedAt = this.#clock.now().toISOString();
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

  markStage(requestId: string, input: GenerationRunStageInput): Promise<GenerationRun> {
    const stage = GenerationRunStageSchema.parse(input.stage);
    if (stage === 'completed' || stage === 'failed' || stage === 'cancelled') {
      return Promise.reject(
        new GenerationRunServiceError(
          'GENERATION_RUN_TERMINAL',
          'Terminal stages require their dedicated transition.',
        ),
      );
    }
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      database
        .prepare(`UPDATE generation_runs SET status = 'running', stage = ? WHERE id = ?`)
        .run(stage, input.runId);
      return readRun(database, input);
    });
  }

  updateUsage(
    requestId: string,
    input: GenerationRunIdentity & GenerationUsage,
  ): Promise<GenerationRun> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
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

  recordPartial(
    requestId: string,
    input: GenerationRunIdentity & { readonly text: string },
  ): Promise<GenerationRun> {
    if (!input.text) return Promise.resolve(this.get(input));
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      const now = this.#clock.now().toISOString();
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
        .run(input.runId, input.text, sha256(input.text), input.text.length, now, now);
      database
        .prepare(`UPDATE generation_runs SET partial_status = 'available' WHERE id = ?`)
        .run(input.runId);
      return readRun(database, input);
    });
  }

  cancel(
    requestId: string,
    input: GenerationRunIdentity,
    partialText?: string,
  ): Promise<GenerationRun> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      const now = this.#clock.now().toISOString();
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

  fail(
    requestId: string,
    input: GenerationRunIdentity & {
      readonly errorCode: ErrorCode;
      readonly retryable: boolean;
      readonly partialText?: string;
    },
  ): Promise<GenerationRun> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      const now = this.#clock.now().toISOString();
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

  completeProseCandidate(
    requestId: string,
    input: GenerationProseCandidateInput,
  ): Promise<GenerationCompletion> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      const now = this.#clock.now().toISOString();
      const candidate = insertProseCandidate(database, run, input, this.#idFactory, now);
      database
        .prepare(
          `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'candidate', ?, 'prose', ?)`,
        )
        .run(run.runId, candidate.candidateId, now);
      database
        .prepare(
          `UPDATE generation_runs
              SET status = 'succeeded', stage = 'completed',
                  input_tokens = COALESCE(?, input_tokens),
                  output_tokens = COALESCE(?, output_tokens),
                  error_code = NULL, retryable = NULL, finished_at = ?
            WHERE id = ?`,
        )
        .run(input.usage?.inputTokens ?? null, input.usage?.outputTokens ?? null, now, run.runId);
      return { run: readRun(database, input), candidate };
    });
  }

  completeSkeletonCandidates(
    requestId: string,
    input: GenerationSkeletonCompletionInput,
  ): Promise<GenerationSkeletonCompletion> {
    if (input.candidates.length < 1 || input.candidates.length > 5) {
      return Promise.reject(
        new GenerationRunServiceError(
          'GENERATION_CANDIDATE_INVALID',
          'A Skeleton GenerationRun must save between one and five Candidates.',
        ),
      );
    }
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      assertActive(run);
      if (run.runType !== 'skeleton') {
        throw new GenerationRunServiceError(
          'GENERATION_CANDIDATE_INVALID',
          'This GenerationRun cannot save Skeleton Candidates.',
        );
      }
      const now = this.#clock.now().toISOString();
      const candidates = input.candidates.map((candidate) =>
        insertSkeletonCandidate(database, run, candidate, this.#idFactory, now),
      );
      const insertResult = database.prepare(
        `INSERT INTO generation_result_refs(
           run_id, result_type, result_id, candidate_kind, created_at
         ) VALUES(?, 'candidate', ?, 'skeleton', ?)`,
      );
      for (const candidate of candidates) insertResult.run(run.runId, candidate.candidateId, now);
      database
        .prepare(
          `UPDATE generation_runs
              SET status = 'succeeded', stage = 'completed',
                  input_tokens = COALESCE(?, input_tokens),
                  output_tokens = COALESCE(?, output_tokens),
                  error_code = NULL, retryable = NULL, finished_at = ?
            WHERE id = ?`,
        )
        .run(input.usage?.inputTokens ?? null, input.usage?.outputTokens ?? null, now, run.runId);
      return { run: readRun(database, input), candidates };
    });
  }

  savePartial(requestId: string, input: GenerationRunIdentity): Promise<GenerationPartialDecision> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      if (run.partialStatus !== 'available') {
        throw new GenerationRunServiceError(
          run.partialStatus === 'saved' || run.partialStatus === 'discarded'
            ? 'GENERATION_PARTIAL_DECIDED'
            : 'GENERATION_PARTIAL_UNAVAILABLE',
          'No undecided partial output is available.',
        );
      }
      const buffer = database
        .prepare(`SELECT text FROM generation_partial_buffers WHERE run_id = ?`)
        .get(input.runId) as PartialBufferRow | undefined;
      if (!buffer) {
        throw new GenerationRunServiceError(
          'GENERATION_PARTIAL_UNAVAILABLE',
          'The partial output buffer is missing.',
        );
      }
      const paragraphs = buffer.text
        .trim()
        .split(/\n\s*\n/u)
        .map((text) => text.trim())
        .filter(Boolean);
      if (paragraphs.length === 0) {
        throw new GenerationRunServiceError(
          'GENERATION_CANDIDATE_INVALID',
          'The partial output contains no prose.',
        );
      }
      const now = this.#clock.now().toISOString();
      const candidate = insertProseCandidate(
        database,
        run,
        {
          title: '未完成的生成结果',
          candidateType: candidateTypeForPartial(run.runType),
          completeness: 'partial',
          blocks: paragraphs.map((text) => ({
            blockType: 'paragraph' as const,
            text,
            attributes: {},
          })),
        },
        this.#idFactory,
        now,
      );
      database
        .prepare(
          `INSERT INTO generation_result_refs(
             run_id, result_type, result_id, candidate_kind, created_at
           ) VALUES(?, 'candidate', ?, 'prose', ?)`,
        )
        .run(run.runId, candidate.candidateId, now);
      database
        .prepare(`UPDATE generation_runs SET partial_status = 'saved' WHERE id = ?`)
        .run(run.runId);
      database.prepare(`DELETE FROM generation_partial_buffers WHERE run_id = ?`).run(run.runId);
      return { run: readRun(database, input), candidate };
    });
  }

  discardPartial(
    requestId: string,
    input: GenerationRunIdentity,
  ): Promise<GenerationPartialDecision> {
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const run = readRun(database, input);
      if (run.partialStatus !== 'available') {
        throw new GenerationRunServiceError(
          run.partialStatus === 'saved' || run.partialStatus === 'discarded'
            ? 'GENERATION_PARTIAL_DECIDED'
            : 'GENERATION_PARTIAL_UNAVAILABLE',
          'No undecided partial output is available.',
        );
      }
      database.prepare(`DELETE FROM generation_partial_buffers WHERE run_id = ?`).run(run.runId);
      database
        .prepare(`UPDATE generation_runs SET partial_status = 'discarded' WHERE id = ?`)
        .run(run.runId);
      return { run: readRun(database, input), candidate: null };
    });
  }

  recoverInterrupted(requestId: string, projectId: string): Promise<number> {
    return this.#workspace.writeProject(requestId, projectId, (database) => {
      const now = this.#clock.now().toISOString();
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

  getModelSupport(raw: GenerationModelSupportInput): ModelSupportProfile {
    const input = GenerationModelSupportInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const row = database
        .prepare(
          `SELECT provider_id AS providerId, model, task_type AS taskType,
                  prompt_id AS promptId, prompt_version AS promptVersion,
                  status, evaluated_at AS evaluatedAt,
                  fixture_set_version AS fixtureSetVersion,
                  metrics_json AS metricsJson, limitations_json AS limitationsJson
             FROM model_support_profiles
            WHERE provider_id = ? AND model = ? AND task_type = ?
              AND prompt_id = ? AND prompt_version = ?`,
        )
        .get(input.providerId, input.model, input.taskType, input.promptId, input.promptVersion);
      if (!row) {
        return ModelSupportProfileSchema.parse({
          providerId: input.providerId,
          model: input.model,
          taskType: input.taskType,
          promptId: input.promptId,
          promptVersion: input.promptVersion,
          status: 'unverified',
          limitations: ['该Provider、模型、任务与Prompt版本组合尚未完成独立评测。'],
        });
      }
      try {
        return ModelSupportProfileSchema.parse({
          providerId: row.providerId,
          model: row.model,
          taskType: row.taskType,
          promptId: row.promptId,
          promptVersion: Number(row.promptVersion),
          status: row.status,
          evaluatedAt: row.evaluatedAt ?? undefined,
          fixtureSetVersion: row.fixtureSetVersion ?? undefined,
          metrics: row.metricsJson ? JSON.parse(String(row.metricsJson)) : undefined,
          limitations: JSON.parse(String(row.limitationsJson)),
        });
      } catch (error) {
        throw new GenerationRunServiceError(
          'GENERATION_MODEL_SUPPORT_INVALID',
          'The persisted ModelSupportProfile is invalid.',
          { cause: error },
        );
      }
    });
  }

  upsertModelSupport(
    requestId: string,
    projectId: string,
    raw: ModelSupportProfile,
  ): Promise<ModelSupportProfile> {
    const profile = ModelSupportProfileSchema.parse(raw);
    return this.#workspace.writeProject(requestId, projectId, (database) => {
      const now = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO model_support_profiles(
             provider_id, model, task_type, prompt_id, prompt_version, status,
             evaluated_at, fixture_set_version, metrics_json, limitations_json,
             created_at, updated_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(provider_id, model, task_type, prompt_id, prompt_version)
           DO UPDATE SET
             status = excluded.status,
             evaluated_at = excluded.evaluated_at,
             fixture_set_version = excluded.fixture_set_version,
             metrics_json = excluded.metrics_json,
             limitations_json = excluded.limitations_json,
             updated_at = excluded.updated_at`,
        )
        .run(
          profile.providerId,
          profile.model,
          profile.taskType,
          profile.promptId,
          profile.promptVersion,
          profile.status,
          profile.evaluatedAt ?? null,
          profile.fixtureSetVersion ?? null,
          profile.metrics ? JSON.stringify(profile.metrics) : null,
          JSON.stringify(profile.limitations),
          now,
          now,
        );
      return profile;
    });
  }
}
