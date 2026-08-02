import { randomUUID } from 'node:crypto';

import {
  type ChapterSplitExecuteInput,
  type ChapterSplitPreviewInput,
  type ChaptersMergeExecuteInput,
  type ChaptersMergePreviewInput,
  type CrossChapterMoveExecuteInput,
  type CrossChapterMovePreviewInput,
  type StructureOperationPreview,
  type StructureOperationResult,
  type TrashPermanentDeleteInput,
  type TrashPermanentDeletePreview,
  type TrashPermanentDeletePreviewInput,
  type TrashPermanentDeleteResult,
} from '@worldforge/contracts';

import type { DatabaseClock } from '../database/index.js';
import type { ProjectWorkspaceService } from '../project-workspace.js';
import { StructureOperationExecutionService } from './structure-operation-execution-service.js';
import {
  systemClock,
  type StructureOperationServiceOptions,
} from './structure-operation-model.js';
import { StructureOperationPreviewService } from './structure-operation-preview-service.js';
import { StructureTrashOperationService } from './structure-trash-operation-service.js';

export class StructureOperationService {
  readonly #preview: StructureOperationPreviewService;
  readonly #execution: StructureOperationExecutionService;
  readonly #trash: StructureTrashOperationService;

  constructor(workspace: ProjectWorkspaceService, options: StructureOperationServiceOptions = {}) {
    const clock: DatabaseClock = options.clock ?? systemClock;
    const idFactory = options.idFactory ?? randomUUID;
    this.#preview = new StructureOperationPreviewService(workspace);
    this.#execution = new StructureOperationExecutionService(
      workspace,
      clock,
      idFactory,
      options.faultInjector,
    );
    this.#trash = new StructureTrashOperationService(workspace, options.faultInjector);
  }

  previewSplit(raw: ChapterSplitPreviewInput): StructureOperationPreview {
    return this.#preview.previewSplit(raw);
  }

  previewMerge(raw: ChaptersMergePreviewInput): StructureOperationPreview {
    return this.#preview.previewMerge(raw);
  }

  previewMove(raw: CrossChapterMovePreviewInput): StructureOperationPreview {
    return this.#preview.previewMove(raw);
  }

  previewPermanentDelete(raw: TrashPermanentDeletePreviewInput): TrashPermanentDeletePreview {
    return this.#trash.previewPermanentDelete(raw);
  }

  assertSplitExecutable(input: ChapterSplitExecuteInput): StructureOperationPreview {
    return this.#preview.assertSplitExecutable(input);
  }

  assertMergeExecutable(input: ChaptersMergeExecuteInput): StructureOperationPreview {
    return this.#preview.assertMergeExecutable(input);
  }

  assertMoveExecutable(input: CrossChapterMoveExecuteInput): StructureOperationPreview {
    return this.#preview.assertMoveExecutable(input);
  }

  assertPermanentDeleteExecutable(input: TrashPermanentDeleteInput): TrashPermanentDeletePreview {
    return this.#trash.assertPermanentDeleteExecutable(input);
  }

  executeSplit(
    requestId: string,
    raw: ChapterSplitExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    return this.#execution.executeSplit(requestId, raw, backupId);
  }

  executeMerge(
    requestId: string,
    raw: ChaptersMergeExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    return this.#execution.executeMerge(requestId, raw, backupId);
  }

  executeMove(
    requestId: string,
    raw: CrossChapterMoveExecuteInput,
    backupId: string,
  ): Promise<StructureOperationResult> {
    return this.#execution.executeMove(requestId, raw, backupId);
  }

  permanentDelete(
    requestId: string,
    raw: TrashPermanentDeleteInput,
    backupId: string,
  ): Promise<TrashPermanentDeleteResult> {
    return this.#trash.permanentDelete(requestId, raw, backupId);
  }
}
