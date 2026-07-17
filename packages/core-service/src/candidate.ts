import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  CandidateCreateFixtureInputSchema,
  CandidateDiscardInputSchema,
  CandidateDocumentSchema,
  CandidateGetInputSchema,
  CandidateListSchema,
  CandidateSummarySchema,
  type CandidateBlock,
  type CandidateCreateFixtureInput,
  type CandidateDiscardInput,
  type CandidateDocument,
  type CandidateGetInput,
  type CandidateList,
  type CandidateSummary,
} from '@worldforge/contracts';

import type { DatabaseClock } from './database/index.js';
import { draftContentHash } from './draft.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export type CandidateServiceErrorCode =
  | 'CANDIDATE_NOT_FOUND'
  | 'CANDIDATE_DRAFT_NOT_FOUND'
  | 'CANDIDATE_REVISION_CONFLICT'
  | 'CANDIDATE_SOURCE_CONFLICT'
  | 'CANDIDATE_STATUS_CONFLICT'
  | 'CANDIDATE_INVALID';

export class CandidateServiceError extends Error {
  readonly code: CandidateServiceErrorCode;

  constructor(code: CandidateServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'CandidateServiceError';
    this.code = code;
  }
}

export interface CandidateServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface DraftBaseRow {
  readonly draftId: string;
  readonly revision: number | bigint;
}

interface DraftHashRow {
  readonly logicalBlockId: string;
  readonly contentHash: string | null;
}

interface CandidateSummaryRow {
  readonly candidateId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly generationRunId: string | null;
  readonly candidateType: string;
  readonly baseDraftId: string;
  readonly baseDraftRevision: number | bigint;
  readonly completeness: string;
  readonly status: string;
  readonly title: string;
  readonly sourceVersionId: string | null;
  readonly contentHash: string;
  readonly blockCount: number | bigint;
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

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function candidateHash(blocks: readonly CandidateBlock[]): string {
  return createHash('sha256')
    .update(
      stable(
        blocks.map((block) => ({
          logicalBlockId: block.logicalBlockId,
          orderKey: block.orderKey,
          blockType: block.blockType,
          text: block.text,
          attributes: block.attributes,
          beatId: block.beatId,
          sourceBlockHash: block.sourceBlockHash,
          contentHash: block.contentHash,
        })),
      ),
      'utf8',
    )
    .digest('hex');
}

function mapSummary(row: CandidateSummaryRow): CandidateSummary {
  return CandidateSummarySchema.parse({
    candidateId: row.candidateId,
    projectId: row.projectId,
    chapterId: row.chapterId,
    generationRunId: row.generationRunId,
    candidateType: row.candidateType,
    baseDraftId: row.baseDraftId,
    baseDraftRevision: Number(row.baseDraftRevision),
    completeness: row.completeness,
    status: row.status,
    title: row.title,
    sourceVersionId: row.sourceVersionId,
    contentHash: row.contentHash,
    blockCount: Number(row.blockCount),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  });
}

function mapBlock(row: CandidateBlockRow): CandidateBlock {
  return {
    candidateBlockId: row.candidateBlockId,
    logicalBlockId: row.logicalBlockId,
    orderKey: String(row.orderKey),
    blockType: row.blockType,
    text: row.text,
    attributes: JSON.parse(row.attributesJson) as CandidateBlock['attributes'],
    beatId: row.beatId,
    sourceBlockHash: row.sourceBlockHash,
    contentHash: row.contentHash,
  };
}

function summaryQuery(where: string): string {
  return `SELECT ca.id AS candidateId, p.id AS projectId, ca.chapter_id AS chapterId,
                 ca.generation_run_id AS generationRunId, ca.candidate_type AS candidateType,
                 ca.base_draft_id AS baseDraftId, ca.base_draft_revision AS baseDraftRevision,
                 ca.completeness, ca.status, ca.title, ca.source_version_id AS sourceVersionId,
                 ca.content_hash AS contentHash, ca.created_at AS createdAt,
                 ca.resolved_at AS resolvedAt,
                 (SELECT COUNT(*) FROM candidate_blocks cb WHERE cb.candidate_id = ca.id) AS blockCount
          FROM candidates ca
          JOIN chapters ch ON ch.id = ca.chapter_id
          JOIN volumes vo ON vo.id = ch.volume_id
          JOIN projects p ON p.id = vo.project_id
         WHERE ${where}`;
}

function readSummary(
  database: DatabaseSync,
  input: { readonly projectId: string; readonly chapterId: string; readonly candidateId: string },
): CandidateSummary {
  const row = database
    .prepare(summaryQuery('ca.id = ? AND ca.chapter_id = ? AND p.id = ?'))
    .get(input.candidateId, input.chapterId, input.projectId) as CandidateSummaryRow | undefined;
  if (!row) {
    throw new CandidateServiceError('CANDIDATE_NOT_FOUND', 'The Candidate was not found.');
  }
  return mapSummary(row);
}

function readBlocks(database: DatabaseSync, candidateId: string): CandidateBlock[] {
  const rows = database
    .prepare(
      `SELECT id AS candidateBlockId, logical_block_id AS logicalBlockId,
              order_key AS orderKey, block_type AS blockType, text,
              attributes_json AS attributesJson, beat_id AS beatId,
              source_block_hash AS sourceBlockHash, content_hash AS contentHash
         FROM candidate_blocks
        WHERE candidate_id = ?
        ORDER BY order_key, id`,
    )
    .all(candidateId) as unknown as CandidateBlockRow[];
  return rows.map(mapBlock);
}

function assertSourceVersion(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
  sourceVersionId: string | null,
): void {
  if (!sourceVersionId) return;
  const row = database
    .prepare(
      `SELECT 1
         FROM versions ve
         JOIN chapters ch ON ch.id = ve.chapter_id
         JOIN volumes vo ON vo.id = ch.volume_id
        WHERE ve.id = ? AND ve.chapter_id = ? AND vo.project_id = ?`,
    )
    .get(sourceVersionId, chapterId, projectId);
  if (!row) {
    throw new CandidateServiceError(
      'CANDIDATE_SOURCE_CONFLICT',
      'The source Version does not belong to the Candidate chapter and project.',
    );
  }
}

function draftBase(
  database: DatabaseSync,
  input: { readonly projectId: string; readonly chapterId: string; readonly draftId: string },
): DraftBaseRow {
  const row = database
    .prepare(
      `SELECT d.id AS draftId, d.revision AS revision
         FROM chapters ch
         JOIN volumes vo ON vo.id = ch.volume_id
         JOIN drafts d ON d.id = ch.active_draft_id
        WHERE ch.id = ? AND vo.project_id = ?
          AND ch.deleted_at IS NULL AND vo.deleted_at IS NULL`,
    )
    .get(input.chapterId, input.projectId) as DraftBaseRow | undefined;
  if (!row || row.draftId !== input.draftId) {
    throw new CandidateServiceError(
      'CANDIDATE_DRAFT_NOT_FOUND',
      'The active Draft for Candidate generation was not found.',
    );
  }
  return row;
}

export class CandidateService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: CandidateServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  createFixture(
    requestId: string,
    raw: CandidateCreateFixtureInput,
  ): Promise<CandidateDocument> {
    const input = CandidateCreateFixtureInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const base = draftBase(database, input);
      if (Number(base.revision) !== input.baseDraftRevision) {
        throw new CandidateServiceError(
          'CANDIDATE_REVISION_CONFLICT',
          'The Draft Revision changed before Candidate creation.',
        );
      }
      assertSourceVersion(
        database,
        input.projectId,
        input.chapterId,
        input.sourceVersionId ?? null,
      );

      const draftHashes = new Map(
        (
          database
            .prepare(
              `SELECT logical_block_id AS logicalBlockId, content_hash AS contentHash
                 FROM draft_blocks WHERE draft_id = ?`,
            )
            .all(input.draftId) as unknown as DraftHashRow[]
        ).map((row) => [row.logicalBlockId, row.contentHash]),
      );
      const logicalIds = new Set<string>();
      const blocks: CandidateBlock[] = input.blocks.map((block, index) => {
        const logicalBlockId = block.logicalBlockId ?? this.#idFactory();
        if (logicalIds.has(logicalBlockId)) {
          throw new CandidateServiceError(
            'CANDIDATE_INVALID',
            'Candidate logicalBlockId values must be unique.',
          );
        }
        logicalIds.add(logicalBlockId);
        const currentSourceHash = draftHashes.get(logicalBlockId);
        if (block.sourceBlockHash && currentSourceHash !== block.sourceBlockHash) {
          throw new CandidateServiceError(
            'CANDIDATE_SOURCE_CONFLICT',
            'A Candidate source block changed or belongs to another Draft.',
          );
        }
        const contentHash = draftContentHash({
          blockType: block.blockType,
          content: block.text,
          attributes: block.attributes,
        });
        return {
          candidateBlockId: this.#idFactory(),
          logicalBlockId,
          orderKey: String((index + 1) * 1024),
          blockType: block.blockType,
          text: block.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
          attributes: block.attributes,
          beatId: block.beatId ?? null,
          sourceBlockHash: block.sourceBlockHash ?? null,
          contentHash,
        };
      });

      const candidateId = this.#idFactory();
      const createdAt = this.#clock.now().toISOString();
      const contentHash = candidateHash(blocks);
      database
        .prepare(
          `INSERT INTO candidates(
             id, chapter_id, generation_run_id, candidate_type, base_draft_id,
             base_draft_revision, completeness, status, title, source_version_id,
             content_hash, created_at, resolved_at
           ) VALUES(?, ?, NULL, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, NULL)`,
        )
        .run(
          candidateId,
          input.chapterId,
          input.candidateType,
          input.draftId,
          input.baseDraftRevision,
          input.completeness,
          input.title,
          input.sourceVersionId ?? null,
          contentHash,
          createdAt,
        );

      const insertBlock = database.prepare(
        `INSERT INTO candidate_blocks(
           id, candidate_id, logical_block_id, order_key, block_type, text,
           attributes_json, beat_id, source_block_hash, content_hash
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      }

      return CandidateDocumentSchema.parse({
        candidateId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        generationRunId: null,
        candidateType: input.candidateType,
        baseDraftId: input.draftId,
        baseDraftRevision: input.baseDraftRevision,
        completeness: input.completeness,
        status: 'pending',
        title: input.title,
        sourceVersionId: input.sourceVersionId ?? null,
        contentHash,
        blockCount: blocks.length,
        createdAt,
        resolvedAt: null,
        blocks,
      });
    });
  }

  list(raw: { readonly projectId: string; readonly chapterId: string }): CandidateList {
    const input = CandidateGetInputSchema.pick({ projectId: true, chapterId: true }).parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const rows = database
        .prepare(
          `${summaryQuery('ca.chapter_id = ? AND p.id = ?')}
           ORDER BY ca.created_at DESC, ca.id DESC`,
        )
        .all(input.chapterId, input.projectId) as unknown as CandidateSummaryRow[];
      return CandidateListSchema.parse({ candidates: rows.map(mapSummary) });
    });
  }

  get(raw: CandidateGetInput): CandidateDocument {
    const input = CandidateGetInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const summary = readSummary(database, input);
      return CandidateDocumentSchema.parse({
        ...summary,
        blocks: readBlocks(database, input.candidateId),
      });
    });
  }

  discard(requestId: string, raw: CandidateDiscardInput): Promise<CandidateSummary> {
    const input = CandidateDiscardInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const current = readSummary(database, input);
      if (current.status !== 'pending') {
        throw new CandidateServiceError(
          'CANDIDATE_STATUS_CONFLICT',
          `Only pending Candidates can be discarded; found ${current.status}.`,
        );
      }
      const resolvedAt = this.#clock.now().toISOString();
      const changed = database
        .prepare(
          `UPDATE candidates
              SET status = 'discarded', resolved_at = ?
            WHERE id = ? AND chapter_id = ? AND status = 'pending'`,
        )
        .run(resolvedAt, input.candidateId, input.chapterId);
      if (Number(changed.changes) !== 1) {
        throw new CandidateServiceError(
          'CANDIDATE_STATUS_CONFLICT',
          'The Candidate status changed before discard.',
        );
      }
      return readSummary(database, input);
    });
  }
}
