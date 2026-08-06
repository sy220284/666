import type { CandidatePreview } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  loadCandidateDocument,
  loadCandidateList,
  loadCandidatePreview,
  loadCandidateUndo,
  type CandidateReviewLoader,
} from '../../apps/desktop/renderer/src/features/writing/candidate-review-loader.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });
const failure = (code = 'COMMON_INTERNAL_999') =>
  contractInput({
    state: 'failure' as const,
    error: { code, message: 'failure', retryable: true },
  });

function setupLoader(bridge: RendererBridgeAdapter) {
  const setters = {
    setCandidates: vi.fn(),
    setPreview: vi.fn(),
    setUndoPreview: vi.fn(),
    setSelectedDocument: vi.fn(),
    setSelectedRun: vi.fn(),
    setSelectionMode: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setSelectedBeats: vi.fn(),
    setSelectedSkeletonId: vi.fn(),
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    setConflicts: vi.fn(),
    setStatus: vi.fn(),
    setPending: vi.fn(),
  };
  const loader = contractInput<CandidateReviewLoader>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    documentRequest: { current: 0 },
    previewRequest: { current: null },
    ...setters,
  });
  return { loader, ...setters };
}

function previewCandidate(overrides: Record<string, unknown> = {}): CandidatePreview {
  return contractInput<CandidatePreview>({
    candidate: {
      candidateId: 'candidate-a',
      status: 'pending',
      completeness: 'partial',
      baseDraftRevision: 4,
      blocks: [
        { candidateBlockId: 'block-a', beatId: 'beat-a' },
        { candidateBlockId: 'block-b', beatId: null },
      ],
      ...overrides,
    },
  });
}

describe('Writing候选加载分支', () => {
  it('读取列表时区分成功、失败与取消', async () => {
    const successContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: {
          list: vi.fn(async () => success({ candidates: [{ candidateId: 'a' }] })),
        },
      }),
    );
    expect(await loadCandidateList(successContext.loader)).toEqual([{ candidateId: 'a' }]);
    expect(successContext.setCandidates).toHaveBeenCalledWith([{ candidateId: 'a' }]);

    const failureContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: { list: vi.fn(async () => failure()) },
      }),
    );
    expect(await loadCandidateList(failureContext.loader)).toEqual([]);
    expect(failureContext.setStatus).toHaveBeenCalledWith(
      expect.stringContaining('建议稿列表读取失败'),
    );

    const cancelledContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: {
          list: vi.fn(async () => ({ state: 'cancelled' as const, generation: 1 })),
        },
      }),
    );
    expect(await loadCandidateList(cancelledContext.loader)).toEqual([]);
    expect(cancelledContext.setStatus).not.toHaveBeenCalled();
  });

  it('仅为已采用候选加载可撤销预览与冲突', async () => {
    const pendingContext = setupLoader(contractInput<RendererBridgeAdapter>({}));
    expect(await loadCandidateUndo(pendingContext.loader, previewCandidate())).toBe(false);
    expect(pendingContext.setUndoPreview).toHaveBeenCalledWith(null);

    const lookupFailure = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidateAction: { findUndoRecord: vi.fn(async () => failure()) },
      }),
    );
    expect(
      await loadCandidateUndo(lookupFailure.loader, previewCandidate({ status: 'accepted' })),
    ).toBe(false);

    const undo = contractInput({
      canUndo: true,
      conflictSet: { conflicts: [{ kind: 'revision' }] },
    });
    const successContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidateAction: {
          findUndoRecord: vi.fn(async () => success({ applyRecordId: 'apply-a' })),
          previewUndo: vi.fn(async () => success(undo)),
        },
      }),
    );
    expect(
      await loadCandidateUndo(successContext.loader, previewCandidate({ status: 'accepted' })),
    ).toBe(true);
    expect(successContext.setUndoPreview).toHaveBeenCalledWith(undo);
    expect(successContext.setConflicts).toHaveBeenCalledWith([{ kind: 'revision' }]);
  });

  it('准备部分候选的块与场景选择，并生成采用提示', async () => {
    const preview = previewCandidate();
    const context = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidateAction: { preview: vi.fn(async () => success(preview)) },
      }),
    );
    await loadCandidatePreview(context.loader, 'candidate-a');
    expect(context.setPending).toHaveBeenNthCalledWith(1, true);
    expect(context.setPending).toHaveBeenLastCalledWith(false);
    expect(context.setPreview).toHaveBeenCalledWith(preview);
    expect(context.setSelectionMode).toHaveBeenCalledWith('blocks');
    expect(context.setSelectedBlocks).toHaveBeenCalledWith(new Set(['block-a', 'block-b']));
    expect(context.setSelectedBeats).toHaveBeenCalledWith(new Set(['beat-a']));
    expect(context.setStatus).toHaveBeenLastCalledWith('已准备采用 · 基础保存序号 4');
  });

  it('为取消、替代与失败的差异预览提供确定提示', async () => {
    const outcomes = [
      [failure('COMMON_CANCELLED_004'), '差异计算已取消。'],
      [{ state: 'cancelled' as const, generation: 1 }, '差异计算已取消。'],
      [{ state: 'stale' as const, generation: 1 }, '预览已被更新请求替代。'],
      [failure(), '预览失败'],
    ] as const;
    for (const [outcome, expected] of outcomes) {
      const context = setupLoader(
        contractInput<RendererBridgeAdapter>({
          candidateAction: { preview: vi.fn(async () => outcome) },
        }),
      );
      await loadCandidatePreview(context.loader, 'candidate-a');
      expect(context.setStatus).toHaveBeenLastCalledWith(expect.stringContaining(expected));
    }
  });

  it('读取骨架陈旧状态、Generation失败和候选读取失败', async () => {
    const staleSkeleton = contractInput({
      candidateId: 'skeleton-a',
      candidateType: 'skeleton',
      generationRunId: null,
      sourceState: 'stale',
      skeletonRevision: 2,
      structuredPayload: { endingHook: '钩子', tendency: '倾向' },
    });
    const skeletonContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: { get: vi.fn(async () => success(staleSkeleton)) },
        candidateAction: {
          cancelPreview: vi.fn(async () => success({ cancelled: true })),
        },
      }),
    );
    await loadCandidateDocument(skeletonContext.loader, 'skeleton-a');
    expect(skeletonContext.setStatus).toHaveBeenLastCalledWith(
      '骨架来源已变化；进入T1前需要明确确认或重新生成。',
    );

    const prose = contractInput({
      candidateId: 'prose-a',
      candidateType: 'chapter',
      generationRunId: 'run-a',
    });
    const proseContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: { get: vi.fn(async () => success(prose)) },
        generation: { getRun: vi.fn(async () => failure()) },
        candidateAction: {
          cancelPreview: vi.fn(async () => success({ cancelled: true })),
          preview: vi.fn(async () => ({ state: 'stale' as const, generation: 1 })),
        },
      }),
    );
    await loadCandidateDocument(proseContext.loader, 'prose-a');
    expect(proseContext.setSelectedRun).toHaveBeenCalledWith(null);

    const failedContext = setupLoader(
      contractInput<RendererBridgeAdapter>({
        candidate: { get: vi.fn(async () => failure()) },
        candidateAction: {
          cancelPreview: vi.fn(async () => success({ cancelled: true })),
        },
      }),
    );
    await loadCandidateDocument(failedContext.loader, 'missing');
    expect(failedContext.setStatus).toHaveBeenLastCalledWith(
      expect.stringContaining('建议稿读取失败'),
    );
  });
});
