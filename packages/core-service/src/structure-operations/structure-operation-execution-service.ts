import type { DatabaseSync } from 'node:sqlite';

import {
  ChapterSplitExecuteInputSchema,
  ChaptersMergeExecuteInputSchema,
  CrossChapterMoveExecuteInputSchema,
  StructureOperationResultSchema,
  type ChapterSplitExecuteInput,
  type ChapterSplitPreviewInput,
  type ChaptersMergeExecuteInput,
  type ChaptersMergePreviewInput,
  type CrossChapterMoveExecuteInput,
  type CrossChapterMovePreviewInput,
  type StructureOperationPreview,
  type StructureOperationResult,
} from '@worldforge/contracts';
import { planOrderKey, type OrderedSibling } from '@worldforge/domain';

import { activeDraft, draftDocument, readDraftBlocks } from '../candidate-state.js';
import type { DatabaseClock } from '../database/index.js';
import { readStructure } from '../project-structure.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  assertExecutable,
  chapterLocation,
  cloneBlocks,
  derivedRequestId,
  mergeInput,
  moveInput,
  persistRevisionedDraft,
  splitInput,
  type StructureOperationServiceOptions,
} from './structure-operation-model.js';
import { StructureOperationPreviewService } from './structure-operation-preview-service.js';
import { sqliteResult } from '../database/sqlite-result.js';

export class StructureOperationExecutionService {
  readonly #workspace: ProjectWorkspaceService;
  readonly #clock: DatabaseClock;
  readonly #idFactory: () => string;
  readonly #faultInjector: StructureOperationServiceOptions['faultInjector'];

  constructor(
    workspace: ProjectWorkspaceService,
    clock: DatabaseClock,
    idFactory: () => string,
    faultInjector: StructureOperationServiceOptions['faultInjector'],
  ) {
    this.#workspace = workspace;
    this.#clock = clock;
    this.#idFactory = idFactory;
    this.#faultInjector = faultInjector;
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

      const siblings = sqliteResult<OrderedSibling[]>(
        database
          .prepare(
            'SELECT id, order_key AS orderKey FROM chapters WHERE volume_id = ? AND deleted_at IS NULL ORDER BY order_key, id',
          )
          .all(sourceLocation.volumeId),
      );
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

  #previewWithDatabase(database: DatabaseSync): StructureOperationPreviewService {
    const facade = {
      readProject: <Value>(
        _projectId: string,
        callback: (connection: DatabaseSync) => Value,
      ): Value => callback(database),
    };
    return new StructureOperationPreviewService(facade as unknown as ProjectWorkspaceService);
  }
}
