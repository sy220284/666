import {
  ChapterSplitExecuteInputSchema,
  ChapterSplitPreviewInputSchema,
  ChaptersMergeExecuteInputSchema,
  ChaptersMergePreviewInputSchema,
  CrossChapterMoveExecuteInputSchema,
  CrossChapterMovePreviewInputSchema,
  type ChapterSplitExecuteInput,
  type ChapterSplitPreviewInput,
  type ChaptersMergeExecuteInput,
  type ChaptersMergePreviewInput,
  type CrossChapterMoveExecuteInput,
  type CrossChapterMovePreviewInput,
  type StructureOperationPreview,
} from '@worldforge/contracts';

import { activeDraft, readDraftBlocks } from '../candidate-state.js';
import { collectLockGuardViolations } from '../draft-lock-guard.js';
import { ProjectStructureError } from '../project-structure.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import {
  assertExecutable,
  assertRevision,
  chapterLocation,
  characters,
  hashInputBlock,
  makePreview,
  mergeInput,
  moveInput,
  splitInput,
} from './structure-operation-model.js';

export class StructureOperationPreviewService {
  readonly #workspace: ProjectWorkspaceService;

  constructor(workspace: ProjectWorkspaceService) {
    this.#workspace = workspace;
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
      const sourceAfter = blocks.slice(0, splitIndex + 1);
      const locked = [
        ...new Set(
          collectLockGuardViolations(blocks, sourceAfter).map(
            (violation) => violation.logicalBlockId,
          ),
        ),
      ];
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
      const locked = [
        ...new Set(
          collectLockGuardViolations(sourceBlocks, []).map((violation) => violation.logicalBlockId),
        ),
      ];
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
      const sourceAfter = sourceBlocks.filter((block) => !selected.has(block.logicalBlockId));
      const insertionIndex =
        input.afterTargetLogicalBlockId === null
          ? 0
          : targetBlocks.findIndex(
              (block) => block.logicalBlockId === input.afterTargetLogicalBlockId,
            ) + 1;
      const targetAfter = [
        ...targetBlocks.slice(0, insertionIndex),
        ...moved,
        ...targetBlocks.slice(insertionIndex),
      ];
      const locked = [
        ...new Set(
          [
            ...collectLockGuardViolations(sourceBlocks, sourceAfter),
            ...collectLockGuardViolations(targetBlocks, targetAfter),
          ].map((violation) => violation.logicalBlockId),
        ),
      ];
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
}
