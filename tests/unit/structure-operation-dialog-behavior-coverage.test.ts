import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Chapter,
  DraftDocument,
  StructureOperationPreview,
  Volume,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StructureOperationDialog } from '../../apps/desktop/renderer/src/features/structure/structure-operation-dialog.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  commandRun: vi.fn(),
  previewRun: vi.fn(),
  pickMultipleBlocks: vi.fn(),
  pickBlockAnchor: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeCommand: (refresh?: unknown) => ({
    pending: false,
    error: null,
    run: refresh ? controls.commandRun : controls.previewRun,
  }),
}));

vi.mock('../../apps/desktop/renderer/src/features/writing/draft-block-picker.js', () => ({
  useDraftBlockPicker: () => ({
    pickMultipleBlocks: controls.pickMultipleBlocks,
    pickBlockAnchor: controls.pickBlockAnchor,
    picker: null,
  }),
}));

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestRenderer {
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

interface CapturedOperations {
  removeVolume(volume: Volume): Promise<void>;
  removeChapter(chapter: Chapter): Promise<void>;
  splitChapter(chapter: Chapter): Promise<void>;
  mergeChapter(volume: Volume, chapter: Chapter, chapterIndex: number): Promise<void>;
  moveBlocks(volume: Volume, chapter: Chapter, chapterIndex: number): Promise<void>;
  moveVolumeUp(volume: Volume, previous: Volume): Promise<void>;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceChapterId = '22222222-2222-4222-8222-222222222222';
const targetChapterId = '33333333-3333-4333-8333-333333333333';
const sourceDraftId = '44444444-4444-4444-8444-444444444444';
const targetDraftId = '55555555-5555-4555-8555-555555555555';
const sourceVolumeId = '66666666-6666-4666-8666-666666666666';
const previousVolumeId = '77777777-7777-4777-8777-777777777777';
const activeRenderers: TestRenderer[] = [];

function chapter(id: string, title: string): Chapter {
  return contractInput<Chapter>({ id, title });
}

const sourceChapter = chapter(sourceChapterId, '第一章');
const targetChapter = chapter(targetChapterId, '第二章');

function volume(): Volume {
  return contractInput<Volume>({
    id: sourceVolumeId,
    title: '第一卷',
    chapters: [sourceChapter, targetChapter],
  });
}

function draft(id: string, chapterId: string, prefix: string): DraftDocument {
  return contractInput<DraftDocument>({
    draftId: id,
    chapterId,
    revision: 7,
    blocks: [
      { logicalBlockId: `${prefix}-1`, text: `${prefix}一`, locked: false },
      { logicalBlockId: `${prefix}-2`, text: `${prefix}二`, locked: false },
      { logicalBlockId: `${prefix}-3`, text: `${prefix}三`, locked: false },
    ],
  });
}

function preview(canExecute = true, planHash = 'plan-hash'): StructureOperationPreview {
  return contractInput<StructureOperationPreview>({
    canExecute,
    planHash,
    movedLogicalBlockIds: ['source-1'],
    lockedLogicalBlockIds: [],
    sourceBlockCount: 3,
    resultingSourceBlockCount: 2,
    targetBlockCount: 3,
    resultingTargetBlockCount: 4,
    warnings: [],
  });
}

function createBridge() {
  const deleteVolume = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: { id: sourceVolumeId } });
  const deleteChapter = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: { id: sourceChapterId } });
  const draftOpen = vi.fn().mockImplementation(({ chapterId: requestedChapterId }) => ({
    state: 'success',
    data:
      requestedChapterId === sourceChapterId
        ? draft(sourceDraftId, sourceChapterId, 'source')
        : draft(targetDraftId, targetChapterId, 'target'),
  }));
  const previewSplitChapter = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: preview(true, 'split-plan') });
  const splitChapter = vi
    .fn()
    .mockResolvedValue({
      state: 'success',
      data: { backupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
  const previewMergeChapters = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: preview(true, 'merge-plan') });
  const mergeChapters = vi
    .fn()
    .mockResolvedValue({
      state: 'success',
      data: { backupId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
  const previewMoveBlocks = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: preview(true, 'move-plan') });
  const moveBlocks = vi
    .fn()
    .mockResolvedValue({
      state: 'success',
      data: { backupId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    });
  const moveVolume = vi.fn().mockResolvedValue({ state: 'success', data: volume() });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      planning: {
        deleteVolume,
        deleteChapter,
        previewSplitChapter,
        splitChapter,
        previewMergeChapters,
        mergeChapters,
        previewMoveBlocks,
        moveBlocks,
        moveVolume,
      },
      draft: { open: draftOpen },
    }),
    deleteVolume,
    deleteChapter,
    draftOpen,
    previewSplitChapter,
    splitChapter,
    previewMergeChapters,
    mergeChapters,
    previewMoveBlocks,
    moveBlocks,
    moveVolume,
  };
}

async function renderOperations(options: {
  bridge: RendererBridgeAdapter;
  onBeforeWrite?: () => Promise<boolean>;
  onRefresh?: () => Promise<void>;
  onStatus?: (status: string) => void;
}): Promise<CapturedOperations> {
  let operations: CapturedOperations | null = null;
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(StructureOperationDialog, {
        bridge: options.bridge,
        projectId,
        onBeforeWrite: options.onBeforeWrite,
        onRefresh: options.onRefresh ?? vi.fn().mockResolvedValue(undefined),
        onStatus: options.onStatus,
        children: (value: CapturedOperations) => {
          operations = value;
          return null;
        },
      }),
    );
  });
  activeRenderers.push(renderer);
  if (!operations) throw new Error('Missing structure operations.');
  return operations;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controls.commandRun.mockReset();
  controls.previewRun.mockReset();
  for (const run of [controls.commandRun, controls.previewRun]) {
    run.mockImplementation(async (operation: () => Promise<unknown>) => {
      const outcome = (await operation()) as { state?: string; data?: unknown };
      return outcome.state === 'success' ? outcome.data : null;
    });
  }
  controls.pickMultipleBlocks.mockReset();
  controls.pickBlockAnchor.mockReset();
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StructureOperationDialog destructive-operation coverage', () => {
  it('never deletes when confirmation or pre-write saving is refused', async () => {
    const harness = createBridge();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValue(true);
    vi.stubGlobal('window', { confirm, prompt: vi.fn() });
    const beforeWrite = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const status = vi.fn();
    const operations = await renderOperations({
      bridge: harness.bridge,
      onBeforeWrite: beforeWrite,
      onStatus: status,
    });

    await operations.removeVolume(volume());
    expect(beforeWrite).not.toHaveBeenCalled();
    expect(harness.deleteVolume).not.toHaveBeenCalled();

    await operations.removeChapter(sourceChapter);
    expect(beforeWrite).toHaveBeenCalledOnce();
    expect(harness.deleteChapter).not.toHaveBeenCalled();

    await operations.removeVolume(volume());
    expect(harness.deleteVolume).toHaveBeenCalledWith({ projectId, volumeId: sourceVolumeId });
    expect(status).toHaveBeenLastCalledWith('卷已移入回收站。');
  });

  it('splits only after a valid block anchor, executable preview and final confirmation', async () => {
    const harness = createBridge();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const prompt = vi.fn().mockReturnValue('第二章（下）');
    vi.stubGlobal('window', { confirm, prompt });
    const beforeWrite = vi.fn().mockResolvedValue(true);
    const status = vi.fn();
    const operations = await renderOperations({
      bridge: harness.bridge,
      onBeforeWrite: beforeWrite,
      onStatus: status,
    });

    controls.pickBlockAnchor.mockResolvedValueOnce(null);
    await operations.splitChapter(sourceChapter);
    expect(harness.previewSplitChapter).not.toHaveBeenCalled();

    controls.pickBlockAnchor.mockResolvedValueOnce('source-2');
    harness.previewSplitChapter.mockResolvedValueOnce({
      state: 'success',
      data: preview(false, 'blocked-plan'),
    });
    await operations.splitChapter(sourceChapter);
    expect(harness.splitChapter).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();

    controls.pickBlockAnchor.mockResolvedValueOnce('source-2');
    await operations.splitChapter(sourceChapter);
    expect(confirm).toHaveBeenCalledOnce();
    expect(harness.splitChapter).not.toHaveBeenCalled();

    controls.pickBlockAnchor.mockResolvedValueOnce('source-2');
    await operations.splitChapter(sourceChapter);
    expect(harness.splitChapter).toHaveBeenCalledWith({
      projectId,
      chapterId: sourceChapterId,
      draftId: sourceDraftId,
      baseRevision: 7,
      splitAfterLogicalBlockId: 'source-2',
      newChapterTitle: '第二章（下）',
      planHash: 'split-plan',
    });
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('章节已拆分 · 恢复点'));
  });

  it('does not merge when either draft cannot be read and preserves revision provenance on success', async () => {
    const harness = createBridge();
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true), prompt: vi.fn() });
    const status = vi.fn();
    const operations = await renderOperations({
      bridge: harness.bridge,
      onBeforeWrite: vi.fn().mockResolvedValue(true),
      onStatus: status,
    });

    harness.draftOpen
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'DRAFT_NOT_FOUND', message: '源稿不存在。', retryable: false },
      })
      .mockResolvedValueOnce({
        state: 'success',
        data: draft(targetDraftId, targetChapterId, 'target'),
      });
    await operations.mergeChapter(volume(), sourceChapter, 0);
    expect(harness.previewMergeChapters).not.toHaveBeenCalled();
    expect(harness.mergeChapters).not.toHaveBeenCalled();
    expect(status).toHaveBeenLastCalledWith('合并预览读取正文失败，未修改项目。');

    harness.draftOpen.mockImplementation(({ chapterId: requestedChapterId }) => ({
      state: 'success',
      data:
        requestedChapterId === sourceChapterId
          ? draft(sourceDraftId, sourceChapterId, 'source')
          : draft(targetDraftId, targetChapterId, 'target'),
    }));
    await operations.mergeChapter(volume(), sourceChapter, 0);
    expect(harness.previewMergeChapters).toHaveBeenCalledWith({
      projectId,
      sourceChapterId,
      sourceDraftId,
      sourceBaseRevision: 7,
      targetChapterId,
      targetDraftId,
      targetBaseRevision: 7,
    });
    expect(harness.mergeChapters).toHaveBeenCalledWith({
      projectId,
      sourceChapterId,
      sourceDraftId,
      sourceBaseRevision: 7,
      targetChapterId,
      targetDraftId,
      targetBaseRevision: 7,
      planHash: 'merge-plan',
    });
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('章节已合并 · 恢复点'));
  });

  it('requires explicit block selection and insertion anchor before cross-chapter movement', async () => {
    const harness = createBridge();
    vi.stubGlobal('window', { confirm: vi.fn().mockReturnValue(true), prompt: vi.fn() });
    const status = vi.fn();
    const operations = await renderOperations({
      bridge: harness.bridge,
      onBeforeWrite: vi.fn().mockResolvedValue(true),
      onStatus: status,
    });

    controls.pickMultipleBlocks.mockResolvedValueOnce(null);
    await operations.moveBlocks(volume(), sourceChapter, 0);
    expect(harness.previewMoveBlocks).not.toHaveBeenCalled();

    controls.pickMultipleBlocks.mockResolvedValueOnce(['source-1']);
    controls.pickBlockAnchor.mockResolvedValueOnce(undefined);
    await operations.moveBlocks(volume(), sourceChapter, 0);
    expect(harness.previewMoveBlocks).not.toHaveBeenCalled();

    controls.pickMultipleBlocks.mockResolvedValueOnce(['source-1', 'source-2']);
    controls.pickBlockAnchor.mockResolvedValueOnce(null);
    await operations.moveBlocks(volume(), sourceChapter, 0);
    expect(harness.previewMoveBlocks).toHaveBeenCalledWith({
      projectId,
      sourceChapterId,
      sourceDraftId,
      sourceBaseRevision: 7,
      targetChapterId,
      targetDraftId,
      targetBaseRevision: 7,
      logicalBlockIds: ['source-1', 'source-2'],
      afterTargetLogicalBlockId: null,
    });
    expect(harness.moveBlocks).toHaveBeenCalledWith({
      projectId,
      sourceChapterId,
      sourceDraftId,
      sourceBaseRevision: 7,
      targetChapterId,
      targetDraftId,
      targetBaseRevision: 7,
      logicalBlockIds: ['source-1', 'source-2'],
      afterTargetLogicalBlockId: null,
      planHash: 'move-plan',
    });
    expect(status).toHaveBeenLastCalledWith(expect.stringContaining('正文段落已跨章移动'));

    const previous = contractInput<Volume>({ id: previousVolumeId, title: '序卷', chapters: [] });
    await operations.moveVolumeUp(volume(), previous);
    expect(harness.moveVolume).toHaveBeenCalledWith({
      projectId,
      volumeId: sourceVolumeId,
      placement: { kind: 'before', siblingId: previousVolumeId },
    });
    expect(status).toHaveBeenLastCalledWith('卷顺序已更新。');
  });
});
