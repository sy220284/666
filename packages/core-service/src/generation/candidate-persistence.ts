import {
  candidateDocumentContentHash,
  candidateSkeletonContentHash,
  candidateSkeletonPayloadHash,
} from '../candidate-integrity.js';
import { draftContentHash } from '../draft.js';
import {
  assertActive,
  type DraftBaseRow,
  type DraftHashRow,
  type GenerationCompletion,
  type GenerationProseCandidateInput,
  type GenerationRunIdentity,
  type GenerationRunServiceContext,
  GenerationRunServiceError,
  type GenerationSkeletonCandidateInput,
  type GenerationSkeletonCompletion,
  type GenerationSkeletonCompletionInput,
  readRun,
} from './run-repository.js';
import {
  type CandidateBlock,
  CandidateBlockSchema,
  CandidateCreateFixtureInputSchema,
  type CandidateDocument,
  CandidateDocumentSchema,
  type CandidateType,
  type GenerationRun,
  type GenerationRunType,
  type SkeletonCandidateDocument,
  SkeletonCandidateDocumentSchema,
  SkeletonCandidateOutputSchema,
} from '@worldforge/contracts';
import { normalizeDraftBlockSemantic } from '@worldforge/domain';
import { type DatabaseSync } from 'node:sqlite';
import { sqliteResult } from '../database/sqlite-result.js';

export function verifyDraftBase(database: DatabaseSync, run: GenerationRun): DraftBaseRow {
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

export function insertProseCandidate(
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
    sqliteResult<DraftHashRow[]>(
      database
        .prepare(
          `SELECT logical_block_id AS logicalBlockId, content_hash AS contentHash
             FROM draft_blocks WHERE draft_id = ?`,
        )
        .all(run.baseDraftId),
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
  const insertBlock = database.prepare(`INSERT INTO candidate_blocks(
       id, candidate_id, logical_block_id, order_key, block_type, text,
       attributes_json, beat_id, source_block_hash, content_hash
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const insertSource = database.prepare(`INSERT INTO candidate_block_sources(
       candidate_block_id, source_logical_block_id, source_order
     ) VALUES(?, ?, ?)`);
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
  const insertMapping = database.prepare(`INSERT INTO candidate_source_mappings(
       candidate_id, mapping_type, source_unit_id, source_order,
       source_candidate_id, scene_beat_id, source_block_ids_json,
       keep_current_draft, range_anchor_json, created_at
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
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

export function insertSkeletonCandidate(
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
    .get(run.runId) as
    | {
        readonly constraintHash: string;
      }
    | undefined;
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

export function candidateTypeForPartial(
  runType: GenerationRunType,
): Exclude<CandidateType, 'skeleton'> {
  if (runType === 'chapter') return 'full';
  if (runType === 'rewrite') return 'rewrite';
  if (runType === 'merge') return 'merge';
  throw new GenerationRunServiceError(
    'GENERATION_CANDIDATE_INVALID',
    'This GenerationRun cannot save prose partial output.',
  );
}

export function completeProseCandidate(
  context: GenerationRunServiceContext,
  requestId: string,
  input: GenerationProseCandidateInput,
): Promise<GenerationCompletion> {
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    const now = context.clock.now().toISOString();
    const candidate = insertProseCandidate(database, run, input, context.idFactory, now);
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

export function completeSkeletonCandidates(
  context: GenerationRunServiceContext,
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
  return context.workspace.writeProject(requestId, input.projectId, (database) => {
    const run = readRun(database, input);
    assertActive(run);
    if (run.runType !== 'skeleton') {
      throw new GenerationRunServiceError(
        'GENERATION_CANDIDATE_INVALID',
        'This GenerationRun cannot save Skeleton Candidates.',
      );
    }
    const now = context.clock.now().toISOString();
    const candidates = input.candidates.map((candidate) =>
      insertSkeletonCandidate(database, run, candidate, context.idFactory, now),
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
