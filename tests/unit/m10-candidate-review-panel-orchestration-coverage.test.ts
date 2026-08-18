import { createRequire } from 'node:module';

import type {
  CandidateSummary,
  Chapter,
  DraftDocument,
  GenerationIntent,
  GenerationRun,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

interface TestInstance {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
}

interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-333333333333';
const runId = '44444444-4444-4444-8444-444444444444';
const taskId = '55555555-5555-4555-8555-555555555555';

const chapter = contractInput<Chapter>({ id: chapterId, title: '第一章' });
const draft = contractInput<DraftDocument>({
  draftId: '66666666-6666-4666-8666-666666666666',
  revision: 7,
  blocks: [],
});
const project = contractInput<ProjectWorkspaceSummary>({
  projectId,
  databaseMode: 'read-write',
});
const candidate = contractInput<CandidateSummary>({
  candidateId,
  candidateType: 'full',
  status: 'pending',
});
const run = contractInput<GenerationRun>({
  runId,
  taskId,
  projectId,
  chapterId,
  status: 'running',
  stage: 'calling_model',
  outputTokens: null,
  resultRefs: [],
});
const intent = contractInput<GenerationIntent>({ taskType: 'chapter' });

const mocks = {
  setProviderId: vi.fn(),
  setMergeMappingMode: vi.fn(),
  invalidatePrefix: vi.fn(),
  loadCandidateList: vi.fn(),
  loadCandidateUndo: vi.fn(),
  loadCandidateDocument: vi.fn(),
  refreshCandidateGenerationRun: vi.fn(async () => undefined),
  buildCandidateSelection: vi.fn(() => ({ mode: 'all' })),
  candidateReviewCollections: vi.fn(() => ({
    skeletonCandidates: [],
    proseCandidates: [],
    reviewGroups: [],
  })),
  toggleSelectionSet: vi.fn((current: Set<string>, id: string, included: boolean) => {
    const next = new Set(current);
    if (included) next.add(id);
    else next.delete(id);
    return next;
  }),
  cancelCandidatePreview: vi.fn(async () => true),
  discardCandidate: vi.fn(async () => undefined),
  applyCandidate: vi.fn(async () => undefined),
  undoCandidate: vi.fn(async () => undefined),
  saveSkeletonCandidate: vi.fn(async () => undefined),
  startGenerationTask: vi.fn(async () => undefined),
  cancelGeneration: vi.fn(async () => undefined),
  decidePartial: vi.fn(async () => undefined),
  taskSubscription: vi.fn(),
};

let studioProps: Record<string, unknown> = {};
let reviewProps: Record<string, unknown> = {};

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '77777777-7777-4777-8777-777777777777',
    data,
  };
}

function bridge(): RendererBridgeAdapter {
  return contractInput<RendererBridgeAdapter>({
    candidateAction: { cancelPreview: vi.fn(async () => success({ cancelled: true })) },
  });
}

function control(root: TestInstance, key: string): TestInstance {
  const result = root.findAll((node) => node.props['data-test-action'] === key)[0];
  if (!result) throw new Error(`Missing test action ${key}.`);
  return result;
}

async function click(root: TestInstance, key: string): Promise<void> {
  const node = control(root, key);
  await act(async () => {
    (node.props.onClick as () => unknown)();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function installMocks(): void {
  vi.doMock('../../apps/desktop/renderer/src/runtime/command-coordinator.js', () => ({
    rendererCommandCoordinatorFor: () => ({ invalidatePrefix: mocks.invalidatePrefix }),
  }));
  vi.doMock('../../apps/desktop/renderer/src/features/writing/use-generation-sources.js', () => ({
    useGenerationSources: () => ({
      providers: [{ id: 'provider-1', name: '本地模型' }],
      providerId: 'provider-1',
      setProviderId: mocks.setProviderId,
      sceneBeats: [{ id: 'beat-1', title: '场景一' }],
      mergeMappingMode: 'automatic',
      setMergeMappingMode: mocks.setMergeMappingMode,
    }),
  }));
  vi.doMock('../../apps/desktop/renderer/src/features/writing/candidate-review-loader.js', () => ({
    loadCandidateList: mocks.loadCandidateList,
    loadCandidateUndo: mocks.loadCandidateUndo,
    loadCandidateDocument: mocks.loadCandidateDocument,
  }));
  vi.doMock(
    '../../apps/desktop/renderer/src/features/writing/candidate-generation-refresh.js',
    () => ({ refreshCandidateGenerationRun: mocks.refreshCandidateGenerationRun }),
  );
  vi.doMock('../../apps/desktop/renderer/src/features/writing/candidate-selection.js', () => ({
    buildCandidateSelection: mocks.buildCandidateSelection,
    candidateReviewCollections: mocks.candidateReviewCollections,
    toggleSelectionSet: mocks.toggleSelectionSet,
  }));
  vi.doMock(
    '../../apps/desktop/renderer/src/features/writing/candidate-preview-actions.js',
    () => ({
      applyCandidate: mocks.applyCandidate,
      cancelCandidatePreview: mocks.cancelCandidatePreview,
      discardCandidate: mocks.discardCandidate,
      saveSkeletonCandidate: mocks.saveSkeletonCandidate,
      undoCandidate: mocks.undoCandidate,
    }),
  );
  vi.doMock('../../apps/desktop/renderer/src/features/writing/generation-start.js', () => ({
    startGenerationTask: mocks.startGenerationTask,
  }));
  vi.doMock(
    '../../apps/desktop/renderer/src/features/writing/generation-task-subscription.js',
    () => ({ useGenerationTaskSubscription: mocks.taskSubscription }),
  );
  vi.doMock(
    '../../apps/desktop/renderer/src/features/writing/use-generation-run-actions.js',
    () => ({
      useGenerationRunActions: () => ({
        cancelGeneration: mocks.cancelGeneration,
        decidePartial: mocks.decidePartial,
      }),
    }),
  );
  vi.doMock('../../apps/desktop/renderer/src/features/writing/generation-studio.js', () => ({
    GenerationStudio: (props: Record<string, unknown>) => {
      studioProps = props;
      const action = (key: string, run: () => unknown) =>
        createElement('button', { 'data-test-action': key, onClick: run }, key);
      return createElement(
        'div',
        { 'data-mock-generation-studio': true },
        action('start', () => (props.onStartGeneration as () => unknown)()),
        action('retry', () => (props.onRetryRewrite as () => unknown)()),
        action('cancel-generation', () => (props.onCancelGeneration as () => unknown)()),
        action('partial', () => (props.onDecidePartial as (value: string) => unknown)('keep')),
        action('ack', () =>
          (props.onAcknowledgeStaleSkeletonChange as (value: boolean) => unknown)(true),
        ),
        action('candidate-count', () =>
          (props.onCandidateCountChange as (value: number) => unknown)(5),
        ),
        action('chapter-goal', () =>
          (props.onChapterGoalChange as (value: string) => unknown)('破局'),
        ),
        action('chapter-source', () =>
          (props.onChapterSourceChange as (value: string) => unknown)('selected_skeleton'),
        ),
        action('instruction', () =>
          (props.onGenerationInstructionChange as (value: string) => unknown)('加强悬念'),
        ),
        action('mode', () =>
          (props.onGenerationModeChange as (value: string) => unknown)('rewrite'),
        ),
        action('beat-source', () =>
          (props.onMergeBeatSourceChange as (beatId: string, source: string) => unknown)(
            'beat-1',
            candidateId,
          ),
        ),
        action('merge-candidate', () =>
          (props.onMergeCandidateChange as (id: string, included: boolean) => unknown)(
            candidateId,
            true,
          ),
        ),
        action('merge-mode', () =>
          (props.onMergeMappingModeChange as (value: string) => unknown)('manual'),
        ),
        action('provider', () =>
          (props.onProviderIdChange as (value: string) => unknown)('provider-2'),
        ),
        action('skeleton', () =>
          (props.onSelectedSkeletonChange as (value: string) => unknown)('skeleton-1'),
        ),
        action('target', () =>
          (props.onTargetCharactersChange as (value: number) => unknown)(4200),
        ),
        action('tendency', () =>
          (props.onTendencyChange as (value: string) => unknown)('高压推进'),
        ),
      );
    },
  }));
  vi.doMock('../../apps/desktop/renderer/src/features/writing/candidate-review-display.js', () => ({
    CandidateReviewDisplay: (props: Record<string, unknown>) => {
      reviewProps = props;
      const action = (key: string, run: () => unknown) =>
        createElement('button', { 'data-test-action': key, onClick: run }, key);
      return createElement(
        'div',
        { 'data-mock-candidate-review': true },
        action('cancel-preview', () => (props.cancel as () => unknown)()),
        action('discard', () => (props.discard as () => unknown)()),
        action('apply', () => (props.apply as () => unknown)()),
        action('undo', () => (props.undo as () => unknown)()),
        action('save-skeleton', () => (props.saveSkeletonEdit as () => unknown)()),
        action('load-candidate', () =>
          (props.loadCandidate as (id: string) => unknown)('candidate-next'),
        ),
        action('close', () => (props.onClose as () => unknown)()),
        action('selection-mode', () =>
          (props.setSelectionMode as (value: string) => unknown)('blocks'),
        ),
        action('selected-skeleton', () =>
          (props.setSelectedSkeletonId as (value: string) => unknown)('skeleton-2'),
        ),
        action('ending-hook', () =>
          (props.setSkeletonEndingHook as (value: string) => unknown)('悬念钩子'),
        ),
        action('skeleton-tendency', () =>
          (props.setSkeletonTendency as (value: string) => unknown)('快节奏'),
        ),
        action('chapter-source-review', () =>
          (props.setChapterSource as (value: string) => unknown)('direct_chapter_goal'),
        ),
        action('generation-mode-review', () =>
          (props.setGenerationMode as (value: string) => unknown)('chapter'),
        ),
        action('start-continuation', () =>
          (props.startGeneration as (runId: string, nextIntent: GenerationIntent) => unknown)(
            'previous-run',
            intent,
          ),
        ),
      );
    },
  }));
}

async function mount(
  overrides: {
    readonly initialGenerationMode?: string | null;
    readonly onClose?: () => void;
    readonly bridge?: RendererBridgeAdapter;
  } = {},
): Promise<TestRenderer> {
  installMocks();
  const { CandidateReviewPanel } =
    await import('../../apps/desktop/renderer/src/features/writing/candidate-review-panel.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(CandidateReviewPanel, {
        bridge: overrides.bridge ?? bridge(),
        chapter,
        draft,
        project,
        flush: vi.fn(async () => true),
        onDraftReplace: vi.fn(),
        onClose: overrides.onClose ?? vi.fn(),
        getRewriteSelectionAnchor: vi.fn(async () => null),
        initialGenerationMode: overrides.initialGenerationMode,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return renderer;
}

async function unmount(renderer: TestRenderer): Promise<void> {
  await act(async () => {
    renderer.unmount();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetModules();
  studioProps = {};
  reviewProps = {};
  for (const value of Object.values(mocks)) {
    if (typeof value === 'function' && 'mockClear' in value) value.mockClear();
  }
  mocks.loadCandidateList.mockResolvedValue([candidate]);
  mocks.loadCandidateUndo.mockResolvedValue(false);
  mocks.loadCandidateDocument.mockImplementation(
    async (loader: { previewRequest: { current: string | null } }, id: string) => {
      loader.previewRequest.current = id === candidateId ? 'preview-active' : null;
    },
  );
  mocks.cancelCandidatePreview.mockResolvedValue(true);
  mocks.startGenerationTask.mockImplementation(
    async (input: {
      readonly onStarted: (run: GenerationRun, taskId: string) => void;
      readonly setLastIntent: (intent: GenerationIntent) => void;
    }) => {
      input.setLastIntent(intent);
      input.onStarted(run, taskId);
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M10 Candidate工作台父级编排覆盖', () => {
  it('加载首个建议稿并贯通生成、合并、审阅与操作回调', async () => {
    const onClose = vi.fn();
    const renderer = await mount({ initialGenerationMode: 'rewrite', onClose });

    expect(mocks.loadCandidateList).toHaveBeenCalled();
    expect(mocks.loadCandidateDocument).toHaveBeenCalledWith(expect.any(Object), candidateId);
    expect(studioProps.generationMode).toBe('rewrite');
    expect(reviewProps.candidateId).toBe(candidateId);

    for (const key of [
      'ack',
      'candidate-count',
      'chapter-goal',
      'chapter-source',
      'instruction',
      'mode',
      'beat-source',
      'merge-candidate',
      'merge-mode',
      'provider',
      'skeleton',
      'target',
      'tendency',
    ]) {
      await click(renderer.root, key);
    }
    expect(mocks.toggleSelectionSet).toHaveBeenCalledWith(expect.any(Set), candidateId, true);
    expect(mocks.setMergeMappingMode).toHaveBeenCalledWith('manual');
    expect(mocks.setProviderId).toHaveBeenCalledWith('provider-2');

    await click(renderer.root, 'start');
    expect(mocks.startGenerationTask).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId,
        chapterId,
        generationMode: 'rewrite',
        chapterSource: 'selected_skeleton',
        chapterGoal: '破局',
        generationInstruction: '加强悬念',
        targetCharacters: 4200,
        candidateCount: 5,
        selectedSkeletonId: 'skeleton-1',
        continuationOfRunId: null,
      }),
    );

    await click(renderer.root, 'retry');
    expect(mocks.startGenerationTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ intentOverride: intent }),
    );
    await click(renderer.root, 'cancel-generation');
    await click(renderer.root, 'partial');
    expect(mocks.cancelGeneration).toHaveBeenCalled();
    expect(mocks.decidePartial).toHaveBeenCalledWith('keep');

    await click(renderer.root, 'cancel-preview');
    expect(mocks.cancelCandidatePreview).toHaveBeenCalled();
    await click(renderer.root, 'discard');
    await click(renderer.root, 'apply');
    await click(renderer.root, 'undo');
    await click(renderer.root, 'save-skeleton');
    expect(mocks.discardCandidate).toHaveBeenCalled();
    expect(mocks.applyCandidate).toHaveBeenCalled();
    expect(mocks.undoCandidate).toHaveBeenCalled();
    expect(mocks.saveSkeletonCandidate).toHaveBeenCalled();

    await click(renderer.root, 'load-candidate');
    expect(mocks.loadCandidateDocument).toHaveBeenCalledWith(expect.any(Object), 'candidate-next');
    await click(renderer.root, 'selection-mode');
    await click(renderer.root, 'selected-skeleton');
    await click(renderer.root, 'ending-hook');
    await click(renderer.root, 'skeleton-tendency');
    await click(renderer.root, 'chapter-source-review');
    await click(renderer.root, 'generation-mode-review');
    await click(renderer.root, 'start-continuation');
    expect(mocks.startGenerationTask).toHaveBeenLastCalledWith(
      expect.objectContaining({ continuationOfRunId: 'previous-run', intentOverride: intent }),
    );
    await click(renderer.root, 'close');
    expect(onClose).toHaveBeenCalled();

    const subscription = mocks.taskSubscription.mock.calls.at(-1)?.[0] as {
      readonly onTerminal: () => unknown;
    };
    await act(async () => {
      await subscription.onTerminal();
    });
    expect(mocks.refreshCandidateGenerationRun).toHaveBeenCalled();
    await unmount(renderer);
  });

  it('处理空列表、无效初始模式与取消失败分支', async () => {
    mocks.loadCandidateList.mockResolvedValueOnce([]);
    mocks.cancelCandidatePreview.mockResolvedValueOnce(false);
    const renderer = await mount({ initialGenerationMode: 'unsupported' });
    expect(reviewProps.status).toBe('当前章节没有建议稿。');
    expect(studioProps.generationMode).toBe('chapter');
    await click(renderer.root, 'cancel-preview');
    expect(reviewProps.status).toBe('当前章节没有建议稿。');
    await click(renderer.root, 'retry');
    expect(mocks.startGenerationTask).not.toHaveBeenCalled();
    await unmount(renderer);
  });

  it('卸载时使延迟列表失效并取消仍在运行的差异预览', async () => {
    let resolveList!: (items: readonly CandidateSummary[]) => void;
    mocks.loadCandidateList.mockImplementationOnce(
      () =>
        new Promise<readonly CandidateSummary[]>((resolve) => {
          resolveList = resolve;
        }),
    );
    const api = bridge();
    const renderer = await mount({ bridge: api });
    await unmount(renderer);
    await act(async () => {
      resolveList([candidate]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.loadCandidateDocument).not.toHaveBeenCalled();
    expect(mocks.invalidatePrefix).toHaveBeenCalledWith(`writing:${projectId}:${chapterId}:`);

    mocks.loadCandidateList.mockResolvedValueOnce([candidate]);
    const second = await mount({ bridge: api });
    await unmount(second);
    expect(api.candidateAction.cancelPreview).toHaveBeenCalledWith('preview-active');
  });
});
