import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  CandidateCreateFixtureInputSchema,
  CandidateBlockSchema,
  CandidateDiscardInputSchema,
  CandidateEditSkeletonInputSchema,
  CandidateGetInputSchema,
  CandidateListInputSchema,
  CandidateListSchema,
  CandidateSummarySchema,
  ProseCandidateDocumentSchema,
  SkeletonCandidateDocumentSchema,
  SkeletonCandidateOutputSchema,
  type CandidateBlock,
  type CandidateCreateFixtureInput,
  type CandidateDiscardInput,
  type CandidateDocument,
  type CandidateEditSkeletonInput,
  type CandidateGetInput,
  type CandidateList,
  type CandidateListInput,
  type CandidateSummary,
  type SkeletonCandidateDocument,
} from '@worldforge/contracts';
import { normalizeDraftBlockSemantic } from '@worldforge/domain';

import type { DatabaseClock } from './database/index.js';
import {
  candidateBlockContentHash,
  candidateDocumentContentHash,
  candidateSkeletonContentHash,
  candidateSkeletonPayloadHash,
} from './candidate-integrity.js';
import { draftContentHash } from './draft.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { sqliteResult } from './database/sqlite-result.js';

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
  readonly skeletonRevisionId: string | null;
  readonly skeletonRevision: number | bigint | null;
  readonly payloadSchemaVersion: number | bigint | null;
  readonly payloadHash: string | null;
  readonly sourceState: string | null;
  readonly parentSkeletonRevisionId: string | null;
  readonly editedBy: string | null;
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

interface CandidateSourceRow {
  readonly candidateBlockId: string;
  readonly sourceLogicalBlockId: string;
  readonly sourceOrder: number | bigint;
}

function summaryBase(row: CandidateSummaryRow) {
  return {
    candidateId: row.candidateId,
    projectId: row.projectId,
    chapterId: row.chapterId,
    generationRunId: row.generationRunId,
    baseDraftId: row.baseDraftId,
    baseDraftRevision: Number(row.baseDraftRevision),
    completeness: row.completeness,
    status: row.status,
    title: row.title,
    sourceVersionId: row.sourceVersionId,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

function mapSummary(row: CandidateSummaryRow): CandidateSummary {
  const base = summaryBase(row);
  return row.candidateType === 'skeleton'
    ? CandidateSummarySchema.parse({
        ...base,
        candidateType: 'skeleton',
        blockCount: 0,
        skeletonRevisionId: row.skeletonRevisionId,
        skeletonRevision: row.skeletonRevision === null ? null : Number(row.skeletonRevision),
        payloadSchemaVersion:
          row.payloadSchemaVersion === null ? null : Number(row.payloadSchemaVersion),
        payloadHash: row.payloadHash,
        sourceState: row.sourceState,
        parentSkeletonRevisionId: row.parentSkeletonRevisionId,
        editedBy: row.editedBy,
      })
    : CandidateSummarySchema.parse({
        ...base,
        candidateType: row.candidateType,
        blockCount: Number(row.blockCount),
      });
}

function mapBlock(
  row: CandidateBlockRow,
  sourceLogicalBlockIds: readonly string[],
): CandidateBlock {
  try {
    const block = CandidateBlockSchema.parse({
      candidateBlockId: row.candidateBlockId,
      logicalBlockId: row.logicalBlockId,
      sourceLogicalBlockIds: [...sourceLogicalBlockIds],
      orderKey: String(row.orderKey),
      blockType: row.blockType,
      text: row.text,
      attributes: JSON.parse(row.attributesJson),
      beatId: row.beatId,
      sourceBlockHash: row.sourceBlockHash,
      contentHash: row.contentHash,
    });
    if (candidateBlockContentHash(block) !== block.contentHash) {
      throw new CandidateServiceError(
        'CANDIDATE_INVALID',
        'A persisted CandidateBlock content hash does not match its content.',
      );
    }
    return block;
  } catch (error) {
    if (error instanceof CandidateServiceError) throw error;
    throw new CandidateServiceError('CANDIDATE_INVALID', 'A persisted CandidateBlock is invalid.', {
      cause: error,
    });
  }
}

function summaryQuery(where: string): string {
  return `SELECT ca.id AS candidateId, p.id AS projectId, ca.chapter_id AS chapterId,
                 ca.generation_run_id AS generationRunId, ca.candidate_type AS candidateType,
                 ca.base_draft_id AS baseDraftId, ca.base_draft_revision AS baseDraftRevision,
                 ca.completeness, ca.status, ca.title, ca.source_version_id AS sourceVersionId,
                 ca.content_hash AS contentHash, ca.created_at AS createdAt,
                 ca.resolved_at AS resolvedAt,
                 (SELECT COUNT(*) FROM candidate_blocks cb WHERE cb.candidate_id = ca.id) AS blockCount,
                 skeleton.id AS skeletonRevisionId,
                 skeleton.revision AS skeletonRevision,
                 skeleton.payload_schema_version AS payloadSchemaVersion,
                 skeleton.payload_hash AS payloadHash,
                 skeleton.parent_revision_id AS parentSkeletonRevisionId,
                 skeleton.edited_by AS editedBy,
                 CASE
                   WHEN ca.candidate_type <> 'skeleton' THEN NULL
                   WHEN base.revision <> ca.base_draft_revision THEN 'stale'
                   WHEN EXISTS (
                     SELECT 1 FROM scene_beats beat
                      WHERE beat.chapter_id = ca.chapter_id
                        AND beat.updated_at > skeleton.created_at
                   ) THEN 'stale'
                   ELSE 'current'
                 END AS sourceState
          FROM candidates ca
          JOIN chapters ch ON ch.id = ca.chapter_id
          JOIN volumes vo ON vo.id = ch.volume_id
          JOIN projects p ON p.id = vo.project_id
          JOIN drafts base ON base.id = ca.base_draft_id
          LEFT JOIN candidate_skeleton_revisions skeleton
            ON skeleton.id = (
              SELECT revision.id
                FROM candidate_skeleton_revisions revision
               WHERE revision.candidate_id = ca.id
               ORDER BY revision.revision DESC, revision.id DESC
               LIMIT 1
            )
         WHERE ${where}`;
}

function readSummary(
  database: DatabaseSync,
  input: { readonly projectId: string; readonly chapterId: string; readonly candidateId: string },
): CandidateSummary {
  const row = database
    .prepare(summaryQuery('ca.id = ? AND ca.chapter_id = ? AND p.id = ?'))
    .get(input.candidateId, input.chapterId, input.projectId) as CandidateSummaryRow | undefined;
  if (!row) throw new CandidateServiceError('CANDIDATE_NOT_FOUND', 'The Candidate was not found.');
  return mapSummary(row);
}

function readBlocks(database: DatabaseSync, candidateId: string): CandidateBlock[] {
  const sourceRows = sqliteResult<CandidateSourceRow[]>(
    database
      .prepare(
        `SELECT cbs.candidate_block_id AS candidateBlockId,
              cbs.source_logical_block_id AS sourceLogicalBlockId,
              cbs.source_order AS sourceOrder
         FROM candidate_block_sources cbs
         JOIN candidate_blocks cb ON cb.id = cbs.candidate_block_id
        WHERE cb.candidate_id = ?
        ORDER BY cbs.candidate_block_id, cbs.source_order`,
      )
      .all(candidateId),
  );
  const sources = new Map<string, string[]>();
  for (const row of sourceRows) {
    const values = sources.get(row.candidateBlockId) ?? [];
    values.push(row.sourceLogicalBlockId);
    sources.set(row.candidateBlockId, values);
  }
  const rows = sqliteResult<CandidateBlockRow[]>(
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
      .all(candidateId),
  );
  return rows.map((row) => mapBlock(row, sources.get(row.candidateBlockId) ?? []));
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

  createFixture(requestId: string, raw: CandidateCreateFixtureInput): Promise<CandidateDocument> {
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
        sqliteResult<DraftHashRow[]>(
          database
            .prepare(
              `SELECT logical_block_id AS logicalBlockId, content_hash AS contentHash
                 FROM draft_blocks WHERE draft_id = ?`,
            )
            .all(input.draftId),
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
        const sourceLogicalBlockIds = [
          ...new Set(
            block.sourceLogicalBlockIds ??
              (draftHashes.has(logicalBlockId) ? [logicalBlockId] : []),
          ),
        ];
        for (const sourceLogicalBlockId of sourceLogicalBlockIds) {
          if (!draftHashes.has(sourceLogicalBlockId)) {
            throw new CandidateServiceError(
              'CANDIDATE_SOURCE_CONFLICT',
              'A Candidate source block belongs to another Draft or no longer exists.',
            );
          }
        }
        if (block.sourceBlockHash) {
          if (
            sourceLogicalBlockIds.length !== 1 ||
            draftHashes.get(sourceLogicalBlockIds[0] ?? '') !== block.sourceBlockHash
          ) {
            throw new CandidateServiceError(
              'CANDIDATE_SOURCE_CONFLICT',
              'A Candidate source block changed or belongs to another Draft.',
            );
          }
        }
        const normalized = normalizeDraftBlockSemantic({
          blockType: block.blockType,
          content: block.text,
          attributes: block.attributes,
        });
        return CandidateBlockSchema.parse({
          candidateBlockId: this.#idFactory(),
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

      const candidateId = this.#idFactory();
      const createdAt = this.#clock.now().toISOString();
      const contentHash = candidateDocumentContentHash(blocks);
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
        block.sourceLogicalBlockIds.forEach((sourceLogicalBlockId, sourceOrder) => {
          insertSource.run(block.candidateBlockId, sourceLogicalBlockId, sourceOrder);
        });
      }

      return ProseCandidateDocumentSchema.parse({
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

  list(raw: CandidateListInput): CandidateList {
    const input = CandidateListInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const statement = input.chapterId
        ? database.prepare(
            `${summaryQuery('ca.chapter_id = ? AND p.id = ?')}
             ORDER BY ca.created_at DESC, ca.id DESC`,
          )
        : database.prepare(
            `${summaryQuery('p.id = ?')}
             ORDER BY ca.created_at DESC, ca.id DESC`,
          );
      const rows = sqliteResult<CandidateSummaryRow[]>(
        input.chapterId
          ? statement.all(input.chapterId, input.projectId)
          : statement.all(input.projectId),
      );
      return CandidateListSchema.parse({ candidates: rows.map(mapSummary) });
    });
  }

  get(raw: CandidateGetInput): CandidateDocument {
    const input = CandidateGetInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const summary = readSummary(database, input);
      if (summary.candidateType === 'skeleton') {
        const row = database
          .prepare(
            `SELECT structured_payload_json AS structuredPayloadJson
               FROM candidate_skeleton_revisions
              WHERE id = ? AND candidate_id = ?`,
          )
          .get(summary.skeletonRevisionId, summary.candidateId) as
          { readonly structuredPayloadJson: string } | undefined;
        if (!row) {
          throw new CandidateServiceError(
            'CANDIDATE_INVALID',
            'The current Skeleton revision is missing.',
          );
        }
        try {
          const structuredPayload = SkeletonCandidateOutputSchema.parse(
            JSON.parse(row.structuredPayloadJson),
          );
          const payloadHash = candidateSkeletonPayloadHash(structuredPayload);
          if (
            payloadHash !== summary.payloadHash ||
            candidateSkeletonContentHash(summary.payloadSchemaVersion, payloadHash) !==
              summary.contentHash
          ) {
            throw new CandidateServiceError(
              'CANDIDATE_INVALID',
              'The persisted Skeleton payload hash does not match its content.',
            );
          }
          return SkeletonCandidateDocumentSchema.parse({
            ...summary,
            structuredPayload,
          });
        } catch (error) {
          if (error instanceof CandidateServiceError) throw error;
          throw new CandidateServiceError(
            'CANDIDATE_INVALID',
            'The persisted Skeleton Candidate is invalid.',
            { cause: error },
          );
        }
      }
      const blocks = readBlocks(database, input.candidateId);
      if (candidateDocumentContentHash(blocks) !== summary.contentHash) {
        throw new CandidateServiceError(
          'CANDIDATE_INVALID',
          'The persisted Candidate content hash does not match its blocks.',
        );
      }
      try {
        return ProseCandidateDocumentSchema.parse({ ...summary, blocks });
      } catch (error) {
        throw new CandidateServiceError(
          'CANDIDATE_INVALID',
          'The persisted Candidate is invalid.',
          {
            cause: error,
          },
        );
      }
    });
  }

  editSkeleton(
    requestId: string,
    raw: CandidateEditSkeletonInput,
  ): Promise<SkeletonCandidateDocument> {
    const input = CandidateEditSkeletonInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const current = readSummary(database, input);
      if (current.candidateType !== 'skeleton') {
        throw new CandidateServiceError(
          'CANDIDATE_INVALID',
          'Only Skeleton Candidates can create Skeleton revisions.',
        );
      }
      if (current.status !== 'pending') {
        throw new CandidateServiceError(
          'CANDIDATE_STATUS_CONFLICT',
          'Only pending Skeleton Candidates can be edited.',
        );
      }
      if (current.skeletonRevisionId !== input.expectedSkeletonRevisionId) {
        throw new CandidateServiceError(
          'CANDIDATE_REVISION_CONFLICT',
          'The Skeleton changed before this edit was saved.',
        );
      }
      const source = database
        .prepare(
          `SELECT source_fingerprint AS sourceFingerprint
             FROM candidate_skeleton_revisions
            WHERE id = ? AND candidate_id = ?`,
        )
        .get(current.skeletonRevisionId, current.candidateId) as
        { readonly sourceFingerprint: string } | undefined;
      if (!source) {
        throw new CandidateServiceError(
          'CANDIDATE_INVALID',
          'The current Skeleton revision source is missing.',
        );
      }
      const structuredPayload = SkeletonCandidateOutputSchema.parse(input.structuredPayload);
      const payloadSchemaVersion = 1;
      const payloadHash = candidateSkeletonPayloadHash(structuredPayload);
      const contentHash = candidateSkeletonContentHash(payloadSchemaVersion, payloadHash);
      const revisionId = this.#idFactory();
      const createdAt = this.#clock.now().toISOString();
      database
        .prepare(
          `INSERT INTO candidate_skeleton_revisions(
             id, candidate_id, revision, parent_revision_id, payload_schema_version,
             structured_payload_json, payload_hash, source_fingerprint, edited_by, created_at
           ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'author', ?)`,
        )
        .run(
          revisionId,
          current.candidateId,
          current.skeletonRevision + 1,
          current.skeletonRevisionId,
          payloadSchemaVersion,
          JSON.stringify(structuredPayload),
          payloadHash,
          source.sourceFingerprint,
          createdAt,
        );
      const changed = database
        .prepare(
          `UPDATE candidates SET content_hash = ?
            WHERE id = ? AND status = 'pending' AND content_hash = ?`,
        )
        .run(contentHash, current.candidateId, current.contentHash);
      if (Number(changed.changes) !== 1) {
        throw new CandidateServiceError(
          'CANDIDATE_REVISION_CONFLICT',
          'The Skeleton changed before this edit was committed.',
        );
      }
      return SkeletonCandidateDocumentSchema.parse({
        ...readSummary(database, input),
        structuredPayload,
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
