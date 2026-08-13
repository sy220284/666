import { createHash, randomUUID } from 'node:crypto';

import {
  DraftDocumentSchema,
  VersionChapterInputSchema,
  VersionCreateInputSchema,
  VersionDocumentSchema,
  VersionGetInputSchema,
  VersionListSchema,
  VersionRestoreInputSchema,
  VersionSetFinalInputSchema,
  VersionSummarySchema,
  type DraftBlock,
  type DraftDocument,
  type VersionBlock,
  type VersionCreateInput,
  type VersionDocument,
  type VersionGetInput,
  type VersionList,
  type VersionRestoreInput,
  type VersionSetFinalInput,
  type VersionSummary,
  type VersionType,
} from '@worldforge/contracts';

import { readActiveChapterScope, readActiveDraftScope } from './active-structure.js';
import type { DatabaseClock } from './database/index.js';
import type { ProjectWorkspaceService } from './project-workspace.js';
import { stableJson } from './stable-json.js';
import { sqliteResult } from './database/sqlite-result.js';

const systemClock: DatabaseClock = { now: () => new Date() };

type ParsedVersionCreateInput = ReturnType<typeof VersionCreateInputSchema.parse>;
type ProjectDatabase = Parameters<Parameters<ProjectWorkspaceService['readProject']>[1]>[0];

export type VersionServiceErrorCode =
  | 'VERSION_NOT_FOUND'
  | 'VERSION_TITLE_CONFLICT'
  | 'VERSION_DRAFT_NOT_FOUND'
  | 'VERSION_REVISION_CONFLICT'
  | 'VERSION_CHAPTER_MISMATCH'
  | 'VERSION_PARENT_CONFLICT'
  | 'VERSION_CANDIDATE_CONFLICT';

export class VersionServiceError extends Error {
  readonly code: VersionServiceErrorCode;

  constructor(code: VersionServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'VersionServiceError';
    this.code = code;
  }
}

export interface VersionServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

interface DraftRow {
  readonly draftId: string;
  readonly revision: number | bigint;
}

interface BlockRow {
  readonly logicalBlockId: string;
  readonly orderKey: number | bigint;
  readonly blockType: DraftBlock['blockType'];
  readonly text: string;
  readonly attributesJson: string;
  readonly source: DraftBlock['source'];
  readonly locked: number | bigint;
  readonly contentHash: string | null;
}

interface VersionRow {
  readonly versionId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceDraftId: string;
  readonly sourceRevision: number | bigint;
  readonly versionType: string;
  readonly parentVersionId: string | null;
  readonly sourceCandidateId: string | null;
  readonly title: string;
  readonly description: string;
  readonly label: string | null;
  readonly wordCount: number | bigint;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly finalized: number | bigint;
}

interface CandidateSourceRow {
  readonly baseDraftId: string;
  readonly baseDraftRevision: number | bigint;
}

interface PersistVersionInput {
  readonly versionId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceDraftId: string;
  readonly sourceRevision: number;
  readonly versionType: VersionType;
  readonly parentVersionId: string | null;
  readonly sourceCandidateId: string | null;
  readonly title: string;
  readonly description: string;
  readonly label: string | null;
  readonly createdAt: string;
  readonly blocks: readonly VersionBlock[];
}

function stable(value: unknown): string {
  return stableJson(value);
}

function blockHash(row: BlockRow): string {
  return createHash('sha256')
    .update(
      stable({
        blockType: row.blockType,
        text: row.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n'),
        attributes: JSON.parse(row.attributesJson) as unknown,
        source: row.source,
        locked: Number(row.locked) === 1,
      }),
      'utf8',
    )
    .digest('hex');
}

function versionHash(blocks: readonly VersionBlock[]): string {
  return createHash('sha256').update(stable(blocks), 'utf8').digest('hex');
}

function wordCount(blocks: readonly VersionBlock[]): number {
  return blocks.reduce(
    (total, block) =>
      total + Array.from(block.text.replace(/\s/gu, '').matchAll(/[\p{L}\p{N}]/gu)).length,
    0,
  );
}

function mapVersion(row: VersionRow): VersionSummary {
  return VersionSummarySchema.parse({
    versionId: row.versionId,
    projectId: row.projectId,
    chapterId: row.chapterId,
    sourceDraftId: row.sourceDraftId,
    sourceRevision: Number(row.sourceRevision),
    versionType: row.versionType,
    parentVersionId: row.parentVersionId,
    sourceCandidateId: row.sourceCandidateId,
    title: row.title,
    description: row.description,
    label: row.label,
    wordCount: Number(row.wordCount),
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    finalized: Number(row.finalized) === 1,
  });
}

function mapBlock(row: BlockRow): VersionBlock {
  return {
    logicalBlockId: row.logicalBlockId,
    orderKey: String(row.orderKey),
    blockType: row.blockType,
    text: row.text,
    attributes: JSON.parse(row.attributesJson) as Record<string, never>,
    source: row.source,
    locked: Number(row.locked) === 1,
    contentHash: row.contentHash ?? blockHash(row),
  };
}

function versionSelect(where: string): string {
  return `SELECT v.id AS versionId, p.id AS projectId, v.chapter_id AS chapterId,
                 v.source_draft_id AS sourceDraftId, v.source_revision AS sourceRevision,
                 v.version_type AS versionType, v.parent_version_id AS parentVersionId,
                 v.source_candidate_id AS sourceCandidateId, v.title, v.description,
                 v.label, v.word_count AS wordCount, v.content_hash AS contentHash,
                 v.created_at AS createdAt,
                 CASE WHEN c.final_version_id = v.id THEN 1 ELSE 0 END AS finalized
          FROM versions v
          JOIN chapters c ON c.id = v.chapter_id
          JOIN volumes vo ON vo.id = c.volume_id
          JOIN projects p ON p.id = vo.project_id
         WHERE ${where}`;
}

function assertActiveChapter(
  database: ProjectDatabase,
  projectId: string,
  chapterId: string,
): void {
  if (!readActiveChapterScope(database, projectId, chapterId)) {
    throw new VersionServiceError(
      'VERSION_CHAPTER_MISMATCH',
      'The active chapter was not found in the active project structure.',
    );
  }
}

function assertParentVersion(database: ProjectDatabase, input: ParsedVersionCreateInput): void {
  if (!input.parentVersionId) return;
  const parent = database
    .prepare(
      versionSelect(
        'v.id = ? AND v.chapter_id = ? AND p.id = ? AND c.deleted_at IS NULL AND vo.deleted_at IS NULL',
      ),
    )
    .get(input.parentVersionId, input.chapterId, input.projectId);
  if (!parent) {
    throw new VersionServiceError(
      'VERSION_PARENT_CONFLICT',
      'The parent Version does not belong to this active chapter and project.',
    );
  }
}

function assertSourceCandidate(database: ProjectDatabase, input: ParsedVersionCreateInput): void {
  if (input.versionType === 'candidate' && !input.sourceCandidateId) {
    throw new VersionServiceError(
      'VERSION_CANDIDATE_CONFLICT',
      'Candidate Versions require a source Candidate.',
    );
  }
  if (!input.sourceCandidateId) return;
  if (!['candidate', 'checkpoint'].includes(input.versionType)) {
    throw new VersionServiceError(
      'VERSION_CANDIDATE_CONFLICT',
      'Only candidate or checkpoint Versions may reference a Candidate.',
    );
  }
  const source = database
    .prepare(
      `SELECT ca.base_draft_id AS baseDraftId,
              ca.base_draft_revision AS baseDraftRevision
         FROM candidates ca
         JOIN chapters ch ON ch.id = ca.chapter_id
         JOIN volumes vo ON vo.id = ch.volume_id
        WHERE ca.id = ? AND ca.chapter_id = ? AND vo.project_id = ?
          AND ch.deleted_at IS NULL AND vo.deleted_at IS NULL`,
    )
    .get(input.sourceCandidateId, input.chapterId, input.projectId) as
    CandidateSourceRow | undefined;
  if (
    !source ||
    source.baseDraftId !== input.draftId ||
    Number(source.baseDraftRevision) !== input.baseRevision
  ) {
    throw new VersionServiceError(
      'VERSION_CANDIDATE_CONFLICT',
      'The source Candidate does not match this active Draft and Revision.',
    );
  }
}

function readDraftBlocksForVersion(database: ProjectDatabase, draftId: string): VersionBlock[] {
  const rows = sqliteResult<BlockRow[]>(
    database
      .prepare(
        `SELECT logical_block_id AS logicalBlockId, order_key AS orderKey,
              block_type AS blockType, text, attributes_json AS attributesJson,
              source, locked, content_hash AS contentHash
         FROM draft_blocks WHERE draft_id = ? ORDER BY order_key`,
      )
      .all(draftId),
  );
  if (rows.length === 0) {
    throw new VersionServiceError('VERSION_DRAFT_NOT_FOUND', 'The Draft contains no blocks.');
  }
  const updateHash = database.prepare(
    'UPDATE draft_blocks SET content_hash = ? WHERE draft_id = ? AND logical_block_id = ? AND content_hash IS NULL',
  );
  return rows.map((row) => {
    const hash = row.contentHash ?? blockHash(row);
    if (!row.contentHash) updateHash.run(hash, draftId, row.logicalBlockId);
    return mapBlock({ ...row, contentHash: hash });
  });
}

function persistVersion(database: ProjectDatabase, input: PersistVersionInput): VersionDocument {
  const contentHash = versionHash(input.blocks);
  const count = wordCount(input.blocks);
  try {
    database
      .prepare(
        `INSERT INTO versions(
           id, chapter_id, source_draft_id, source_revision, version_type,
           parent_version_id, source_candidate_id, title, description,
           label, word_count, content_hash, created_at
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.versionId,
        input.chapterId,
        input.sourceDraftId,
        input.sourceRevision,
        input.versionType,
        input.parentVersionId,
        input.sourceCandidateId,
        input.title,
        input.description,
        input.label,
        count,
        contentHash,
        input.createdAt,
      );
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) {
      throw new VersionServiceError(
        'VERSION_TITLE_CONFLICT',
        'A Version with this title already exists.',
        { cause: error },
      );
    }
    throw error;
  }
  const insertBlock = database.prepare(
    `INSERT INTO version_blocks(
       version_id, logical_block_id, order_key, block_type, text,
       attributes_json, source, locked, content_hash
     ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const block of input.blocks) {
    insertBlock.run(
      input.versionId,
      block.logicalBlockId,
      BigInt(block.orderKey),
      block.blockType,
      block.text,
      JSON.stringify(block.attributes),
      block.source,
      block.locked ? 1 : 0,
      block.contentHash,
    );
  }
  return VersionDocumentSchema.parse({
    versionId: input.versionId,
    projectId: input.projectId,
    chapterId: input.chapterId,
    sourceDraftId: input.sourceDraftId,
    sourceRevision: input.sourceRevision,
    versionType: input.versionType,
    parentVersionId: input.parentVersionId,
    sourceCandidateId: input.sourceCandidateId,
    title: input.title,
    description: input.description,
    label: input.label,
    wordCount: count,
    contentHash,
    createdAt: input.createdAt,
    finalized: false,
    blocks: input.blocks,
  });
}

function readVersionDocument(database: ProjectDatabase, input: VersionGetInput): VersionDocument {
  const row = database
    .prepare(versionSelect('v.id = ? AND v.chapter_id = ? AND p.id = ?'))
    .get(input.versionId, input.chapterId, input.projectId) as VersionRow | undefined;
  if (!row) throw new VersionServiceError('VERSION_NOT_FOUND', 'The Version was not found.');
  const blocks = sqliteResult<BlockRow[]>(
    database
      .prepare(
        `SELECT logical_block_id AS logicalBlockId, order_key AS orderKey,
              block_type AS blockType, text, attributes_json AS attributesJson,
              source, locked, content_hash AS contentHash
         FROM version_blocks WHERE version_id = ? ORDER BY order_key`,
      )
      .all(input.versionId),
  );
  return VersionDocumentSchema.parse({ ...mapVersion(row), blocks: blocks.map(mapBlock) });
}

export class VersionService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;

  constructor(workspace: ProjectWorkspaceService, options: VersionServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
  }

  create(requestId: string, raw: VersionCreateInput): Promise<VersionDocument> {
    const input = VersionCreateInputSchema.parse(raw);
    const versionId = this.#idFactory();
    const createdAt = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const activeDraft = readActiveDraftScope(database, input.projectId, input.draftId);
      if (!activeDraft || activeDraft.chapterId !== input.chapterId) {
        throw new VersionServiceError('VERSION_DRAFT_NOT_FOUND', 'The active Draft was not found.');
      }
      if (Number(activeDraft.draftRevision) !== input.baseRevision) {
        throw new VersionServiceError(
          'VERSION_REVISION_CONFLICT',
          'The Draft Revision changed before Version creation.',
        );
      }
      assertParentVersion(database, input);
      assertSourceCandidate(database, input);
      const blocks = readDraftBlocksForVersion(database, input.draftId);
      return persistVersion(database, {
        versionId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        sourceDraftId: input.draftId,
        sourceRevision: input.baseRevision,
        versionType: input.versionType,
        parentVersionId: input.parentVersionId ?? null,
        sourceCandidateId: input.sourceCandidateId ?? null,
        title: input.title,
        description: input.description ?? '',
        label: input.label ?? null,
        createdAt,
        blocks,
      });
    });
  }

  list(raw: { projectId: string; chapterId: string }): VersionList {
    const input = VersionChapterInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const chapter = readActiveChapterScope(database, input.projectId, input.chapterId);
      if (!chapter) {
        throw new VersionServiceError(
          'VERSION_CHAPTER_MISMATCH',
          'The active chapter was not found.',
        );
      }
      const rows = sqliteResult<VersionRow[]>(
        database
          .prepare(
            `${versionSelect(
              'v.chapter_id = ? AND p.id = ? AND c.deleted_at IS NULL AND vo.deleted_at IS NULL',
            )}
           ORDER BY v.created_at DESC, v.id DESC`,
          )
          .all(input.chapterId, input.projectId),
      );
      return VersionListSchema.parse({
        versions: rows.map(mapVersion),
        finalVersionId: chapter.finalVersionId,
      });
    });
  }

  get(raw: VersionGetInput): VersionDocument {
    const input = VersionGetInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) =>
      readVersionDocument(database, input),
    );
  }

  setFinal(requestId: string, raw: VersionSetFinalInput): Promise<VersionSummary> {
    const input = VersionSetFinalInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      assertActiveChapter(database, input.projectId, input.chapterId);
      const existing = this.#summaryFromDatabase(database, input);
      const changed = database
        .prepare(
          `UPDATE chapters
              SET final_version_id = ?, status = ?
            WHERE id = ? AND deleted_at IS NULL
              AND volume_id IN (
                SELECT id FROM volumes WHERE project_id = ? AND deleted_at IS NULL
              )`,
        )
        .run(input.versionId, 'finalized', input.chapterId, input.projectId);
      if (Number(changed.changes) !== 1) {
        throw new VersionServiceError(
          'VERSION_CHAPTER_MISMATCH',
          'The active chapter was not found.',
        );
      }
      return VersionSummarySchema.parse({ ...existing, finalized: true });
    });
  }

  restore(requestId: string, raw: VersionRestoreInput): Promise<DraftDocument> {
    const input = VersionRestoreInputSchema.parse(raw);
    const newDraftId = this.#idFactory();
    const checkpointVersionId = this.#idFactory();
    const now = this.#clock.now().toISOString();
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      assertActiveChapter(database, input.projectId, input.chapterId);
      const version = readVersionDocument(database, input);
      const activeDraft = readActiveDraftScope(database, input.projectId, input.expectedDraftId);
      const current: DraftRow | undefined =
        activeDraft && activeDraft.chapterId === input.chapterId
          ? { draftId: activeDraft.draftId, revision: activeDraft.draftRevision }
          : undefined;
      if (!current) {
        throw new VersionServiceError('VERSION_DRAFT_NOT_FOUND', 'The active Draft was not found.');
      }
      if (
        current.draftId !== input.expectedDraftId ||
        Number(current.revision) !== input.expectedRevision
      ) {
        throw new VersionServiceError(
          'VERSION_REVISION_CONFLICT',
          'The active Draft changed before the Version restore was confirmed.',
        );
      }

      const currentBlocks = readDraftBlocksForVersion(database, current.draftId);
      persistVersion(database, {
        versionId: checkpointVersionId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        sourceDraftId: current.draftId,
        sourceRevision: Number(current.revision),
        versionType: 'checkpoint',
        parentVersionId: null,
        sourceCandidateId: null,
        title: `恢复前自动留档 · ${now} · ${checkpointVersionId.slice(0, 8)}`,
        description: `恢复历史版本 ${input.versionId} 前自动保存的当前稿。`,
        label: 'restore',
        createdAt: now,
        blocks: currentBlocks,
      });

      const archived = database
        .prepare(
          `UPDATE drafts SET status = 'archived', updated_at = ?
            WHERE id = ? AND status = 'active' AND revision = ?`,
        )
        .run(now, current.draftId, current.revision);
      if (Number(archived.changes) !== 1) {
        throw new VersionServiceError(
          'VERSION_REVISION_CONFLICT',
          'The active Draft changed before it could be archived.',
        );
      }
      database
        .prepare(
          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
           VALUES(?, ?, 'active', 1, ?, ?)`,
        )
        .run(newDraftId, input.chapterId, now, now);
      const insert = database.prepare(
        `INSERT INTO draft_blocks(
           id, draft_id, logical_block_id, order_key, block_type, text,
           attributes_json, source, locked, content_hash, revision
         ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      );
      for (const block of version.blocks) {
        insert.run(
          this.#idFactory(),
          newDraftId,
          block.logicalBlockId,
          BigInt(block.orderKey),
          block.blockType,
          block.text,
          JSON.stringify(block.attributes),
          block.source,
          block.locked ? 1 : 0,
          block.contentHash,
        );
      }
      const activated = database
        .prepare(
          `UPDATE chapters SET active_draft_id = ?, status = ?
            WHERE id = ? AND active_draft_id = ? AND deleted_at IS NULL
              AND volume_id IN (
                SELECT id FROM volumes WHERE project_id = ? AND deleted_at IS NULL
              )`,
        )
        .run(newDraftId, 'writing', input.chapterId, current.draftId, input.projectId);
      if (Number(activated.changes) !== 1) {
        throw new VersionServiceError(
          'VERSION_REVISION_CONFLICT',
          'The chapter active Draft changed before the restore committed.',
        );
      }
      const operations = version.blocks.map((block, index) => ({
        type: 'insert',
        afterLogicalBlockId: index === 0 ? null : version.blocks[index - 1]!.logicalBlockId,
        block: {
          blockType: block.blockType,
          content: block.text,
          attributes: block.attributes,
        },
      }));
      database
        .prepare(
          `INSERT INTO draft_patch_log(
             id, draft_id, request_id, base_revision, committed_revision,
             operations_json, before_blocks_json, after_blocks_json, created_at,
             mutation_origin
           ) VALUES(?, ?, ?, 0, 1, ?, '[]', ?, ?, 'restore')`,
        )
        .run(
          this.#idFactory(),
          newDraftId,
          requestId,
          JSON.stringify(operations),
          JSON.stringify(version.blocks.map((block) => ({ ...block, revision: 1 }))),
          now,
        );
      return DraftDocumentSchema.parse({
        projectId: input.projectId,
        chapterId: input.chapterId,
        draftId: newDraftId,
        status: 'active',
        revision: 1,
        blocks: version.blocks,
      });
    });
  }

  #summaryFromDatabase(database: ProjectDatabase, input: VersionGetInput): VersionSummary {
    const row = database
      .prepare(
        versionSelect(
          'v.id = ? AND v.chapter_id = ? AND p.id = ? AND c.deleted_at IS NULL AND vo.deleted_at IS NULL',
        ),
      )
      .get(input.versionId, input.chapterId, input.projectId) as VersionRow | undefined;
    if (!row) throw new VersionServiceError('VERSION_NOT_FOUND', 'The Version was not found.');
    return mapVersion(row);
  }
}
