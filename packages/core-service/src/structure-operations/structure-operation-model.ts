import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  StructureOperationPreviewSchema,
  type ChapterSplitExecuteInput,
  type ChapterSplitPreviewInput,
  type ChaptersMergeExecuteInput,
  type ChaptersMergePreviewInput,
  type CrossChapterMoveExecuteInput,
  type CrossChapterMovePreviewInput,
  type StructureOperationPreview,
} from '@worldforge/contracts';

import {
  auditBlocks,
  draftOperations,
  persistBlocks,
  persistedNumber,
  stable,
  type MutableDraftBlock,
} from '../candidate-state.js';
import type { DatabaseClock } from '../database/index.js';
import { ProjectStructureError } from '../project-structure.js';

export const systemClock: DatabaseClock = { now: () => new Date() };

export interface StructureOperationServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (
    stage: 'after-source-persist' | 'after-trash-delete' | 'before-commit',
  ) => void;
}

export interface ChapterLocation {
  readonly chapterId: string;
  readonly volumeId: string;
  readonly title: string;
  readonly orderKey: bigint;
}

export function numberValue(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'A persisted count is invalid.');
  }
  return Number(parsed);
}

export function planHash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function derivedRequestId(requestId: string, scope: string): string {
  const hex = createHash('sha256')
    .update(`${requestId}:${scope}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

export function characters(blocks: readonly MutableDraftBlock[]): number {
  return blocks.reduce((total, block) => total + Array.from(block.text).length, 0);
}

export function chapterLocation(
  database: DatabaseSync,
  projectId: string,
  chapterId: string,
): ChapterLocation {
  const row = database
    .prepare(
      `SELECT ch.id AS chapterId, ch.volume_id AS volumeId, ch.title, ch.order_key AS orderKey
         FROM chapters ch
         JOIN volumes vo ON vo.id = ch.volume_id
        WHERE ch.id = ? AND vo.project_id = ?
          AND ch.deleted_at IS NULL AND vo.deleted_at IS NULL`,
    )
    .get(chapterId, projectId) as
    { chapterId: string; volumeId: string; title: string; orderKey: number | bigint } | undefined;
  if (!row) {
    throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The active chapter was not found.');
  }
  return { ...row, orderKey: BigInt(row.orderKey) };
}

export function assertRevision(actual: number | bigint, expected: number): void {
  if (persistedNumber(actual) !== expected) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      'A Draft Revision changed after the structure preview was created.',
    );
  }
}

export function hashInputBlock(block: MutableDraftBlock): Record<string, unknown> {
  return {
    logicalBlockId: block.logicalBlockId,
    contentHash: block.contentHash,
    locked: block.locked,
    orderKey: block.orderKey,
  };
}

export function makePreview(
  input: Omit<StructureOperationPreview, 'planHash'>,
  hashState: unknown,
): StructureOperationPreview {
  return StructureOperationPreviewSchema.parse({
    ...input,
    planHash: planHash({ input, hashState }),
  });
}

export function assertExecutable(preview: StructureOperationPreview, expectedHash: string): void {
  if (preview.planHash !== expectedHash) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      'The structure plan changed after preview; create a new preview.',
    );
  }
  if (!preview.canExecute) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      preview.lockedLogicalBlockIds.length > 0
        ? 'Locked DraftBlocks must be explicitly unlocked before this structure operation.'
        : 'The structure operation would leave an invalid Draft.',
    );
  }
}

export function cloneBlocks(
  blocks: readonly MutableDraftBlock[],
  revision: number,
  idFactory: () => string,
  logicalIdsInUse: Set<string> = new Set(),
): MutableDraftBlock[] {
  return blocks.map((block, index) => {
    const logicalBlockId = logicalIdsInUse.has(block.logicalBlockId)
      ? idFactory()
      : block.logicalBlockId;
    logicalIdsInUse.add(logicalBlockId);
    return {
      ...block,
      recordId: idFactory(),
      logicalBlockId,
      orderKey: String((index + 1) * 1024),
      locked: false,
      revision,
    };
  });
}

export function persistRevisionedDraft(
  database: DatabaseSync,
  requestId: string,
  draftId: string,
  baseRevision: number,
  before: readonly MutableDraftBlock[],
  after: readonly MutableDraftBlock[],
  timestamp: string,
): void {
  const committedRevision = baseRevision + 1;
  persistBlocks(database, draftId, before, after);
  const changed = database
    .prepare('UPDATE drafts SET revision = ?, updated_at = ? WHERE id = ? AND revision = ?')
    .run(committedRevision, timestamp, draftId, baseRevision);
  if (numberValue(changed.changes) !== 1) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'The Draft Revision changed.');
  }
  database
    .prepare(
      `INSERT INTO draft_patch_log(
         id, draft_id, request_id, base_revision, committed_revision,
         operations_json, before_blocks_json, after_blocks_json, created_at,
         mutation_origin
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'structure')`,
    )
    .run(
      randomUUID(),
      draftId,
      requestId,
      baseRevision,
      committedRevision,
      JSON.stringify(draftOperations(before, after)),
      JSON.stringify(auditBlocks(before)),
      JSON.stringify(auditBlocks(after)),
      timestamp,
    );
}

export function splitInput(input: ChapterSplitExecuteInput): ChapterSplitPreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

export function mergeInput(input: ChaptersMergeExecuteInput): ChaptersMergePreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

export function moveInput(input: CrossChapterMoveExecuteInput): CrossChapterMovePreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

export function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error('EMPTY_SQL_VALUE_SET');
  return values.map(() => '?').join(', ');
}
