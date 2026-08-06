import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { discardCandidate } from '../../apps/desktop/renderer/src/features/writing/candidate-preview-actions.js';
import {
  loadCandidateDocument,
  type CandidateReviewLoader,
} from '../../apps/desktop/renderer/src/features/writing/candidate-review-loader.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const success = <Data>(data: Data) => ({ state: 'success' as const, data });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function skeleton(candidateId: string) {
  return contractInput({
    candidateId,
    candidateType: 'skeleton',
    generationRunId: null,
    sourceState: 'fresh',
    skeletonRevision: 1,
    structuredPayload: { endingHook: '门后是谁', tendency: '强化冲突' },
  });
}

function prose(candidateId: string, generationRunId: string | null = null) {
  return contractInput({
    candidateId,
    candidateType: 'chapter',
    generationRunId,
  });
}

function setupLoader(bridge: RendererBridgeAdapter) {
  const setPending = vi.fn();
  const setPreview = vi.fn();
  const setSelectedDocument = vi.fn();
  const setSelectedRun = vi.fn();
  const previewRequest = { current: null as string | null };
  const loader = contractInput<CandidateReviewLoader>({
    bridge,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    commandPrefix: 'writing:project-a:chapter-a:',
    documentRequest: { current: 0 },
    previewRequest,
    setCandidates: vi.fn(),
    setPreview,
    setUndoPreview: vi.fn(),
    setSelectedDocument,
    setSelectedRun,
    setSelectionMode: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setSelectedBeats: vi.fn(),
    setSelectedSkeletonId: vi.fn(),
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    setConflicts: vi.fn(),
    setStatus: vi.fn(),
    setPending,
  });
  return {
    loader,
    previewRequest,
    setPending,
    setPreview,
    setSelectedDocument,
    setSelectedRun,
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { confirm: vi.fn(() => true) },
  });
});

describe('Writing候选并发与只读回归', () => {
  it('忽略较早返回的候选文档，保持最后一次选择', async () => {
    const first = deferred<ReturnType<typeof success>>();
    const get = vi.fn(({ candidateId }: { candidateId: string }) =>
      candidateId === 'candidate-a'
        ? first.promise
        : Promise.resolve(success(skeleton('candidate-b'))),
    );
    const bridge = contractInput<RendererBridgeAdapter>({
      candidate: { get },
      candidateAction: {
        cancelPreview: vi.fn(async () => success({ cancelled: true })),
      },
    });
    const context = setupLoader(bridge);

    const firstLoad = loadCandidateDocument(context.loader, 'candidate-a');
    await loadCandidateDocument(context.loader, 'candidate-b');
    first.resolve(success(prose('candidate-a')));
    await firstLoad;

    expect(context.setSelectedDocument).toHaveBeenCalledTimes(1);
    expect(context.setSelectedDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ candidateId: 'candidate-b' }),
    );
  });

  it('切换候选时废弃并取消旧差异预览', async () => {
    const cancelPreview = vi.fn(async () => success({ cancelled: true }));
    const bridge = contractInput<RendererBridgeAdapter>({
      candidate: { get: vi.fn(async () => success(skeleton('candidate-b'))) },
      candidateAction: { cancelPreview },
    });
    const context = setupLoader(bridge);
    context.previewRequest.current = 'preview-a';

    await loadCandidateDocument(context.loader, 'candidate-b');

    expect(cancelPreview).toHaveBeenCalledWith('preview-a');
    expect(context.previewRequest.current).toBeNull();
    expect(context.setPending).toHaveBeenNthCalledWith(1, true);
    expect(context.setPending).toHaveBeenLastCalledWith(false);
    expect(context.setPreview).toHaveBeenCalledWith(null);
  });

  it('忽略旧候选延迟返回的Generation来源', async () => {
    const run = deferred<ReturnType<typeof success>>();
    const get = vi.fn(async ({ candidateId }: { candidateId: string }) =>
      success(
        candidateId === 'candidate-a' ? prose('candidate-a', 'run-a') : skeleton('candidate-b'),
      ),
    );
    const getRun = vi.fn(() => run.promise);
    const bridge = contractInput<RendererBridgeAdapter>({
      candidate: { get },
      generation: { getRun },
      candidateAction: {
        cancelPreview: vi.fn(async () => success({ cancelled: true })),
      },
    });
    const context = setupLoader(bridge);

    const firstLoad = loadCandidateDocument(context.loader, 'candidate-a');
    await Promise.resolve();
    await Promise.resolve();
    await loadCandidateDocument(context.loader, 'candidate-b');
    run.resolve(success(contractInput({ runId: 'run-a' })));
    await firstLoad;

    expect(context.setSelectedRun).toHaveBeenCalledTimes(1);
    expect(context.setSelectedRun).toHaveBeenLastCalledWith(null);
    expect(context.setSelectedDocument).toHaveBeenLastCalledWith(
      expect.objectContaining({ candidateId: 'candidate-b' }),
    );
  });

  it('只读会话不确认也不发起候选丢弃写请求', async () => {
    const discard = vi.fn(async () => success({ status: 'discarded', resolvedAt: null }));
    const bridge = contractInput<RendererBridgeAdapter>({
      candidate: { discard },
    });

    await discardCandidate(
      contractInput({
        bridge,
        projectId: 'project-a',
        chapterId: 'chapter-a',
        commandPrefix: 'writing:project-a:chapter-a:',
        readOnly: true,
        refreshList: vi.fn(async () => []),
        onDraftReplace: vi.fn(),
        setPreview: vi.fn(),
        setUndoPreview: vi.fn(),
        setSelectedDocument: vi.fn(),
        setSkeletonEndingHook: vi.fn(),
        setSkeletonTendency: vi.fn(),
        setConflicts: vi.fn(),
        setStatus: vi.fn(),
        setPending: vi.fn(),
      }),
      contractInput({ candidateId: 'candidate-a', status: 'pending' }),
    );

    expect(window.confirm).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});
