import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { SemanticValidationOutput } from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { GenerationUsage } from '../generation-run.js';

export const systemClock: DatabaseClock = { now: () => new Date() };

export type ValidationServiceErrorCode =
  'VALIDATION_NOT_FOUND' | 'VALIDATION_INVALID' | 'VALIDATION_CONFLICT';

export class ValidationServiceError extends Error {
  readonly code: ValidationServiceErrorCode;

  constructor(code: ValidationServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ValidationServiceError';
    this.code = code;
  }
}

export interface ValidationServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
}

export interface VersionRow {
  readonly versionId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly finalVersionId: string | null;
  readonly contentHash: string;
}

export interface VersionBlockRow {
  readonly logicalBlockId: string;
  readonly blockType: string;
  readonly text: string;
  readonly contentHash: string;
  readonly locked: number | bigint;
  readonly orderKey: number | bigint;
}

export interface BatchRow {
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly generationRunId: string | null;
  readonly source: string;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly inputFingerprint: string | null;
  readonly issueCount: number | bigint;
  readonly createdAt: string;
}

export interface IssueRow {
  readonly issueId: string;
  readonly batchId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly expectedBlockHash: string | null;
  readonly textQuote: string | null;
  readonly rangeHintJson: string | null;
  readonly issueType: string;
  readonly source: string;
  readonly severity: string;
  readonly rationale: string;
  readonly evidenceIdsJson: string;
  readonly suggestion: string | null;
  readonly confidence: number | null;
  readonly ruleId: string | null;
  readonly ruleVersion: string | null;
  readonly configVersion: string | null;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly finalVersionId: string | null;
  readonly persistedBlockHash: string | null;
}

export interface TodoRow {
  readonly todoId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sceneBeatId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly title: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}

export interface CommentRow {
  readonly commentId: string;
  readonly projectId: string;
  readonly chapterId: string | null;
  readonly sourceVersionId: string | null;
  readonly logicalBlockId: string | null;
  readonly validationIssueId: string | null;
  readonly body: string;
  readonly status: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resolvedAt: string | null;
}

export function json(value: string | null): unknown | null {
  return value === null ? null : (JSON.parse(value) as unknown);
}

export function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function stableUuid(value: string): string {
  const valueHash = hash(value);
  return `${valueHash.slice(0, 8)}-${valueHash.slice(8, 12)}-5${valueHash.slice(
    13,
    16,
  )}-8${valueHash.slice(17, 20)}-${valueHash.slice(20, 32)}`;
}

export function finalVersion(
  database: DatabaseSync,
  projectId: string,
  sourceVersionId: string,
): { readonly version: VersionRow; readonly blocks: readonly VersionBlockRow[] } {
  const version = database
    .prepare(
      `SELECT version.id AS versionId, volume.project_id AS projectId,
              chapter.id AS chapterId, chapter.final_version_id AS finalVersionId,
              version.content_hash AS contentHash
         FROM versions version
         JOIN chapters chapter ON chapter.id = version.chapter_id
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE version.id = ? AND volume.project_id = ?
          AND chapter.deleted_at IS NULL AND volume.deleted_at IS NULL`,
    )
    .get(sourceVersionId, projectId) as VersionRow | undefined;
  if (!version) {
    throw new ValidationServiceError(
      'VALIDATION_NOT_FOUND',
      'The validation Version was not found in this project.',
    );
  }
  if (version.finalVersionId !== version.versionId) {
    throw new ValidationServiceError(
      'VALIDATION_CONFLICT',
      'Validation requires the chapter current Final Version.',
    );
  }
  const blocks = database
    .prepare(
      `SELECT logical_block_id AS logicalBlockId, block_type AS blockType, text,
              content_hash AS contentHash, locked, order_key AS orderKey
         FROM version_blocks
        WHERE version_id = ?
        ORDER BY order_key, logical_block_id`,
    )
    .all(version.versionId) as unknown as VersionBlockRow[];
  if (blocks.length === 0) {
    throw new ValidationServiceError(
      'VALIDATION_INVALID',
      'The Final Version has no body blocks to validate.',
    );
  }
  return { version, blocks };
}

export function validateScopedIds(
  database: DatabaseSync,
  input: {
    readonly projectId: string;
    readonly chapterId: string | null;
    readonly sceneBeatId: string | null;
    readonly logicalBlockId: string | null;
  },
): void {
  if (input.chapterId) {
    const chapter = database
      .prepare(
        `SELECT 1 FROM chapters chapter
         JOIN volumes volume ON volume.id = chapter.volume_id
        WHERE chapter.id = ? AND volume.project_id = ?`,
      )
      .get(input.chapterId, input.projectId);
    if (!chapter) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Chapter not found.');
  }
  if (input.sceneBeatId) {
    const beat = database
      .prepare('SELECT 1 FROM scene_beats WHERE id = ? AND project_id = ?')
      .get(input.sceneBeatId, input.projectId);
    if (!beat) throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'SceneBeat not found.');
  }
  if (input.logicalBlockId) {
    const block = database
      .prepare(
        `SELECT 1
           FROM draft_blocks block
           JOIN drafts draft ON draft.id = block.draft_id
           JOIN chapters chapter ON chapter.id = draft.chapter_id
           JOIN volumes volume ON volume.id = chapter.volume_id
          WHERE block.logical_block_id = ? AND volume.project_id = ?
            AND chapter.active_draft_id = draft.id`,
      )
      .get(input.logicalBlockId, input.projectId);
    if (!block) {
      throw new ValidationServiceError('VALIDATION_NOT_FOUND', 'Active Draft block not found.');
    }
  }
}

export interface ValidationAiCompletionInput {
  readonly projectId: string;
  readonly chapterId: string;
  readonly sourceVersionId: string;
  readonly runId: string;
  readonly output: SemanticValidationOutput;
  readonly usage?: GenerationUsage;
}
