import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  CandidateApplyRecordSchema,
  CandidateCheckpointSchema,
  CandidateConflictSetSchema,
  CandidateDocumentSchema,
  CandidateSelectionSchema,
  DraftBlockAttributesSchema,
  DraftBlockSchema,
  DraftDocumentSchema,
  type CandidateApplyRecord,
  type CandidateBlock,
  type CandidateCheckpoint,
  type CandidateConflictItem,
  type CandidateConflictSet,
  type CandidateDocument,
  type CandidatePreviewInput,
  type CandidateSelection,
  type DraftBlock,
  type DraftDocument,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import { draftContentHash } from './draft.js';

export type CandidateApplyServiceErrorCode =
  'CANDIDATE_APPLY_NOT_FOUND' | 'CANDIDATE_APPLY_INVALID' | 'CANDIDATE_APPLY_INVARIANT';

export class CandidateApplyServiceError extends Error {
  readonly code: CandidateApplyServiceErrorCode;

  constructor(code: CandidateApplyServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CandidateApplyServiceError';
    this.code = code;
  }
}

export interface CandidateApplyServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (stage: 'after-checkpoint' | 'after-draft-persist') => void;
}

export interface DraftRow {
  readonly draftId: string;
  readonly revision: number | bigint;
  readonly status: string;
}

interface DraftBlockRow {
  readonly recordId: string;
  readonly logicalBlockId: string;
  readonly orderKey: number | bigint;
  readonly blockType: DraftBlock['blockType'];
  readonly text: string;
  readonly attributesJson: string;
  readonly source: DraftBlock['source'];
  readonly locked: number | bigint;
  readonly contentHash: string | null;
  readonly revision: number | bigint;
}

interface CandidateRow {
  readonly candidateId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly generationRunId: string | null;
  readonly candidateType: CandidateDocument['candidateType'];
  readonly baseDraftId: string;
  readonly baseDraftRevision: number | bigint;
  readonly completeness: CandidateDocument['completeness'];
  readonly status: CandidateDocument['status'];
  readonly title: string;
  readonly sourceVersionId: string | null;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly resolvedAt: string | null;
}

interface CandidateBlockRow {
  readonly candidateBlockId: string;
  readonly logicalBlockId: string;
  readonly orderKey: number | bigint;
  readonly blockType: CandidateBlock['blockType'];
  readonly text: string;
  readonly attributesJson: string;
  readonly beatId: string | null;
  readonly sourceBlockHash: string | null;
  readonly contentHash: string;
}

interface SourceRow {
  readonly candidateBlockId: string;
  readonly sourceLogicalBlockId: string;
  readonly sourceOrder: number | bigint;
}

export interface CheckpointRow {
  readonly checkpointId: string;
  readonly candidateId: string;
  readonly draftId: string;
  readonly sourceRevision: number | bigint;
  readonly blocksJson: string;
  readonly contentHash: string;
  readonly createdAt: string;
}

export interface ApplyRecordRow {
  readonly applyRecordId: string;
  readonly requestId: string;
  readonly candidateId: string;
  readonly draftId: string;
  readonly checkpointId: string;
  readonly baseRevision: number | bigint;
  readonly committedRevision: number | bigint;
  readonly selectionJson: string;
  readonly operationsJson: string;
  readonly inverseOperationsJson: string;
  readonly appliedBlocksJson: string;
  readonly status: 'applied' | 'undone';
  readonly appliedAt: string;
  readonly undoneRevision: number | bigint | null;
  readonly undoneAt: string | null;
}

export interface MutableDraftBlock extends DraftBlock {
  readonly recordId: string;
  readonly revision: number;
}

export function persistedNumber(value: number | bigint): number {
  const result = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_INVARIANT',
      'A persisted revision or order value is outside the safe integer range.',
    );
  }
  return result;
}

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function snapshotHash(blocks: readonly DraftBlock[]): string {
  return createHash('sha256').update(stable(blocks), 'utf8').digest('hex');
}

function parseAttributes(value: string): DraftBlock['attributes'] {
  try {
    return DraftBlockAttributesSchema.parse(JSON.parse(value));
  } catch (error) {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_INVARIANT',
      'Persisted block attributes are invalid.',
      { cause: error },
    );
  }
}

export function activeDraft(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  expectedDraftId?: string,
): DraftRow {
  const row = database
    .prepare(
      `SELECT d.id AS draftId, d.revision, d.status
         FROM chapters ch
         JOIN volumes vo ON vo.id = ch.volume_id
         JOIN drafts d ON d.id = ch.active_draft_id
        WHERE ch.id = ? AND vo.project_id = ?
          AND ch.deleted_at IS NULL AND vo.deleted_at IS NULL`,
    )
    .get(chapterId, projectId) as DraftRow | undefined;
  if (!row || (expectedDraftId && row.draftId !== expectedDraftId) || row.status !== 'active') {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_NOT_FOUND',
      'The active Draft for Candidate review was not found.',
    );
  }
  return row;
}

export function readDraftBlocks(database: DatabaseSync, draftId: string): MutableDraftBlock[] {
  const rows = database
    .prepare(
      `SELECT id AS recordId, logical_block_id AS logicalBlockId, order_key AS orderKey,
              block_type AS blockType, text, attributes_json AS attributesJson,
              source, locked, content_hash AS contentHash, revision
         FROM draft_blocks
        WHERE draft_id = ?
        ORDER BY order_key, id`,
    )
    .all(draftId) as unknown as DraftBlockRow[];
  return rows.map((row, index) => {
    const attributes = parseAttributes(row.attributesJson);
    const contentHash =
      row.contentHash ??
      draftContentHash({ blockType: row.blockType, content: row.text, attributes });
    return {
      recordId: row.recordId,
      logicalBlockId: row.logicalBlockId,
      orderKey: String((index + 1) * 1024),
      blockType: row.blockType,
      text: row.text,
      attributes,
      source: row.source,
      locked: persistedNumber(row.locked) === 1,
      contentHash,
      revision: persistedNumber(row.revision),
    };
  });
}

export function draftDocument(
  projectId: string,
  chapterId: string,
  draft: DraftRow,
  blocks: readonly MutableDraftBlock[],
): DraftDocument {
  return DraftDocumentSchema.parse({
    projectId,
    chapterId,
    draftId: draft.draftId,
    status: 'active',
    revision: persistedNumber(draft.revision),
    blocks: blocks.map(({ recordId: _recordId, revision: _revision, ...block }) => block),
  });
}

function candidateRow(database: DatabaseSync, input: CandidatePreviewInput): CandidateRow {
  const row = database
    .prepare(
      `SELECT ca.id AS candidateId, p.id AS projectId, ca.chapter_id AS chapterId,
              ca.generation_run_id AS generationRunId, ca.candidate_type AS candidateType,
              ca.base_draft_id AS baseDraftId, ca.base_draft_revision AS baseDraftRevision,
              ca.completeness, ca.status, ca.title, ca.source_version_id AS sourceVersionId,
              ca.content_hash AS contentHash, ca.created_at AS createdAt,
              ca.resolved_at AS resolvedAt
         FROM candidates ca
         JOIN chapters ch ON ch.id = ca.chapter_id
         JOIN volumes vo ON vo.id = ch.volume_id
         JOIN projects p ON p.id = vo.project_id
        WHERE ca.id = ? AND ca.chapter_id = ? AND p.id = ?`,
    )
    .get(input.candidateId, input.chapterId, input.projectId) as CandidateRow | undefined;
  if (!row) {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_NOT_FOUND',
      'The Candidate for review was not found.',
    );
  }
  return row;
}

export function readCandidateDocument(
  database: DatabaseSync,
  input: CandidatePreviewInput,
): CandidateDocument {
  const row = candidateRow(database, input);
  const sourceRows = database
    .prepare(
      `SELECT candidate_block_id AS candidateBlockId,
              source_logical_block_id AS sourceLogicalBlockId,
              source_order AS sourceOrder
         FROM candidate_block_sources
        WHERE candidate_block_id IN (
          SELECT id FROM candidate_blocks WHERE candidate_id = ?
        )
        ORDER BY candidate_block_id, source_order`,
    )
    .all(input.candidateId) as unknown as SourceRow[];
  const sources = new Map<string, string[]>();
  for (const source of sourceRows) {
    const list = sources.get(source.candidateBlockId) ?? [];
    list.push(source.sourceLogicalBlockId);
    sources.set(source.candidateBlockId, list);
  }
  const blocks = (
    database
      .prepare(
        `SELECT id AS candidateBlockId, logical_block_id AS logicalBlockId,
                order_key AS orderKey, block_type AS blockType, text,
                attributes_json AS attributesJson, beat_id AS beatId,
                source_block_hash AS sourceBlockHash, content_hash AS contentHash
           FROM candidate_blocks
          WHERE candidate_id = ?
          ORDER BY order_key, id`,
      )
      .all(input.candidateId) as unknown as CandidateBlockRow[]
  ).map((block) => ({
    candidateBlockId: block.candidateBlockId,
    logicalBlockId: block.logicalBlockId,
    sourceLogicalBlockIds: sources.get(block.candidateBlockId),
    orderKey: String(block.orderKey),
    blockType: block.blockType,
    text: block.text,
    attributes: parseAttributes(block.attributesJson),
    beatId: block.beatId,
    sourceBlockHash: block.sourceBlockHash,
    contentHash: block.contentHash,
  }));
  return CandidateDocumentSchema.parse({
    candidateId: row.candidateId,
    projectId: row.projectId,
    chapterId: row.chapterId,
    generationRunId: row.generationRunId,
    candidateType: row.candidateType,
    baseDraftId: row.baseDraftId,
    baseDraftRevision: persistedNumber(row.baseDraftRevision),
    completeness: row.completeness,
    status: row.status,
    title: row.title,
    sourceVersionId: row.sourceVersionId,
    contentHash: row.contentHash,
    blockCount: blocks.length,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    blocks,
  });
}

export function persistConflictSet(
  database: DatabaseSync,
  idFactory: () => string,
  timestamp: string,
  input: {
    readonly candidateId: string;
    readonly draftId: string;
    readonly applyRecordId?: string | null;
    readonly phase: 'apply' | 'undo';
    readonly attemptedRevision: number;
    readonly currentRevision: number;
    readonly conflicts: readonly CandidateConflictItem[];
  },
): CandidateConflictSet {
  const conflictSet = CandidateConflictSetSchema.parse({
    conflictSetId: idFactory(),
    candidateId: input.candidateId,
    draftId: input.draftId,
    applyRecordId: input.applyRecordId ?? null,
    phase: input.phase,
    attemptedRevision: input.attemptedRevision,
    currentRevision: input.currentRevision,
    conflicts: input.conflicts,
    createdAt: timestamp,
    resolvedAt: null,
  });
  database
    .prepare(
      `INSERT INTO candidate_conflict_sets(
         id, candidate_id, draft_id, apply_record_id, phase, attempted_revision,
         current_revision, conflicts_json, created_at, resolved_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      conflictSet.conflictSetId,
      conflictSet.candidateId,
      conflictSet.draftId,
      conflictSet.applyRecordId,
      conflictSet.phase,
      conflictSet.attemptedRevision,
      conflictSet.currentRevision,
      JSON.stringify(conflictSet.conflicts),
      conflictSet.createdAt,
    );
  return conflictSet;
}

export function persistBlocks(
  database: DatabaseSync,
  draftId: string,
  before: readonly MutableDraftBlock[],
  after: readonly MutableDraftBlock[],
): void {
  const afterIds = new Set(after.map((block) => block.logicalBlockId));
  const remove = database.prepare(
    'DELETE FROM draft_blocks WHERE draft_id = ? AND logical_block_id = ?',
  );
  for (const block of before) {
    if (!afterIds.has(block.logicalBlockId)) remove.run(draftId, block.logicalBlockId);
  }
  const beforeIds = new Set(before.map((block) => block.logicalBlockId));
  const insert = database.prepare(
    `INSERT INTO draft_blocks(
       id, draft_id, logical_block_id, order_key, block_type, text, attributes_json,
       source, locked, content_hash, revision
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const update = database.prepare(
    `UPDATE draft_blocks
        SET order_key = ?, block_type = ?, text = ?, attributes_json = ?, source = ?,
            locked = ?, content_hash = ?, revision = ?
      WHERE draft_id = ? AND logical_block_id = ?`,
  );
  for (const [index, block] of after.entries()) {
    const values = [
      BigInt(index + 1) * 1024n,
      block.blockType,
      block.text,
      JSON.stringify(block.attributes),
      block.source,
      block.locked ? 1 : 0,
      block.contentHash,
      block.revision,
    ] as const;
    if (beforeIds.has(block.logicalBlockId)) {
      const result = update.run(...values, draftId, block.logicalBlockId);
      if (persistedNumber(result.changes) !== 1) {
        throw new CandidateApplyServiceError(
          'CANDIDATE_APPLY_INVARIANT',
          'A retained DraftBlock could not be updated.',
        );
      }
    } else {
      insert.run(block.recordId, draftId, block.logicalBlockId, ...values);
    }
  }
}

export function auditBlocks(
  blocks: readonly MutableDraftBlock[],
): readonly Record<string, unknown>[] {
  return blocks.map(({ recordId, revision, ...block }, index) => ({
    recordId,
    ...block,
    orderKey: String((index + 1) * 1024),
    revision,
  }));
}

export function draftOperations(
  before: readonly MutableDraftBlock[],
  after: readonly MutableDraftBlock[],
) {
  const beforeById = new Map(before.map((block) => [block.logicalBlockId, block]));
  const afterById = new Map(after.map((block) => [block.logicalBlockId, block]));
  const result: Record<string, unknown>[] = [];
  for (const block of before) {
    if (!afterById.has(block.logicalBlockId)) {
      result.push({
        type: 'delete',
        logicalBlockId: block.logicalBlockId,
        expectedHash: block.contentHash,
      });
    }
  }
  for (const [index, block] of after.entries()) {
    const previous = beforeById.get(block.logicalBlockId);
    if (!previous) {
      result.push({
        type: 'insert',
        logicalBlockId: block.logicalBlockId,
        afterLogicalBlockId: after[index - 1]?.logicalBlockId ?? null,
        blockType: block.blockType,
        content: block.text,
        attributes: block.attributes,
      });
      continue;
    }
    if (previous.contentHash !== block.contentHash) {
      result.push({
        type: 'update',
        logicalBlockId: block.logicalBlockId,
        expectedHash: previous.contentHash,
        blockType: block.blockType,
        content: block.text,
        attributes: block.attributes,
      });
    }
    const oldIndex = before.findIndex((item) => item.logicalBlockId === block.logicalBlockId);
    if (oldIndex !== index) {
      result.push({
        type: 'move',
        logicalBlockId: block.logicalBlockId,
        expectedHash: previous.contentHash,
        afterLogicalBlockId: after[index - 1]?.logicalBlockId ?? null,
      });
    }
  }
  return result;
}

function checkpointFrom(row: CheckpointRow): CandidateCheckpoint {
  return CandidateCheckpointSchema.parse({
    checkpointId: row.checkpointId,
    candidateId: row.candidateId,
    draftId: row.draftId,
    sourceRevision: persistedNumber(row.sourceRevision),
    contentHash: row.contentHash,
    createdAt: row.createdAt,
  });
}

function recordFrom(row: ApplyRecordRow): CandidateApplyRecord {
  return CandidateApplyRecordSchema.parse({
    applyRecordId: row.applyRecordId,
    requestId: row.requestId,
    candidateId: row.candidateId,
    draftId: row.draftId,
    checkpointId: row.checkpointId,
    baseRevision: persistedNumber(row.baseRevision),
    committedRevision: persistedNumber(row.committedRevision),
    selection: CandidateSelectionSchema.parse(JSON.parse(row.selectionJson)),
    status: row.status,
    appliedAt: row.appliedAt,
    undoneRevision: row.undoneRevision === null ? null : persistedNumber(row.undoneRevision),
    undoneAt: row.undoneAt,
  });
}

export function readApplyRecord(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  applyRecordId: string,
) {
  const row = database
    .prepare(
      `SELECT ar.id AS applyRecordId, ar.request_id AS requestId,
              ar.candidate_id AS candidateId, ar.draft_id AS draftId,
              ar.checkpoint_id AS checkpointId, ar.base_revision AS baseRevision,
              ar.committed_revision AS committedRevision, ar.selection_json AS selectionJson,
              ar.operations_json AS operationsJson, ar.inverse_operations_json AS inverseOperationsJson,
              ar.applied_blocks_json AS appliedBlocksJson, ar.status, ar.applied_at AS appliedAt,
              ar.undone_revision AS undoneRevision, ar.undone_at AS undoneAt
         FROM candidate_apply_records ar
         JOIN candidates ca ON ca.id = ar.candidate_id
         JOIN chapters ch ON ch.id = ca.chapter_id
         JOIN volumes vo ON vo.id = ch.volume_id
        WHERE ar.id = ? AND ch.id = ? AND vo.project_id = ?`,
    )
    .get(applyRecordId, chapterId, projectId) as ApplyRecordRow | undefined;
  if (!row) {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_NOT_FOUND',
      'The Candidate ApplyRecord was not found.',
    );
  }
  const checkpoint = database
    .prepare(
      `SELECT id AS checkpointId, candidate_id AS candidateId, draft_id AS draftId,
              source_revision AS sourceRevision, blocks_json AS blocksJson,
              content_hash AS contentHash, created_at AS createdAt
         FROM candidate_apply_checkpoints WHERE id = ?`,
    )
    .get(row.checkpointId) as CheckpointRow | undefined;
  if (!checkpoint) {
    throw new CandidateApplyServiceError(
      'CANDIDATE_APPLY_INVARIANT',
      'The Candidate ApplyRecord checkpoint is missing.',
    );
  }
  return {
    row,
    record: recordFrom(row),
    checkpoint,
    checkpointSummary: checkpointFrom(checkpoint),
  };
}

export function mutableFromSnapshot(raw: string, committedRevision: number): MutableDraftBlock[] {
  const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
  return parsed.map((item, index) => {
    const block = DraftBlockSchema.parse({
      logicalBlockId: item.logicalBlockId,
      orderKey: String((index + 1) * 1024),
      blockType: item.blockType,
      text: item.text,
      attributes: item.attributes,
      source: item.source,
      locked: item.locked,
      contentHash: item.contentHash,
    });
    return {
      ...block,
      recordId: String(item.recordId),
      revision: committedRevision,
    };
  });
}
