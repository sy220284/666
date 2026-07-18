import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ChapterSplitExecuteInputSchema,
  ChapterSplitPreviewInputSchema,
  ChaptersMergeExecuteInputSchema,
  ChaptersMergePreviewInputSchema,
  CrossChapterMoveExecuteInputSchema,
  CrossChapterMovePreviewInputSchema,
  StructureOperationPreviewSchema,
  StructureOperationResultSchema,
  TrashPermanentDeleteInputSchema,
  TrashPermanentDeletePreviewInputSchema,
  TrashPermanentDeletePreviewSchema,
  TrashPermanentDeleteResultSchema,
  type ChapterSplitExecuteInput,
  type ChapterSplitPreviewInput,
  type ChaptersMergeExecuteInput,
  type ChaptersMergePreviewInput,
  type CrossChapterMoveExecuteInput,
  type CrossChapterMovePreviewInput,
  type StructureOperationPreview,
  type StructureOperationResult,
  type TrashDeleteImpact,
  type TrashEntry,
  type TrashPermanentDeleteInput,
  type TrashPermanentDeletePreview,
  type TrashPermanentDeletePreviewInput,
  type TrashPermanentDeleteResult,
} from '@worldforge/contracts';
import { planOrderKey, type OrderedSibling } from '@worldforge/domain';

import {
  activeDraft,
  auditBlocks,
  draftDocument,
  draftOperations,
  persistBlocks,
  persistedNumber,
  readDraftBlocks,
  stable,
  type MutableDraftBlock,
} from './candidate-state.js';
import type { DatabaseClock } from './database/index.js';
import { ProjectStructureError, readStructure } from './project-structure.js';
import type { ProjectWorkspaceService } from './project-workspace.js';

const systemClock: DatabaseClock = { now: () => new Date() };

export interface StructureOperationServiceOptions {
  readonly clock?: DatabaseClock;
  readonly idFactory?: () => string;
  readonly faultInjector?: (
    stage: 'after-source-persist' | 'after-trash-delete' | 'before-commit',
  ) => void;
}

interface ChapterLocation {
  readonly chapterId: string;
  readonly volumeId: string;
  readonly title: string;
  readonly orderKey: bigint;
}

interface TrashTarget {
  readonly entry: TrashEntry;
  readonly chapterIds: readonly string[];
  readonly volumeIds: readonly string[];
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(parsed) || Number(parsed) < 0) {
    throw new ProjectStructureError('STRUCTURE_CONFLICT', 'A persisted count is invalid.');
  }
  return Number(parsed);
}

function planHash(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function derivedRequestId(requestId: string, scope: string): string {
  const hex = createHash('sha256')
    .update(`${requestId}:${scope}`, 'utf8')
    .digest('hex')
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`;
}

function characters(blocks: readonly MutableDraftBlock[]): number {
  return blocks.reduce((total, block) => total + Array.from(block.text).length, 0);
}

function chapterLocation(
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

function assertRevision(actual: number | bigint, expected: number): void {
  if (persistedNumber(actual) !== expected) {
    throw new ProjectStructureError(
      'STRUCTURE_CONFLICT',
      'A Draft Revision changed after the structure preview was created.',
    );
  }
}

function hashInputBlock(block: MutableDraftBlock): Record<string, unknown> {
  return {
    logicalBlockId: block.logicalBlockId,
    contentHash: block.contentHash,
    locked: block.locked,
    orderKey: block.orderKey,
  };
}

function makePreview(
  input: Omit<StructureOperationPreview, 'planHash'>,
  hashState: unknown,
): StructureOperationPreview {
  return StructureOperationPreviewSchema.parse({
    ...input,
    planHash: planHash({ input, hashState }),
  });
}

function assertExecutable(preview: StructureOperationPreview, expectedHash: string): void {
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

function cloneBlocks(
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

function persistRevisionedDraft(
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
         operations_json, before_blocks_json, after_blocks_json, created_at
       ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

function splitInput(input: ChapterSplitExecuteInput): ChapterSplitPreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

function mergeInput(input: ChaptersMergeExecuteInput): ChaptersMergePreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

function moveInput(input: CrossChapterMoveExecuteInput): CrossChapterMovePreviewInput {
  const { planHash: _planHash, ...previewInput } = input;
  return previewInput;
}

function placeholders(values: readonly string[]): string {
  if (values.length === 0) throw new Error('EMPTY_SQL_VALUE_SET');
  return values.map(() => '?').join(', ');
}

function trashTarget(database: DatabaseSync, input: TrashPermanentDeletePreviewInput): TrashTarget {
  const row = database
    .prepare(
      `SELECT t.id, t.entity_type AS entityType, t.entity_id AS entityId,
              CASE WHEN t.entity_type = 'volume' THEN vo.title ELSE ch.title END AS title,
              t.original_parent_id AS originalParentId,
              t.original_order_key AS originalOrderKey, t.deleted_at AS deletedAt
         FROM trash_entries t
         LEFT JOIN volumes vo ON t.entity_type = 'volume' AND vo.id = t.entity_id
         LEFT JOIN chapters ch ON t.entity_type = 'chapter' AND ch.id = t.entity_id
         LEFT JOIN volumes cv ON ch.volume_id = cv.id
        WHERE t.id = ? AND (
          (t.entity_type = 'volume' AND vo.project_id = ?) OR
          (t.entity_type = 'chapter' AND cv.project_id = ?)
        )`,
    )
    .get(input.trashEntryId, input.projectId, input.projectId) as
    | {
        id: string;
        entityType: 'volume' | 'chapter';
        entityId: string;
        title: string;
        originalParentId: string;
        originalOrderKey: number | bigint;
        deletedAt: string;
      }
    | undefined;
  if (!row) {
    throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The trash entry was not found.');
  }
  const entry = {
    ...row,
    originalOrderKey: String(row.originalOrderKey),
  } satisfies TrashEntry;
  if (entry.entityType === 'chapter') {
    return { entry, chapterIds: [entry.entityId], volumeIds: [] };
  }
  const chapterIds = (
    database
      .prepare('SELECT id FROM chapters WHERE volume_id = ? ORDER BY id')
      .all(entry.entityId) as {
      id: string;
    }[]
  ).map((chapter) => chapter.id);
  return { entry, chapterIds, volumeIds: [entry.entityId] };
}

function countWhere(
  database: DatabaseSync,
  table: string,
  column: string,
  values: readonly string[],
): number {
  if (values.length === 0) return 0;
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} IN (${placeholders(values)})`)
    .get(...values) as { count: number | bigint };
  return numberValue(row.count);
}

function deleteImpact(database: DatabaseSync, target: TrashTarget): TrashDeleteImpact {
  const draftIds =
    target.chapterIds.length === 0
      ? []
      : (
          database
            .prepare(
              `SELECT id FROM drafts WHERE chapter_id IN (${placeholders(target.chapterIds)}) ORDER BY id`,
            )
            .all(...target.chapterIds) as { id: string }[]
        ).map((row) => row.id);
  return {
    volumes: target.volumeIds.length,
    chapters: target.chapterIds.length,
    drafts: draftIds.length,
    draftBlocks: countWhere(database, 'draft_blocks', 'draft_id', draftIds),
    versions: countWhere(database, 'versions', 'chapter_id', target.chapterIds),
    candidates: countWhere(database, 'candidates', 'chapter_id', target.chapterIds),
  };
}

export class StructureOperationService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: StructureOperationServiceOptions['faultInjector'];

  constructor(workspace: ProjectWorkspaceService, options: StructureOperationServiceOptions = {}) {
    this.#workspace = workspace;
    this.#clock = options.clock ?? systemClock;
    this.#idFactory = options.idFactory ?? randomUUID;
    this.#faultInjector = options.faultInjector;
  }

  previewSplit(raw: ChapterSplitPreviewInput): StructureOperationPreview {
    const input = ChapterSplitPreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      chapterLocation(database, input.projectId, input.chapterId);
      const draft = activeDraft(database, input.projectId, input.chapterId, input.draftId);
      assertRevision(draft.revision, input.baseRevision);
      const blocks = readDraftBlocks(database, draft.draftId);
      const splitIndex = blocks.findIndex(
        (block) => block.logicalBlockId === input.splitAfterLogicalBlockId,
      );
      if (splitIndex < 0) {
        throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The split anchor was not found.');
      }
      const moved = blocks.slice(splitIndex + 1);
      if (moved.length === 0) {
        throw new ProjectStructureError(
          'STRUCTURE_INVALID_POSITION',
          'A chapter split requires at least one block after the anchor.',
        );
      }
      const locked = moved.filter((block) => block.locked).map((block) => block.logicalBlockId);
      const titleConflict = Boolean(
        database
          .prepare(
            `SELECT 1 FROM chapters ch
             JOIN volumes vo ON vo.id = ch.volume_id
             JOIN chapters source ON source.volume_id = vo.id
            WHERE source.id = ? AND vo.project_id = ? AND ch.deleted_at IS NULL
              AND ch.title = ? LIMIT 1`,
          )
          .get(input.chapterId, input.projectId, input.newChapterTitle),
      );
      const warnings = [
        ...(locked.length ? ['移动范围包含锁定块，必须先解锁。'] : []),
        ...(titleConflict ? ['同卷已有同名章节。'] : []),
      ];
      return makePreview(
        {
          operation: 'split-chapter',
          sourceChapterId: input.chapterId,
          targetChapterId: null,
          sourceDraftId: draft.draftId,
          targetDraftId: null,
          sourceRevision: input.baseRevision,
          targetRevision: null,
          movedLogicalBlockIds: moved.map((block) => block.logicalBlockId),
          lockedLogicalBlockIds: locked,
          sourceBlockCount: blocks.length,
          targetBlockCount: 0,
          resultingSourceBlockCount: splitIndex + 1,
          resultingTargetBlockCount: moved.length,
          movedCharacterCount: characters(moved),
          warnings,
          canExecute: locked.length === 0 && !titleConflict,
        },
        blocks.map(hashInputBlock),
      );
    });
  }

  previewMerge(raw: ChaptersMergePreviewInput): StructureOperationPreview {
    const input = ChaptersMergePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      chapterLocation(database, input.projectId, input.sourceChapterId);
      chapterLocation(database, input.projectId, input.targetChapterId);
      const source = activeDraft(
        database,
        input.projectId,
        input.sourceChapterId,
        input.sourceDraftId,
      );
      const target = activeDraft(
        database,
        input.projectId,
        input.targetChapterId,
        input.targetDraftId,
      );
      assertRevision(source.revision, input.sourceBaseRevision);
      assertRevision(target.revision, input.targetBaseRevision);
      const sourceBlocks = readDraftBlocks(database, source.draftId);
      const targetBlocks = readDraftBlocks(database, target.draftId);
      const locked = sourceBlocks
        .filter((block) => block.locked)
        .map((block) => block.logicalBlockId);
      return makePreview(
        {
          operation: 'merge-chapter',
          sourceChapterId: input.sourceChapterId,
          targetChapterId: input.targetChapterId,
          sourceDraftId: source.draftId,
          targetDraftId: target.draftId,
          sourceRevision: input.sourceBaseRevision,
          targetRevision: input.targetBaseRevision,
          movedLogicalBlockIds: sourceBlocks.map((block) => block.logicalBlockId),
          lockedLogicalBlockIds: locked,
          sourceBlockCount: sourceBlocks.length,
          targetBlockCount: targetBlocks.length,
          resultingSourceBlockCount: sourceBlocks.length,
          resultingTargetBlockCount: sourceBlocks.length + targetBlocks.length,
          movedCharacterCount: characters(sourceBlocks),
          warnings: [
            '合并后源章节进入废纸篓；恢复源章节会再次显示其原正文。',
            ...(locked.length ? ['源章节包含锁定块，必须先解锁。'] : []),
          ],
          canExecute: locked.length === 0,
        },
        {
          source: sourceBlocks.map(hashInputBlock),
          target: targetBlocks.map(hashInputBlock),
        },
      );
    });
  }

  previewMove(raw: CrossChapterMovePreviewInput): StructureOperationPreview {
    const input = CrossChapterMovePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      chapterLocation(database, input.projectId, input.sourceChapterId);
      chapterLocation(database, input.projectId, input.targetChapterId);
      const source = activeDraft(
        database,
        input.projectId,
        input.sourceChapterId,
        input.sourceDraftId,
      );
      const target = activeDraft(
        database,
        input.projectId,
        input.targetChapterId,
        input.targetDraftId,
      );
      assertRevision(source.revision, input.sourceBaseRevision);
      assertRevision(target.revision, input.targetBaseRevision);
      const sourceBlocks = readDraftBlocks(database, source.draftId);
      const targetBlocks = readDraftBlocks(database, target.draftId);
      const selected = new Set(input.logicalBlockIds);
      const moved = sourceBlocks.filter((block) => selected.has(block.logicalBlockId));
      if (moved.length !== selected.size) {
        throw new ProjectStructureError(
          'STRUCTURE_NOT_FOUND',
          'One or more moved DraftBlocks do not belong to the source Draft.',
        );
      }
      if (
        input.afterTargetLogicalBlockId !== null &&
        !targetBlocks.some((block) => block.logicalBlockId === input.afterTargetLogicalBlockId)
      ) {
        throw new ProjectStructureError('STRUCTURE_NOT_FOUND', 'The target anchor was not found.');
      }
      const targetIds = new Set(targetBlocks.map((block) => block.logicalBlockId));
      const duplicateIds = moved
        .filter((block) => targetIds.has(block.logicalBlockId))
        .map((block) => block.logicalBlockId);
      const locked = moved.filter((block) => block.locked).map((block) => block.logicalBlockId);
      const leavesSourceEmpty = moved.length === sourceBlocks.length;
      const warnings = [
        ...(locked.length ? ['移动范围包含锁定块，必须先解锁。'] : []),
        ...(duplicateIds.length ? ['目标Draft已有相同logicalBlockId。'] : []),
        ...(leavesSourceEmpty ? ['跨章移动不能清空源Draft；请改用合章。'] : []),
      ];
      return makePreview(
        {
          operation: 'move-blocks',
          sourceChapterId: input.sourceChapterId,
          targetChapterId: input.targetChapterId,
          sourceDraftId: source.draftId,
          targetDraftId: target.draftId,
          sourceRevision: input.sourceBaseRevision,
          targetRevision: input.targetBaseRevision,
          movedLogicalBlockIds: moved.map((block) => block.logicalBlockId),
          lockedLogicalBlockIds: locked,
          sourceBlockCount: sourceBlocks.length,
          targetBlockCount: targetBlocks.length,
          resultingSourceBlockCount: sourceBlocks.length - moved.length,
          resultingTargetBlockCount: targetBlocks.length + moved.length,
          movedCharacterCount: characters(moved),
          warnings,
          canExecute: locked.length === 0 && duplicateIds.length === 0 && !leavesSourceEmpty,
        },
        {
          source: sourceBlocks.map(hashInputBlock),
          target: targetBlocks.map(hashInputBlock),
          afterTargetLogicalBlockId: input.afterTargetLogicalBlockId,
        },
      );
    });
  }

  previewPermanentDelete(raw: TrashPermanentDeletePreviewInput): TrashPermanentDeletePreview {
    const input = TrashPermanentDeletePreviewInputSchema.parse(raw);
    return this.#workspace.readProject(input.projectId, (database) => {
      const target = trashTarget(database, input);
      const impact = deleteImpact(database, target);
      const blockers = [
        ...(impact.versions > 0 ? [{ kind: 'version' as const, count: impact.versions }] : []),
        ...(impact.candidates > 0
          ? [{ kind: 'candidate' as const, count: impact.candidates }]
          : []),
      ];
      return TrashPermanentDeletePreviewSchema.parse({
        entry: target.entry,
        impact,
        blockers,
        canDelete: blockers.length === 0,
        planHash: planHash({ entry: target.entry, impact, blockers }),
      });
    });
  }

  assertSplitExecutable(input: ChapterSplitExecuteInput): StructureOperationPreview {
    const parsed = ChapterSplitExecuteInputSchema.parse(input);
    const preview = this.previewSplit(splitInput(parsed));
    assertExecutable(preview, parsed.planHash);
    return preview;
  }

  assertMergeExecutable(input: ChaptersMergeExecuteInput): StructureOperationPreview {
    const parsed = ChaptersMergeExecuteInputSchema.parse(input);
    const preview = this.previewMerge(mergeInput(parsed));
    assertExecutable(preview, parsed.planHash);
    return preview;
  }

  assertMoveExecutable(input: CrossChapterMoveExecuteInput): StructureOperationPreview {
    const parsed = CrossChapterMoveExecuteInputSchema.parse(input);
    const preview = this.previewMove(moveInput(parsed));
    assertExecutable(preview, parsed.planHash);
    return preview;
  }

  assertPermanentDeleteExecutable(input: TrashPermanentDeleteInput): TrashPermanentDeletePreview {
    const parsed = TrashPermanentDeleteInputSchema.parse(input);
    const { planHash: expectedPlanHash, confirmationTitle, ...previewInput } = parsed;
    const preview = this.previewPermanentDelete(previewInput);
    if (preview.planHash !== expectedPlanHash) {
      throw new ProjectStructureError(
        'STRUCTURE_CONFLICT',
        'The permanent-delete impact changed after preview.',
      );
    }
    if (preview.entry.title !== confirmationTitle) {
      throw new ProjectStructureError(
        'STRUCTURE_CONFLICT',
        'The permanent-delete confirmation title does not match.',
      );
    }
    if (!preview.canDelete) {
      throw new ProjectStructureError(
        'STRUCTURE_CONFLICT',
        'Immutable Version or Candidate references block permanent deletion.',
      );
    }
    return preview;
  }

  executeSplit(
    requestId: string,
    raw: ChapterSplitExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    const input = ChapterSplitExecuteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const preview = this.#previewSplitInTransaction(database, splitInput(input));
      assertExecutable(preview, input.planHash);
      const sourceLocation = chapterLocation(database, input.projectId, input.chapterId);
      const sourceDraft = activeDraft(database, input.projectId, input.chapterId, input.draftId);
      const before = readDraftBlocks(database, sourceDraft.draftId);
      const splitIndex = before.findIndex(
        (block) => block.logicalBlockId === input.splitAfterLogicalBlockId,
      );
      const sourceAfter = before.slice(0, splitIndex + 1);
      const moved = before.slice(splitIndex + 1);
      const timestamp = this.#clock.now().toISOString();
      persistRevisionedDraft(
        database,
        derivedRequestId(requestId, 'split-source'),
        sourceDraft.draftId,
        input.baseRevision,
        before,
        sourceAfter,
        timestamp,
      );
      this.#faultInjector?.('after-source-persist');

      const siblings = database
        .prepare(
          'SELECT id, order_key AS orderKey FROM chapters WHERE volume_id = ? AND deleted_at IS NULL ORDER BY order_key, id',
        )
        .all(sourceLocation.volumeId) as unknown as OrderedSibling[];
      const order = planOrderKey(siblings, {
        kind: 'after',
        siblingId: sourceLocation.chapterId,
      });
      const updateOrder = database.prepare('UPDATE chapters SET order_key = ? WHERE id = ?');
      for (const sibling of order.rebalanced) updateOrder.run(sibling.orderKey, sibling.id);
      const chapterId = this.#idFactory();
      const draftId = this.#idFactory();
      database
        .prepare(
          `INSERT INTO chapters(
             id, volume_id, title, order_key, status, target_word_min, target_word_max,
             active_draft_id, final_version_id, deleted_at
           ) VALUES(?, ?, ?, ?, 'writing', NULL, NULL, NULL, NULL, NULL)`,
        )
        .run(chapterId, sourceLocation.volumeId, input.newChapterTitle, order.orderKey);
      database
        .prepare(
          `INSERT INTO drafts(id, chapter_id, status, revision, created_at, updated_at)
           VALUES(?, ?, 'active', 0, ?, ?)`,
        )
        .run(draftId, chapterId, timestamp, timestamp);
      database
        .prepare('UPDATE chapters SET active_draft_id = ? WHERE id = ?')
        .run(draftId, chapterId);
      const targetAfter = cloneBlocks(moved, 1, this.#idFactory);
      persistRevisionedDraft(
        database,
        derivedRequestId(requestId, 'split-target'),
        draftId,
        0,
        [],
        targetAfter,
        timestamp,
      );
      this.#faultInjector?.('before-commit');
      return StructureOperationResultSchema.parse({
        operation: 'split-chapter',
        planHash: preview.planHash,
        backupId,
        structure: readStructure(database, input.projectId),
        drafts: [
          draftDocument(
            input.projectId,
            input.chapterId,
            { ...sourceDraft, revision: input.baseRevision + 1 },
            sourceAfter,
          ),
          draftDocument(
            input.projectId,
            chapterId,
            { draftId, revision: 1, status: 'active' },
            targetAfter,
          ),
        ],
        deletedChapterId: null,
      });
    });
  }

  executeMerge(
    requestId: string,
    raw: ChaptersMergeExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    const input = ChaptersMergeExecuteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const preview = this.#previewMergeInTransaction(database, mergeInput(input));
      assertExecutable(preview, input.planHash);
      const sourceLocation = chapterLocation(database, input.projectId, input.sourceChapterId);
      const sourceDraft = activeDraft(
        database,
        input.projectId,
        input.sourceChapterId,
        input.sourceDraftId,
      );
      const targetDraft = activeDraft(
        database,
        input.projectId,
        input.targetChapterId,
        input.targetDraftId,
      );
      const sourceBlocks = readDraftBlocks(database, sourceDraft.draftId);
      const targetBefore = readDraftBlocks(database, targetDraft.draftId);
      const committedRevision = input.targetBaseRevision + 1;
      const targetIds = new Set(targetBefore.map((block) => block.logicalBlockId));
      const copied = cloneBlocks(sourceBlocks, committedRevision, this.#idFactory, targetIds).map(
        (block, index) => ({
          ...block,
          orderKey: String((targetBefore.length + index + 1) * 1024),
        }),
      );
      const targetAfter = [...targetBefore, ...copied];
      const timestamp = this.#clock.now().toISOString();
      persistRevisionedDraft(
        database,
        derivedRequestId(requestId, 'merge-target'),
        targetDraft.draftId,
        input.targetBaseRevision,
        targetBefore,
        targetAfter,
        timestamp,
      );
      this.#faultInjector?.('after-source-persist');
      database
        .prepare(
          `INSERT INTO trash_entries(
             id, entity_type, entity_id, original_parent_id, original_order_key, deleted_at
           ) VALUES(?, 'chapter', ?, ?, ?, ?)`,
        )
        .run(
          this.#idFactory(),
          sourceLocation.chapterId,
          sourceLocation.volumeId,
          sourceLocation.orderKey,
          timestamp,
        );
      database
        .prepare('UPDATE chapters SET deleted_at = ? WHERE id = ?')
        .run(timestamp, sourceLocation.chapterId);
      this.#faultInjector?.('before-commit');
      return StructureOperationResultSchema.parse({
        operation: 'merge-chapter',
        planHash: preview.planHash,
        backupId,
        structure: readStructure(database, input.projectId),
        drafts: [
          draftDocument(
            input.projectId,
            input.targetChapterId,
            { ...targetDraft, revision: committedRevision },
            targetAfter,
          ),
        ],
        deletedChapterId: input.sourceChapterId,
      });
    });
  }

  executeMove(
    requestId: string,
    raw: CrossChapterMoveExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    const input = CrossChapterMoveExecuteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const preview = this.#previewMoveInTransaction(database, moveInput(input));
      assertExecutable(preview, input.planHash);
      const sourceDraft = activeDraft(
        database,
        input.projectId,
        input.sourceChapterId,
        input.sourceDraftId,
      );
      const targetDraft = activeDraft(
        database,
        input.projectId,
        input.targetChapterId,
        input.targetDraftId,
      );
      const sourceBefore = readDraftBlocks(database, sourceDraft.draftId);
      const targetBefore = readDraftBlocks(database, targetDraft.draftId);
      const selected = new Set(input.logicalBlockIds);
      const moved = sourceBefore.filter((block) => selected.has(block.logicalBlockId));
      const sourceRevision = input.sourceBaseRevision + 1;
      const targetRevision = input.targetBaseRevision + 1;
      const sourceAfter = sourceBefore
        .filter((block) => !selected.has(block.logicalBlockId))
        .map((block, index) => ({ ...block, orderKey: String((index + 1) * 1024) }));
      const insertionIndex =
        input.afterTargetLogicalBlockId === null
          ? 0
          : targetBefore.findIndex(
              (block) => block.logicalBlockId === input.afterTargetLogicalBlockId,
            ) + 1;
      const movedCopies = cloneBlocks(moved, targetRevision, this.#idFactory);
      const targetAfter = [
        ...targetBefore.slice(0, insertionIndex),
        ...movedCopies,
        ...targetBefore.slice(insertionIndex),
      ].map((block, index) => ({ ...block, orderKey: String((index + 1) * 1024) }));
      const timestamp = this.#clock.now().toISOString();
      persistRevisionedDraft(
        database,
        derivedRequestId(requestId, 'move-source'),
        sourceDraft.draftId,
        input.sourceBaseRevision,
        sourceBefore,
        sourceAfter,
        timestamp,
      );
      this.#faultInjector?.('after-source-persist');
      persistRevisionedDraft(
        database,
        derivedRequestId(requestId, 'move-target'),
        targetDraft.draftId,
        input.targetBaseRevision,
        targetBefore,
        targetAfter,
        timestamp,
      );
      this.#faultInjector?.('before-commit');
      return StructureOperationResultSchema.parse({
        operation: 'move-blocks',
        planHash: preview.planHash,
        backupId,
        structure: readStructure(database, input.projectId),
        drafts: [
          draftDocument(
            input.projectId,
            input.sourceChapterId,
            { ...sourceDraft, revision: sourceRevision },
            sourceAfter,
          ),
          draftDocument(
            input.projectId,
            input.targetChapterId,
            { ...targetDraft, revision: targetRevision },
            targetAfter,
          ),
        ],
        deletedChapterId: null,
      });
    });
  }

  permanentDelete(
    requestId: string,
    raw: TrashPermanentDeleteInput,
    backupId: string,
  ): Promise<TrashPermanentDeleteResult> {
    const input = TrashPermanentDeleteInputSchema.parse(raw);
    return this.#workspace.writeProject(requestId, input.projectId, (database) => {
      const target = trashTarget(database, input);
      const impact = deleteImpact(database, target);
      const blockers = impact.versions + impact.candidates;
      const currentHash = planHash({
        entry: target.entry,
        impact,
        blockers: [
          ...(impact.versions ? [{ kind: 'version', count: impact.versions }] : []),
          ...(impact.candidates ? [{ kind: 'candidate', count: impact.candidates }] : []),
        ],
      });
      if (
        currentHash !== input.planHash ||
        target.entry.title !== input.confirmationTitle ||
        blockers > 0
      ) {
        throw new ProjectStructureError(
          'STRUCTURE_CONFLICT',
          'Permanent-delete impact, confirmation, or references changed.',
        );
      }
      const draftIds =
        target.chapterIds.length === 0
          ? []
          : (
              database
                .prepare(
                  `SELECT id FROM drafts WHERE chapter_id IN (${placeholders(target.chapterIds)})`,
                )
                .all(...target.chapterIds) as { id: string }[]
            ).map((row) => row.id);
      if (target.chapterIds.length > 0) {
        database
          .prepare(
            `UPDATE chapters SET active_draft_id = NULL, final_version_id = NULL
              WHERE id IN (${placeholders(target.chapterIds)})`,
          )
          .run(...target.chapterIds);
      }
      if (draftIds.length > 0) {
        database
          .prepare(`DELETE FROM draft_patch_log WHERE draft_id IN (${placeholders(draftIds)})`)
          .run(...draftIds);
        database
          .prepare(`DELETE FROM draft_blocks WHERE draft_id IN (${placeholders(draftIds)})`)
          .run(...draftIds);
        database
          .prepare(`DELETE FROM drafts WHERE id IN (${placeholders(draftIds)})`)
          .run(...draftIds);
      }
      if (target.chapterIds.length > 0) {
        database
          .prepare(
            `DELETE FROM trash_entries
              WHERE entity_type = 'chapter' AND entity_id IN (${placeholders(target.chapterIds)})`,
          )
          .run(...target.chapterIds);
        database
          .prepare(`DELETE FROM chapters WHERE id IN (${placeholders(target.chapterIds)})`)
          .run(...target.chapterIds);
      }
      if (target.volumeIds.length > 0) {
        database
          .prepare(`DELETE FROM volumes WHERE id IN (${placeholders(target.volumeIds)})`)
          .run(...target.volumeIds);
      }
      database.prepare('DELETE FROM trash_entries WHERE id = ?').run(input.trashEntryId);
      this.#faultInjector?.('after-trash-delete');
      this.#faultInjector?.('before-commit');
      return TrashPermanentDeleteResultSchema.parse({
        deleted: true,
        trashEntryId: input.trashEntryId,
        backupId,
        impact,
      });
    });
  }

  #previewSplitInTransaction(
    database: DatabaseSync,
    input: ChapterSplitPreviewInput,
  ): StructureOperationPreview {
    return this.#previewWithDatabase(database).previewSplit(input);
  }

  #previewMergeInTransaction(
    database: DatabaseSync,
    input: ChaptersMergePreviewInput,
  ): StructureOperationPreview {
    return this.#previewWithDatabase(database).previewMerge(input);
  }

  #previewMoveInTransaction(
    database: DatabaseSync,
    input: CrossChapterMovePreviewInput,
  ): StructureOperationPreview {
    return this.#previewWithDatabase(database).previewMove(input);
  }

  #previewWithDatabase(database: DatabaseSync): StructureOperationService {
    const facade = {
      readProject: <Value>(
        _projectId: string,
        callback: (connection: DatabaseSync) => Value,
      ): Value => callback(database),
    };
    return new StructureOperationService(facade as unknown as ProjectWorkspaceService, {
      clock: this.#clock,
      idFactory: this.#idFactory,
    });
  }
}
