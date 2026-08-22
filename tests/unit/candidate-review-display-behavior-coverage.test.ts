import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CandidateConflictItem,
  CandidateDocument,
  CandidatePreview,
  CandidateSelection,
  CandidateSummary,
  CandidateUndoPreview,
  GenerationRun,
  ProviderSummary,
  SceneBeat,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import { CandidateReviewDisplay } from '../../apps/desktop/renderer/src/features/writing/candidate-review-display.js';
import type { CandidateReviewGroup } from '../../apps/desktop/renderer/src/features/writing/review-diff.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const childCalls = vi.hoisted(() => ({
  diff: vi.fn(),
  skeleton: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/features/writing/review-diff-panel.js', () => ({
  ReviewDiffPanel: (props: unknown) => {
    childCalls.diff(props);
    return null;
  },
}));

vi.mock('../../apps/desktop/renderer/src/features/writing/candidate-skeleton-review.js', () => ({
  CandidateSkeletonReview: (props: unknown) => {
    childCalls.skeleton(props);
    return null;
  },
}));

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestInstance {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  readonly children: readonly (TestInstance | string)[];
  findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
}
interface TestRenderer {
  readonly root: TestInstance;
  update(element: ReactElement): void;
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const activeRenderers: TestRenderer[] = [];

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function nodeByData(root: TestInstance, key: string): TestInstance {
  const node = root.findAll((candidate) => candidate.props[key] !== undefined)[0];
  if (!node) throw new Error(`Missing node for ${key}.`);
  return node;
}

function buttonByText(root: TestInstance, text: string): TestInstance {
  const button = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate).includes(text),
  )[0];
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

function invoke(node: TestInstance, name: 'onChange' | 'onClick', value?: unknown): void {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name}.`);
  (handler as (argument?: unknown) => void)(value);
}

function candidateSummary(overrides: Partial<CandidateSummary> = {}): CandidateSummary {
  return contractInput<CandidateSummary>({
    candidateId: 'candidate-1',
    title: '建议正文',
    candidateType: 'full',
    completeness: 'complete',
    status: 'pending',
    ...overrides,
  });
}

function reviewGroups(): CandidateReviewGroup[] {
  return [
    {
      id: 'pending',
      label: '待审阅',
      candidates: [candidateSummary()],
    },
    {
      id: 'accepted',
      label: '已采用',
      candidates: [
        candidateSummary({
          candidateId: 'candidate-2',
          title: '已采用改写',
          candidateType: 'rewrite',
          completeness: 'partial',
          status: 'accepted',
        }),
      ],
    },
  ];
}

function proseDocument(overrides: Partial<CandidateDocument> = {}): CandidateDocument {
  return contractInput<CandidateDocument>({
    candidateId: 'candidate-1',
    candidateType: 'full',
    completeness: 'complete',
    status: 'pending',
    title: '建议正文',
    blocks: [
      { candidateBlockId: 'block-1', text: '第一段候选正文', beatId: 'beat-1' },
      { candidateBlockId: 'block-2', text: '第二段候选正文', beatId: null },
      { candidateBlockId: 'block-3', text: '第三段候选正文', beatId: 'beat-1' },
      { candidateBlockId: 'block-4', text: '第四段候选正文', beatId: 'beat-missing' },
    ],
    ...overrides,
  });
}

function preview(overrides: Partial<CandidatePreview> = {}): CandidatePreview {
  return contractInput<CandidatePreview>({
    candidate: proseDocument(),
    draft: {
      blocks: [
        { logicalBlockId: 'draft-1', text: '第一段当前正文' },
        { logicalBlockId: 'draft-2', text: '第二段当前正文' },
      ],
    },
    structure: [{ kind: 'replace' }],
    characterDiffs: [{ kind: 'changed' }, { kind: 'changed' }],
    execution: { chapterCharacters: 1234 },
    ...overrides,
  });
}

function generationRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return contractInput<GenerationRun>({
    runId: 'run-1',
    providerId: 'provider-1',
    actualModel: 'model-1',
    promptId: 'prompt-1',
    promptVersion: 3,
    outputMode: 'structured',
    supportStatus: 'supported',
    ...overrides,
  });
}

function sceneBeats(): SceneBeat[] {
  return [
    contractInput<SceneBeat>({ id: 'beat-1', title: '雨夜相逢', goal: '确认身份' }),
    contractInput<SceneBeat>({ id: 'beat-2', title: '城门分别', goal: '' }),
  ];
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    apply: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    candidateId: 'candidate-1',
    conflicts: [] as CandidateConflictItem[],
    discard: vi.fn().mockResolvedValue(undefined),
    loadCandidate: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    pending: false,
    preview: null as CandidatePreview | null,
    previewRequest: { current: null as string | null },
    providers: [contractInput<ProviderSummary>({ id: 'provider-1', name: '本地智能连接' })],
    readOnly: false,
    reviewGroups: reviewGroups(),
    saveSkeletonEdit: vi.fn().mockResolvedValue(undefined),
    sceneBeats: sceneBeats(),
    selectedBeats: new Set<string>(),
    selectedBlocks: new Set<string>(),
    selectedDocument: null as CandidateDocument | null,
    selectedRun: null as GenerationRun | null,
    selection: null as CandidateSelection | null,
    selectionMode: 'all' as const,
    skeletonEndingHook: '结尾钩子',
    skeletonTendency: '走向说明',
    startGeneration: vi.fn().mockResolvedValue(undefined),
    status: '已准备审阅',
    undo: vi.fn().mockResolvedValue(undefined),
    undoPreview: null as CandidateUndoPreview | null,
    setAcknowledgeStaleSkeleton: vi.fn(),
    setCandidateId: vi.fn(),
    setChapterSource: vi.fn(),
    setGenerationMode: vi.fn(),
    setSelectedBeats: vi.fn(),
    setSelectedBlocks: vi.fn(),
    setSelectedSkeletonId: vi.fn(),
    setSelectionMode: vi.fn(),
    setSkeletonEndingHook: vi.fn(),
    setSkeletonTendency: vi.fn(),
    ...overrides,
  };
}

async function renderDisplay(props = baseProps()): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(CandidateReviewDisplay, props));
  });
  activeRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  childCalls.diff.mockReset();
  childCalls.skeleton.mockReset();
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('CandidateReviewDisplay author interaction coverage', () => {
  it('renders grouped candidate labels and executes select, cancel and discard actions', async () => {
    const props = baseProps({
      previewRequest: { current: 'preview-request-1' },
      selectedDocument: proseDocument(),
    });
    const renderer = await renderDisplay(props);

    expect(textContent(renderer.root)).toContain('建议正文 · 完整正文 · 内容完整 · 待审阅');
    expect(textContent(renderer.root)).toContain('已采用改写 · 改写内容 · 内容未完成 · 已采用');
    expect(textContent(renderer.root)).toContain('已准备审阅');

    invoke(nodeByData(renderer.root, 'data-candidate-preview-select'), 'onChange', {
      target: { value: 'candidate-2' },
    });
    expect(props.setCandidateId).toHaveBeenCalledWith('candidate-2');
    expect(props.loadCandidate).toHaveBeenCalledWith('candidate-2');

    const cancelButton = nodeByData(renderer.root, 'data-cancel-candidate-preview');
    expect(cancelButton.props.disabled).toBe(false);
    invoke(cancelButton, 'onClick');
    expect(props.cancel).toHaveBeenCalledOnce();

    const discardButton = nodeByData(renderer.root, 'data-discard-candidate');
    expect(discardButton.props.disabled).toBe(false);
    invoke(discardButton, 'onClick');
    expect(props.discard).toHaveBeenCalledOnce();
  });

  it('renders every generation provenance label including provider and compatibility fallbacks', async () => {
    const combinations: readonly [string, string, string, string][] = [
      ['structured', 'supported', '结构化结果', '完全支持'],
      ['text', 'partial', '文本结果', '部分支持'],
      ['stream', 'degraded', '逐步生成', '兼容模式'],
      ['streaming', 'unsupported', '逐步生成', '不支持'],
      ['future-output', 'future-support', '已记录', '兼容状态已记录'],
    ];
    const renderer = await renderDisplay(
      baseProps({
        selectedRun: generationRun({ outputMode: 'structured', supportStatus: 'supported' }),
      }),
    );

    for (const [outputMode, supportStatus, outputLabel, supportLabel] of combinations) {
      await act(async () => {
        renderer.update(
          createElement(
            CandidateReviewDisplay,
            baseProps({
              providers: outputMode === 'future-output' ? [] : baseProps().providers,
              selectedRun: generationRun({
                providerId: outputMode === 'future-output' ? 'provider-missing' : 'provider-1',
                outputMode,
                supportStatus,
              }),
            }),
          ),
        );
      });
      expect(textContent(renderer.root)).toContain(outputLabel);
      expect(textContent(renderer.root)).toContain(supportLabel);
    }
    expect(textContent(renderer.root)).toContain('provider-missing / model-1');
    expect(textContent(renderer.root)).toContain('prompt-1 · 第 3 版');
  });

  it('keeps technical generation identifiers behind professional disclosure', async () => {
    const selectedRun = generationRun();
    const renderer = await renderDisplay(baseProps({ disclosureMode: 'beginner', selectedRun }));

    expect(textContent(renderer.root)).not.toContain('run-1');
    expect(textContent(renderer.root)).not.toContain('prompt-1');
    expect(
      renderer.root.findAll(
        (instance) => instance.props['data-candidate-technical-details'] !== undefined,
      ),
    ).toHaveLength(0);

    await act(async () => {
      renderer.update(
        createElement(
          CandidateReviewDisplay,
          baseProps({ disclosureMode: 'professional', selectedRun }),
        ),
      );
    });

    expect(textContent(renderer.root)).toContain('run-1');
    expect(textContent(renderer.root)).toContain('prompt-1 · 第 3 版');
    expect(nodeByData(renderer.root, 'data-candidate-technical-details').type).toBe('details');
  });

  it('keeps partial candidates constrained and allows explicit continuation or manual return', async () => {
    const partialCandidate = proseDocument({
      completeness: 'partial',
      generationRunId: 'run-partial',
    });
    const props = baseProps({
      pending: false,
      preview: preview({ candidate: partialCandidate }),
      selectedDocument: partialCandidate,
    });
    const renderer = await renderDisplay(props);

    expect(textContent(renderer.root)).toContain('不完整建议稿只能按正文段落或场景采用');
    const continueButton = nodeByData(renderer.root, 'data-continue-partial-candidate');
    expect(continueButton.props.disabled).toBe(false);
    invoke(continueButton, 'onClick');
    expect(props.startGeneration).toHaveBeenCalledWith('run-partial');

    invoke(buttonByText(renderer.root, '返回编辑器手动补全'), 'onClick');
    expect(props.onClose).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(
        createElement(
          CandidateReviewDisplay,
          baseProps({
            pending: true,
            readOnly: true,
            preview: preview({
              candidate: proseDocument({ completeness: 'partial', generationRunId: null }),
            }),
          }),
        ),
      );
    });
    expect(
      renderer.root.findAll((node) => node.props['data-continue-partial-candidate'] !== undefined),
    ).toHaveLength(0);
    expect(nodeByData(renderer.root, 'data-candidate-apply-mode').children[0]).toBeDefined();
  });

  it('renders preview diff, block selection and guarded apply or undo actions', async () => {
    const selectedBlocks = new Set(['block-1']);
    const props = baseProps({
      preview: preview(),
      selectedDocument: proseDocument(),
      selectedBlocks,
      selection: contractInput<CandidateSelection>({
        mode: 'blocks',
        logicalBlockIds: ['block-1'],
      }),
      selectionMode: 'blocks',
      undoPreview: contractInput<CandidateUndoPreview>({ canUndo: true }),
    });
    const renderer = await renderDisplay(props);

    expect(textContent(renderer.root)).toContain('结构差异 1');
    expect(textContent(renderer.root)).toContain('字符差异块 2');
    expect(textContent(renderer.root)).toContain('1234字符');
    expect(childCalls.diff).toHaveBeenCalledWith(
      expect.objectContaining({
        comparisonText: expect.stringContaining('第一段候选正文'),
        currentText: expect.stringContaining('第一段当前正文'),
        comparisonTitle: '建议正文',
        currentTitle: '当前已保存稿',
        marker: 'candidate',
      }),
    );

    invoke(nodeByData(renderer.root, 'data-candidate-apply-mode'), 'onChange', {
      target: { value: 'scene-beats' },
    });
    expect(props.setSelectionMode).toHaveBeenCalledWith('scene-beats');

    const checkboxes = renderer.root.findAll((node) => node.type === 'input');
    expect(checkboxes).toHaveLength(4);
    expect(checkboxes[0]?.props.checked).toBe(true);
    expect(checkboxes[1]?.props.checked).toBe(false);
    invoke(checkboxes[0]!, 'onChange', { target: { checked: false } });
    invoke(checkboxes[1]!, 'onChange', { target: { checked: true } });
    expect(props.setSelectedBlocks).toHaveBeenNthCalledWith(1, new Set<string>());
    expect(props.setSelectedBlocks).toHaveBeenNthCalledWith(
      2,
      new Set<string>(['block-1', 'block-2']),
    );

    const applyButton = nodeByData(renderer.root, 'data-apply-candidate');
    const undoButton = nodeByData(renderer.root, 'data-undo-candidate-apply');
    expect(applyButton.props.disabled).toBe(false);
    expect(undoButton.props.disabled).toBe(false);
    invoke(applyButton, 'onClick');
    invoke(undoButton, 'onClick');
    expect(props.apply).toHaveBeenCalledOnce();
    expect(props.undo).toHaveBeenCalledOnce();
  });

  it('deduplicates scene selections, forwards skeleton editing and renders conflict details', async () => {
    const skeleton = proseDocument({ candidateType: 'skeleton' });
    const conflict = contractInput<CandidateConflictItem>({
      kind: 'revision',
      message: '当前稿修订号已经变化。',
    });
    const props = baseProps({
      conflicts: [conflict],
      preview: preview(),
      selectedBeats: new Set(['beat-1']),
      selectedDocument: skeleton,
      selection: contractInput<CandidateSelection>({ mode: 'scene-beats', beatIds: ['beat-1'] }),
      selectionMode: 'scene-beats',
    });
    const renderer = await renderDisplay(props);

    expect(childCalls.skeleton).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: skeleton,
        endingHook: '结尾钩子',
        tendency: '走向说明',
        readOnly: false,
      }),
    );
    const checkboxes = renderer.root.findAll((node) => node.type === 'input');
    expect(checkboxes).toHaveLength(2);
    expect(textContent(renderer.root)).toContain('雨夜相逢 · 确认身份');
    expect(textContent(renderer.root)).toContain('场景已变化');
    invoke(checkboxes[0]!, 'onChange', { target: { checked: false } });
    invoke(checkboxes[1]!, 'onChange', { target: { checked: true } });
    expect(props.setSelectedBeats).toHaveBeenNthCalledWith(1, new Set<string>());
    expect(props.setSelectedBeats).toHaveBeenNthCalledWith(
      2,
      new Set<string>(['beat-1', 'beat-missing']),
    );

    expect(textContent(renderer.root)).toContain('建议稿生成后当前稿已经变化');
    expect(textContent(renderer.root)).toContain('revision · 当前稿修订号已经变化。');
  });

  it('disables unsafe actions for missing selection, read-only state, processed candidates and absent undo', async () => {
    const renderer = await renderDisplay(
      baseProps({
        pending: true,
        preview: preview({ candidate: proseDocument({ status: 'accepted' }) }),
        previewRequest: { current: null },
        readOnly: true,
        selectedDocument: proseDocument({ status: 'accepted' }),
        selection: null,
        undoPreview: contractInput<CandidateUndoPreview>({ canUndo: false }),
      }),
    );

    expect(nodeByData(renderer.root, 'data-cancel-candidate-preview').props.disabled).toBe(true);
    expect(nodeByData(renderer.root, 'data-discard-candidate').props.disabled).toBe(true);
    expect(nodeByData(renderer.root, 'data-apply-candidate').props.disabled).toBe(true);
    expect(nodeByData(renderer.root, 'data-undo-candidate-apply').props.disabled).toBe(true);
  });
});
