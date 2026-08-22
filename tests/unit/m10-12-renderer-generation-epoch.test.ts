import type { GenerationRun } from '@worldforge/contracts';
import { describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  refreshCandidateGenerationRun,
  type CandidateGenerationRefreshInput,
} from '../../apps/desktop/renderer/src/features/writing/candidate-generation-refresh.js';
import {
  loadCandidateList,
  type CandidateReviewLoader,
} from '../../apps/desktop/renderer/src/features/writing/candidate-review-loader.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function run(
  status: GenerationRun['status'] = 'running',
  options: {
    readonly outputTokens?: number | null;
    readonly resultRefs?: GenerationRun['resultRefs'];
  } = {},
): GenerationRun {
  return {
    runId: '00000000-0000-4000-8000-000000000301',
    stage: status === 'running' ? 'receiving_output' : 'completed',
    status,
    outputTokens: options.outputTokens ?? null,
    resultRefs: options.resultRefs ?? [],
  } as GenerationRun;
}

function bridge(
  getRun: ReturnType<typeof vi.fn>,
  list: ReturnType<typeof vi.fn> = vi.fn(async () => ({
    state: 'success',
    data: { candidates: [] },
  })),
): RendererBridgeAdapter {
  return {
    generation: { getRun },
    candidate: { list },
  } as unknown as RendererBridgeAdapter;
}

function refreshInput(
  activeRun: GenerationRun | null,
  getRun: ReturnType<typeof vi.fn>,
  options: {
    readonly list?: ReturnType<typeof vi.fn>;
    readonly loadCandidate?: ReturnType<typeof vi.fn>;
    readonly epoch?: { current: number };
  } = {},
) {
  const epoch = options.epoch ?? { current: 0 };
  const adapter = bridge(getRun, options.list);
  const loader = {
    bridge: adapter,
    projectId: 'project-a',
    chapterId: 'chapter-a',
    setCandidates: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as CandidateReviewLoader;
  const setters = {
    setActiveRun: vi.fn(),
    setGenerationStatus: vi.fn(),
    setCandidateId: vi.fn(),
    setActiveTaskId: vi.fn(),
  };
  const input: CandidateGenerationRefreshInput = {
    activeRun,
    bridge: adapter,
    projectId: 'project-a',
    loader,
    generationEpoch: epoch,
    loadCandidate: options.loadCandidate ?? vi.fn(async () => undefined),
    ...setters,
  };
  return { input, epoch, loader, ...setters };
}

describe('M10-12 Renderer生成刷新代次', () => {
  it('请求完成前代次失效时不提交旧候选列表', async () => {
    const pending = deferred<unknown>();
    const setCandidates = vi.fn();
    let current = true;
    const loader = {
      bridge: {
        candidate: {
          list: () => pending.promise,
        },
      } as unknown as RendererBridgeAdapter,
      projectId: 'project-a',
      chapterId: 'chapter-old',
      setCandidates,
      setStatus: vi.fn(),
    } as unknown as CandidateReviewLoader;

    const loading = loadCandidateList(loader, () => current);
    current = false;
    pending.resolve({
      state: 'success',
      data: { candidates: [{ candidateId: 'candidate-old' }] },
    });

    await expect(loading).resolves.toEqual([{ candidateId: 'candidate-old' }]);
    expect(setCandidates).not.toHaveBeenCalled();
  });

  it('没有活动Run时不读取桥接层', async () => {
    const getRun = vi.fn();
    const { input } = refreshInput(null, getRun);

    await refreshCandidateGenerationRun(input);

    expect(getRun).not.toHaveBeenCalled();
  });

  it('Run读取完成前代次变化时丢弃旧结果', async () => {
    const pending = deferred<unknown>();
    const getRun = vi.fn(() => pending.promise);
    const { input, epoch, setActiveRun, setActiveTaskId } = refreshInput(run(), getRun);

    const refreshing = refreshCandidateGenerationRun(input);
    epoch.current += 1;
    pending.resolve({ state: 'success', data: run('succeeded') });
    await refreshing;

    expect(setActiveRun).not.toHaveBeenCalled();
    expect(setActiveTaskId).not.toHaveBeenCalled();
  });

  it('Run读取失败时释放活动任务', async () => {
    const getRun = vi.fn(async () => ({
      state: 'failure',
      error: { code: 'COMMON_INTERNAL_999', message: 'failed' },
    }));
    const { input, setActiveTaskId } = refreshInput(run(), getRun);

    await refreshCandidateGenerationRun(input);

    expect(setActiveTaskId).toHaveBeenCalledWith(null);
  });

  it('运行中的Run只刷新状态并保留任务', async () => {
    const current = run('running');
    const getRun = vi.fn(async () => ({ state: 'success', data: current }));
    const { input, setActiveRun, setGenerationStatus, setActiveTaskId } = refreshInput(
      current,
      getRun,
    );

    await refreshCandidateGenerationRun(input);

    expect(setActiveRun).toHaveBeenCalledWith(current);
    expect(setGenerationStatus).toHaveBeenCalledWith('生成建议稿');
    expect(setActiveTaskId).not.toHaveBeenCalled();
  });

  it.each(['succeeded', 'failed', 'cancelled'] as const)(
    '%s终态无候选结果时刷新列表并释放任务',
    async (status) => {
      const terminal = run(status, { outputTokens: 42 });
      const list = vi.fn(async () => ({ state: 'success', data: { candidates: [] } }));
      const getRun = vi.fn(async () => ({ state: 'success', data: terminal }));
      const { input, setGenerationStatus, setActiveTaskId } = refreshInput(terminal, getRun, {
        list,
      });

      await refreshCandidateGenerationRun(input);

      expect(list).toHaveBeenCalledOnce();
      expect(setGenerationStatus).toHaveBeenCalledWith(
        status === 'succeeded' ? '已完成' : status === 'failed' ? '失败' : '已取消',
      );
      expect(setActiveTaskId).toHaveBeenCalledWith(null);
    },
  );

  it('终态候选存在时选择并加载对应文档', async () => {
    const candidateId = '00000000-0000-4000-8000-000000000302';
    const terminal = run('succeeded', {
      resultRefs: [{ resultType: 'candidate', resultId: candidateId, candidateKind: 'prose' }],
    });
    const list = vi.fn(async () => ({
      state: 'success',
      data: { candidates: [{ candidateId }] },
    }));
    const loadCandidate = vi.fn(async () => undefined);
    const getRun = vi.fn(async () => ({ state: 'success', data: terminal }));
    const { input, setCandidateId, setActiveTaskId } = refreshInput(terminal, getRun, {
      list,
      loadCandidate,
    });

    await refreshCandidateGenerationRun(input);

    expect(setCandidateId).toHaveBeenCalledWith(candidateId);
    expect(loadCandidate).toHaveBeenCalledWith(candidateId);
    expect(setActiveTaskId).toHaveBeenCalledWith(null);
  });

  it('列表加载期间代次变化时不选择候选或释放新任务', async () => {
    const candidateId = '00000000-0000-4000-8000-000000000303';
    const terminal = run('succeeded', {
      resultRefs: [{ resultType: 'candidate', resultId: candidateId, candidateKind: 'prose' }],
    });
    const pending = deferred<unknown>();
    const list = vi.fn(() => pending.promise);
    const getRun = vi.fn(async () => ({ state: 'success', data: terminal }));
    const { input, epoch, setCandidateId, setActiveTaskId } = refreshInput(terminal, getRun, {
      list,
    });

    const refreshing = refreshCandidateGenerationRun(input);
    await vi.waitFor(() => expect(list).toHaveBeenCalledOnce());
    epoch.current += 1;
    pending.resolve({ state: 'success', data: { candidates: [{ candidateId }] } });
    await refreshing;

    expect(setCandidateId).not.toHaveBeenCalled();
    expect(setActiveTaskId).not.toHaveBeenCalled();
  });

  it('候选文档加载期间代次变化时不释放新任务', async () => {
    const candidateId = '00000000-0000-4000-8000-000000000304';
    const terminal = run('succeeded', {
      resultRefs: [{ resultType: 'candidate', resultId: candidateId, candidateKind: 'prose' }],
    });
    const list = vi.fn(async () => ({
      state: 'success',
      data: { candidates: [{ candidateId }] },
    }));
    const pending = deferred<unknown>();
    const loadCandidate = vi.fn(() => pending.promise);
    const getRun = vi.fn(async () => ({ state: 'success', data: terminal }));
    const { input, epoch, setCandidateId, setActiveTaskId } = refreshInput(terminal, getRun, {
      list,
      loadCandidate,
    });

    const refreshing = refreshCandidateGenerationRun(input);
    await vi.waitFor(() => expect(loadCandidate).toHaveBeenCalledWith(candidateId));
    epoch.current += 1;
    pending.resolve(undefined);
    await refreshing;

    expect(setCandidateId).toHaveBeenCalledWith(candidateId);
    expect(setActiveTaskId).not.toHaveBeenCalled();
  });
});
