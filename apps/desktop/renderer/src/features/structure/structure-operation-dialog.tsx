import type { ReactNode } from 'react';

import type { Chapter, Volume } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../../bridge/renderer-bridge-adapter.js';
import { useBridgeCommand, type BridgeCommand } from '../../bridge/use-bridge-resource.js';
import { previewMessage } from './structure-formatters.js';

interface StructureOperationDialogProps {
  readonly bridge: RendererBridgeAdapter;
  readonly projectId: string;
  readonly onBeforeWrite: (() => Promise<boolean>) | undefined;
  readonly onRefresh: () => Promise<void>;
  readonly onStatus: ((status: string) => void) | undefined;
  readonly children: (operations: StructureOperations) => ReactNode;
}

interface StructureOperations {
  readonly command: BridgeCommand;
  readonly previewCommand: BridgeCommand;
  readonly mergeChapter: (volume: Volume, chapter: Chapter, chapterIndex: number) => Promise<void>;
  readonly moveBlocks: (volume: Volume, chapter: Chapter, chapterIndex: number) => Promise<void>;
  readonly moveVolumeUp: (volume: Volume, previous: Volume) => Promise<void>;
  readonly removeChapter: (chapter: Chapter) => Promise<void>;
  readonly removeVolume: (volume: Volume) => Promise<void>;
  readonly splitChapter: (chapter: Chapter) => Promise<void>;
}

export function StructureOperationDialog({
  bridge,
  projectId,
  onBeforeWrite,
  onRefresh,
  onStatus,
  children,
}: StructureOperationDialogProps) {
  const command = useBridgeCommand(onRefresh);
  const previewCommand = useBridgeCommand();

  const removeVolume = async (volume: Volume): Promise<void> => {
    if (!window.confirm(`将“${volume.title}”移入回收站？`)) return;
    if (onBeforeWrite && !(await onBeforeWrite())) return;
    const result = await command.run(() =>
      bridge.planning.deleteVolume({ projectId, volumeId: volume.id }),
    );
    if (result) onStatus?.('卷已移入回收站。');
  };

  const removeChapter = async (chapter: Chapter): Promise<void> => {
    if (!window.confirm(`将“${chapter.title}”移入回收站？`)) return;
    if (onBeforeWrite && !(await onBeforeWrite())) return;
    const result = await command.run(() =>
      bridge.planning.deleteChapter({ projectId, chapterId: chapter.id }),
    );
    if (result) onStatus?.('章节已移入回收站。');
  };

  const splitChapter = async (chapter: Chapter): Promise<void> => {
    const title = window.prompt('新章节标题：', `${chapter.title}（下）`)?.trim();
    if (!title || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const draft = await previewCommand.run(() =>
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
    );
    if (!draft || draft.blocks.length < 2) {
      onStatus?.('章节至少需要两个正文段落才能拆分。');
      return;
    }
    const rawPosition = window.prompt(
      `在第几个正文段落后拆分？请输入1—${draft.blocks.length - 1}：`,
      String(Math.max(1, Math.floor(draft.blocks.length / 2))),
    );
    const position = Number(rawPosition);
    const splitAfter = Number.isInteger(position) ? draft.blocks[position - 1] : undefined;
    if (!splitAfter || position < 1 || position >= draft.blocks.length) {
      onStatus?.('拆分位置无效，未修改项目。');
      return;
    }
    const input = {
      projectId,
      chapterId: chapter.id,
      draftId: draft.draftId,
      baseRevision: draft.revision,
      splitAfterLogicalBlockId: splitAfter.logicalBlockId,
      newChapterTitle: title,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewSplitChapter(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`${previewMessage(preview)}\n确认执行并创建恢复点？`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.splitChapter({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`章节已拆分 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  const mergeChapter = async (
    volume: Volume,
    chapter: Chapter,
    chapterIndex: number,
  ): Promise<void> => {
    const target = volume.chapters[chapterIndex + 1] ?? volume.chapters[chapterIndex - 1];
    if (!target || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const [sourceOutcome, targetOutcome] = await Promise.all([
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
      bridge.draft.open({ projectId, chapterId: target.id }, { mode: 'replace' }),
    ]);
    if (sourceOutcome.state !== 'success' || targetOutcome.state !== 'success') {
      onStatus?.('合并预览读取正文失败，未修改项目。');
      return;
    }
    const sourceDraft = sourceOutcome.data;
    const targetDraft = targetOutcome.data;
    const input = {
      projectId,
      sourceChapterId: chapter.id,
      sourceDraftId: sourceDraft.draftId,
      sourceBaseRevision: sourceDraft.revision,
      targetChapterId: target.id,
      targetDraftId: targetDraft.draftId,
      targetBaseRevision: targetDraft.revision,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewMergeChapters(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`将“${chapter.title}”合并到“${target.title}”？\n${previewMessage(preview)}`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.mergeChapters({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`章节已合并 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  const moveBlocks = async (
    volume: Volume,
    chapter: Chapter,
    chapterIndex: number,
  ): Promise<void> => {
    const target = volume.chapters[chapterIndex + 1] ?? volume.chapters[chapterIndex - 1];
    if (!target || (onBeforeWrite && !(await onBeforeWrite()))) return;
    const [sourceOutcome, targetOutcome] = await Promise.all([
      bridge.draft.open({ projectId, chapterId: chapter.id }, { mode: 'replace' }),
      bridge.draft.open({ projectId, chapterId: target.id }, { mode: 'replace' }),
    ]);
    if (sourceOutcome.state !== 'success' || targetOutcome.state !== 'success') {
      onStatus?.('正文段落移动预览读取正文失败，未修改项目。');
      return;
    }
    const sourceDraft = sourceOutcome.data;
    const targetDraft = targetOutcome.data;
    const rawIndices = window.prompt(
      `选择从“${chapter.title}”移动的正文段落序号（逗号分隔，1—${sourceDraft.blocks.length}）：`,
      '1',
    );
    if (!rawIndices) return;
    const indices = [...new Set(rawIndices.split(/[,，\s]+/u).map(Number))];
    const logicalBlockIds = indices.flatMap((index) => {
      const block = sourceDraft.blocks[index - 1];
      return block ? [block.logicalBlockId] : [];
    });
    if (logicalBlockIds.length !== indices.length) {
      onStatus?.('正文段落序号无效，未修改项目。');
      return;
    }
    const afterRaw = window.prompt(
      `插入到“${target.title}”第几个段落之后？0表示开头，最多${targetDraft.blocks.length}：`,
      String(targetDraft.blocks.length),
    );
    const afterIndex = Number(afterRaw);
    if (!Number.isInteger(afterIndex) || afterIndex < 0 || afterIndex > targetDraft.blocks.length)
      return;
    const input = {
      projectId,
      sourceChapterId: chapter.id,
      sourceDraftId: sourceDraft.draftId,
      sourceBaseRevision: sourceDraft.revision,
      targetChapterId: target.id,
      targetDraftId: targetDraft.draftId,
      targetBaseRevision: targetDraft.revision,
      logicalBlockIds,
      afterTargetLogicalBlockId: targetDraft.blocks[afterIndex - 1]?.logicalBlockId ?? null,
    };
    const preview = await previewCommand.run(() => bridge.planning.previewMoveBlocks(input));
    if (!preview) return;
    onStatus?.(previewMessage(preview));
    if (
      !preview.canExecute ||
      !window.confirm(`${previewMessage(preview)}\n确认移动并创建恢复点？`)
    )
      return;
    const result = await command.run(() =>
      bridge.planning.moveBlocks({ ...input, planHash: preview.planHash }),
    );
    if (result) onStatus?.(`正文段落已跨章移动 · 恢复点 ${result.backupId.slice(0, 8)}…`);
  };

  const moveVolumeUp = async (volume: Volume, previous: Volume): Promise<void> => {
    const result = await command.run(() =>
      bridge.planning.moveVolume({
        projectId,
        volumeId: volume.id,
        placement: { kind: 'before', siblingId: previous.id },
      }),
    );
    if (result) onStatus?.('卷顺序已更新。');
  };

  return children({
    command,
    previewCommand,
    mergeChapter,
    moveBlocks,
    moveVolumeUp,
    removeChapter,
    removeVolume,
    splitChapter,
  });
}
