import { createRequire } from 'node:module';

import type { Chapter, DraftDocument, ProjectWorkspaceSummary } from '@worldforge/contracts';
import type { DraftAutosaveCoordinator, Editor } from '@worldforge/editor-core';
import type { createElement as createReactElement, ReactElement } from 'react';
import type { MutableRefObject } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const capture = vi.hoisted(() => ({
  header: vi.fn(),
  structure: vi.fn(),
  find: vi.fn(),
  version: vi.fn(),
  candidate: vi.fn(),
  assistance: vi.fn(),
  undo: vi.fn(),
  redo: vi.fn(),
  rewriteAnchor: vi.fn().mockResolvedValue({ kind: 'selection' }),
  persistedRewriteAnchor: vi.fn().mockResolvedValue(null),
}));

vi.mock('@worldforge/editor-core', () => ({
  undoWorldforgeEditor: capture.undo,
  redoWorldforgeEditor: capture.redo,
}));
vi.mock('../../packages/editor-core/dist/index.js', () => ({
  undoWorldforgeEditor: capture.undo,
  redoWorldforgeEditor: capture.redo,
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/editor-selection.js', () => ({
  captureRewriteSelectionAnchor: capture.rewriteAnchor,
  capturePersistedRewriteSelectionAnchor: capture.persistedRewriteAnchor,
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/writing-workbench-header.js', () => ({
  WritingWorkbenchHeader: (props: Record<string, unknown>) => {
    capture.header(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/structure-navigator.js', () => ({
  StructureNavigator: (props: Record<string, unknown>) => {
    capture.structure(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/find-replace-toolbar.js', () => ({
  FindReplaceToolbar: (props: Record<string, unknown>) => {
    capture.find(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/version-panel.js', () => ({
  VersionPanel: (props: Record<string, unknown>) => {
    capture.version(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/candidate-review-panel.js', () => ({
  CandidateReviewPanel: (props: Record<string, unknown>) => {
    capture.candidate(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/writing/writing-assistance-panel.js', () => ({
  WritingAssistancePanel: (props: Record<string, unknown>) => {
    capture.assistance(props);
    return null;
  },
}));

import { WritingWorkbenchView } from '../../apps/desktop/renderer/src/features/writing/writing-workbench-view.js';

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
  update(element: ReactElement): void;
  unmount(): void;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';

const project = contractInput<ProjectWorkspaceSummary>({
  projectId,
  name: '作品',
});
const chapter = contractInput<Chapter>({
  id: chapterId,
  projectId,
  title: '第一章',
});
const draft = contractInput<DraftDocument>({
  draftId,
  projectId,
  chapterId,
  revision: 7,
  blocks: [{ text: '甲' }, { text: '乙' }],
});
const bridge = contractInput<RendererBridgeAdapter>({});

const editorRef = contractInput<MutableRefObject<Editor | null>>({
  current: null,
});
const editorHost = contractInput<MutableRefObject<HTMLDivElement | null>>({
  current: null,
});
const autosaveRef = contractInput<MutableRefObject<DraftAutosaveCoordinator | null>>({
  current: null,
});
const composingRef = contractInput<MutableRefObject<boolean>>({
  current: false,
});

const actions = {
  rememberCurrentSelection: vi.fn(),
  toggleFocusMode: vi.fn(),
  selectMatch: vi.fn(),
  replaceMatches: vi.fn(),
  setBlockType: vi.fn(),
  insertSeparator: vi.fn(),
  toggleLock: vi.fn(),
  manualSave: vi.fn().mockResolvedValue(true),
  setOutlineVisible: vi.fn(),
  setContextVisible: vi.fn(),
  setFindText: vi.fn(),
  setReplaceText: vi.fn(),
  setFindIndex: vi.fn(),
  setIsComposing: vi.fn(),
  setStatus: vi.fn(),
  onNavigate: vi.fn(),
  onPanelChange: vi.fn(),
  onStatus: vi.fn(),
  openChapter: vi.fn().mockResolvedValue(undefined),
  flush: vi.fn().mockResolvedValue(true),
  replaceDraft: vi.fn(),
  backToProject: vi.fn().mockResolvedValue(undefined),
};

interface ViewOptions {
  readonly panel?: 'editor' | 'versions' | 'candidates';
  readonly chapter?: Chapter | null;
  readonly draft?: DraftDocument | null;
  readonly readOnly?: boolean;
  readonly editorReady?: boolean;
  readonly editorUnavailable?: boolean;
  readonly focusMode?: boolean;
  readonly outlineVisible?: boolean;
  readonly contextVisible?: boolean;
  readonly isComposing?: boolean;
  readonly selectedLocked?: boolean | null;
  readonly progressPercent?: number | null;
  readonly editorFailure?: boolean;
  readonly navigationVersionId?: string | null;
  readonly navigationGenerationMode?: string | null;
}

function view(options: ViewOptions = {}): ReactElement {
  return createElement(WritingWorkbenchView, {
    bridge,
    disclosureMode: 'professional',
    project,
    panel: options.panel ?? 'editor',
    chapterSessionPhase: 'ready',
    chapter: options.chapter === undefined ? chapter : options.chapter,
    draft: options.draft === undefined ? draft : options.draft,
    readOnly: options.readOnly ?? false,
    editorReady: options.editorReady ?? true,
    editorUnavailable: options.editorUnavailable ?? false,
    focusMode: options.focusMode ?? false,
    outlineVisible: options.outlineVisible ?? true,
    contextVisible: options.contextVisible ?? true,
    isComposing: options.isComposing ?? false,
    findText: '查找词',
    replaceText: '替换词',
    findIndex: 1,
    findCount: 2,
    editorTools: contractInput({
      rememberCurrentSelection: actions.rememberCurrentSelection,
      toggleFocusMode: actions.toggleFocusMode,
      selectMatch: actions.selectMatch,
      replaceMatches: actions.replaceMatches,
      setBlockType: actions.setBlockType,
      insertSeparator: actions.insertSeparator,
      toggleLock: actions.toggleLock,
      manualSave: actions.manualSave,
    }),
    metrics: contractInput({
      statistics: {
        textCount: 2,
        characterCount: 3,
        paragraphCount: 2,
        progressPercent: options.progressPercent === undefined ? 50 : options.progressPercent,
      },
      selectedLocked: options.selectedLocked === undefined ? false : options.selectedLocked,
    }),
    writingStatus: contractInput({
      editorState: '已保存',
      editorFailure: options.editorFailure ?? false,
      setStatus: actions.setStatus,
    }),
    navigationVersionId: options.navigationVersionId,
    navigationGenerationMode: options.navigationGenerationMode,
    editorHost,
    editor: editorRef,
    autosave: autosaveRef,
    composing: composingRef,
    setOutlineVisible: actions.setOutlineVisible,
    setContextVisible: actions.setContextVisible,
    setFindText: actions.setFindText,
    setReplaceText: actions.setReplaceText,
    setFindIndex: actions.setFindIndex,
    setIsComposing: actions.setIsComposing,
    onNavigate: actions.onNavigate,
    onPanelChange: actions.onPanelChange,
    onStatus: actions.onStatus,
    openChapter: actions.openChapter,
    flush: actions.flush,
    replaceDraft: actions.replaceDraft,
    backToProject: actions.backToProject,
  });
}

function callback<T extends (...args: never[]) => unknown>(value: unknown): T {
  if (typeof value !== 'function') throw new Error('Expected callback.');
  return contractInput<T>(value);
}

function lastProps(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error('Expected captured child props.');
  return contractInput<Record<string, unknown>>(call[0]);
}

function findData(renderer: TestRenderer, attribute: string): TestInstance {
  const node = renderer.root.findAll((candidate) => attribute in candidate.props)[0];
  if (!node) throw new Error(`Missing ${attribute}.`);
  return node;
}

async function invoke(node: TestInstance, prop: string, ...args: unknown[]): Promise<unknown> {
  let result: unknown;
  await act(async () => {
    result = callback<(...values: never[]) => unknown>(node.props[prop])(
      ...contractInput<never[]>(args),
    );
    await Promise.resolve(result);
    await Promise.resolve();
  });
  return result;
}

async function invokeProp(
  props: Record<string, unknown>,
  name: string,
  ...args: unknown[]
): Promise<unknown> {
  let result: unknown;
  await act(async () => {
    result = callback<(...values: never[]) => unknown>(props[name])(
      ...contractInput<never[]>(args),
    );
    await Promise.resolve(result);
    await Promise.resolve();
  });
  return result;
}

let keydown: ((event: KeyboardEvent) => void) | null = null;
const addEventListener = vi.fn((type: string, listener: unknown) => {
  if (type === 'keydown') keydown = callback<(event: KeyboardEvent) => void>(listener);
});
const removeEventListener = vi.fn();
const writeText = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('addEventListener', addEventListener);
  vi.stubGlobal('removeEventListener', removeEventListener);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  vi.clearAllMocks();
  keydown = null;
  editorRef.current = null;
  editorHost.current = null;
  autosaveRef.current = null;
  composingRef.current = false;
  actions.manualSave.mockResolvedValue(true);
  actions.openChapter.mockResolvedValue(undefined);
  actions.flush.mockResolvedValue(true);
  writeText.mockResolvedValue(undefined);
  capture.rewriteAnchor.mockResolvedValue({ kind: 'selection' });
  capture.persistedRewriteAnchor.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WritingWorkbenchView interaction coverage', () => {
  it('drives editor tools, find shortcuts, clipboard fallbacks and composition lifecycle', async () => {
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(view());
      await Promise.resolve();
    });

    const structure = lastProps(capture.structure);
    await invokeProp(structure, 'onSelectChapter');
    await invokeProp(structure, 'onOpenChapter', chapter);
    expect(actions.openChapter).toHaveBeenCalledWith(chapter);

    const assistance = lastProps(capture.assistance);
    await invokeProp(assistance, 'onOpenAssistant');
    expect(actions.onPanelChange).toHaveBeenCalledWith('candidates');

    await invoke(findData(renderer, 'data-set-block-type'), 'onClick');
    const blockButtons = renderer.root.findAll((node) => 'data-set-block-type' in node.props);
    await invoke(blockButtons[1]!, 'onClick');
    await invoke(blockButtons[2]!, 'onClick');
    expect(actions.setBlockType.mock.calls.map((call) => call[0])).toEqual([
      'paragraph',
      'dialogue',
      'heading',
    ]);
    await invoke(findData(renderer, 'data-insert-separator'), 'onClick');
    await invoke(findData(renderer, 'data-toggle-block-lock'), 'onClick');
    await invoke(findData(renderer, 'data-save-draft'), 'onClick');
    expect(actions.insertSeparator).toHaveBeenCalledOnce();
    expect(actions.toggleLock).toHaveBeenCalledOnce();
    expect(actions.manualSave).toHaveBeenCalledOnce();

    await invoke(findData(renderer, 'data-undo-draft'), 'onClick');
    await invoke(findData(renderer, 'data-redo-draft'), 'onClick');
    expect(capture.undo).not.toHaveBeenCalled();
    expect(capture.redo).not.toHaveBeenCalled();

    const editorInstance = contractInput<Editor>({
      getText: vi.fn(() => '编辑器正文'),
    });
    editorRef.current = editorInstance;
    await invoke(findData(renderer, 'data-undo-draft'), 'onClick');
    await invoke(findData(renderer, 'data-redo-draft'), 'onClick');
    expect(capture.undo).toHaveBeenCalledWith(editorInstance);
    expect(capture.redo).toHaveBeenCalledWith(editorInstance);

    const findToggle = findData(renderer, 'data-toggle-draft-find');
    await invoke(findToggle, 'onClick');
    const find = lastProps(capture.find);
    await invokeProp(find, 'onFindTextChange', '新词');
    expect(actions.setFindText).toHaveBeenCalledWith('新词');
    expect(actions.setFindIndex).toHaveBeenCalledWith(0);

    const preventDefault = vi.fn();
    const currentKeydown = keydown;
    if (!currentKeydown) throw new Error('Missing keydown listener.');
    await act(async () => {
      currentKeydown(
        contractInput<KeyboardEvent>({
          ctrlKey: true,
          metaKey: false,
          key: 'F',
          preventDefault,
        }),
      );
      await Promise.resolve();
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    const escapeKeydown = keydown;
    if (!escapeKeydown) throw new Error('Missing refreshed keydown listener.');
    await act(async () => {
      escapeKeydown(
        contractInput<KeyboardEvent>({
          ctrlKey: false,
          metaKey: false,
          key: 'Escape',
          preventDefault: vi.fn(),
        }),
      );
      await Promise.resolve();
    });
    const ignoredKeydown = keydown;
    if (!ignoredKeydown) throw new Error('Missing keydown listener after closing find.');
    ignoredKeydown(
      contractInput<KeyboardEvent>({
        ctrlKey: false,
        metaKey: false,
        key: 'x',
        preventDefault: vi.fn(),
      }),
    );

    const autosave = contractInput<DraftAutosaveCoordinator>({
      pause: vi.fn(),
      resume: vi.fn(),
      markDirty: vi.fn(),
    });
    autosaveRef.current = autosave;
    const editorHostNode = findData(renderer, 'data-draft-editor-host');
    await invoke(editorHostNode, 'onCompositionStart');
    expect(composingRef.current).toBe(true);
    expect(actions.setIsComposing).toHaveBeenCalledWith(true);
    expect(autosave.pause).toHaveBeenCalledOnce();
    expect(actions.setStatus).toHaveBeenCalledWith('输入法组合中；保存与结构键已暂停。');
    await invoke(editorHostNode, 'onCompositionEnd');
    expect(composingRef.current).toBe(false);
    expect(actions.setIsComposing).toHaveBeenCalledWith(false);
    expect(autosave.resume).toHaveBeenCalledOnce();
    expect(autosave.markDirty).toHaveBeenCalledOnce();
    autosaveRef.current = null;
    await invoke(editorHostNode, 'onCompositionStart');
    await invoke(editorHostNode, 'onCompositionEnd');

    const copyButton = renderer.root.findAll(
      (node) => node.type === 'button' && node.children.includes('复制正文'),
    )[0];
    if (!copyButton) throw new Error('Missing copy button.');
    editorRef.current = editorInstance;
    await invoke(copyButton, 'onClick');
    expect(writeText).toHaveBeenLastCalledWith('编辑器正文');
    editorRef.current = null;
    await invoke(copyButton, 'onClick');
    expect(writeText).toHaveBeenLastCalledWith('甲\n\n乙');

    await act(async () => {
      renderer.update(view({ draft: null }));
      await Promise.resolve();
    });
    const emptyCopyButton = renderer.root.findAll(
      (node) => node.type === 'button' && node.children.includes('复制正文'),
    )[0];
    if (!emptyCopyButton) throw new Error('Missing empty copy button.');
    await invoke(emptyCopyButton, 'onClick');
    expect(writeText).toHaveBeenLastCalledWith('');

    await act(async () => renderer.unmount());
    expect(removeEventListener).toHaveBeenCalled();
  });

  it('covers panel orchestration, rewrite anchors, display branches and nullable statistics', async () => {
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        view({
          panel: 'versions',
          navigationVersionId: null,
          progressPercent: null,
          selectedLocked: true,
          editorFailure: true,
        }),
      );
      await Promise.resolve();
    });
    const version = lastProps(capture.version);
    expect(version.navigationVersionId).toBeNull();
    await invokeProp(version, 'onClose');
    expect(actions.onPanelChange).toHaveBeenCalledWith('editor');

    await act(async () => {
      renderer.update(
        view({
          panel: 'editor',
          progressPercent: null,
          selectedLocked: true,
          editorFailure: true,
        }),
      );
      await Promise.resolve();
    });
    expect(findData(renderer, 'data-toggle-block-lock').children).toContain('解锁当前段落');
    expect(findData(renderer, 'data-draft-state').props.className).toBe('draft-state is-error');

    await act(async () => {
      renderer.update(view({ panel: 'candidates' }));
      await Promise.resolve();
    });
    let candidate = lastProps(capture.candidate);
    expect('initialGenerationMode' in candidate).toBe(false);
    await expect(invokeProp(candidate, 'getRewriteSelectionAnchor')).resolves.toBeNull();
    expect(capture.persistedRewriteAnchor).toHaveBeenCalledWith(projectId, chapter, draft);
    await invokeProp(candidate, 'onClose');

    const editorInstance = contractInput<Editor>({
      getText: vi.fn(() => '正文'),
    });
    editorRef.current = editorInstance;
    candidate = lastProps(capture.candidate);
    await expect(invokeProp(candidate, 'getRewriteSelectionAnchor')).resolves.toEqual({
      kind: 'selection',
    });
    expect(capture.rewriteAnchor).toHaveBeenCalledWith(editorInstance, projectId, chapter, draft);

    await act(async () => {
      renderer.update(view({ panel: 'candidates', navigationGenerationMode: 'rewrite' }));
      await Promise.resolve();
    });
    expect(lastProps(capture.candidate).initialGenerationMode).toBe('rewrite');

    capture.structure.mockClear();
    capture.assistance.mockClear();
    await act(async () => {
      renderer.update(
        view({
          panel: 'editor',
          focusMode: true,
          outlineVisible: true,
          contextVisible: true,
          selectedLocked: null,
          progressPercent: null,
          editorReady: false,
          editorUnavailable: true,
        }),
      );
      await Promise.resolve();
    });
    expect(capture.structure).not.toHaveBeenCalled();
    expect(capture.assistance).not.toHaveBeenCalled();
    expect(
      findData(renderer, 'data-writing-workbench').props['data-draft-workspace'],
    ).toBeUndefined();
    expect(findData(renderer, 'data-toggle-block-lock').props.disabled).toBe(true);

    await act(async () => {
      renderer.update(view({ draft: null, contextVisible: true, outlineVisible: false }));
      await Promise.resolve();
    });
    expect(lastProps(capture.assistance).savedRevision).toBeNull();

    await act(async () => {
      renderer.update(view({ chapter: null, draft: null }));
      await Promise.resolve();
    });
    expect(
      renderer.root.findAll((node) => node.children.includes('选择章节开始写作')),
    ).not.toHaveLength(0);

    await act(async () => renderer.unmount());
  });

  it('ignores find shortcuts outside the editor and covers the meta-key path', async () => {
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(view({ panel: 'versions' }));
      await Promise.resolve();
    });
    const preventDefault = vi.fn();
    const versionsKeydown = keydown;
    if (!versionsKeydown) throw new Error('Missing versions keydown listener.');
    versionsKeydown(
      contractInput<KeyboardEvent>({
        ctrlKey: true,
        metaKey: false,
        key: 'f',
        preventDefault,
      }),
    );
    expect(preventDefault).not.toHaveBeenCalled();

    await act(async () => {
      renderer.update(view({ panel: 'editor' }));
      await Promise.resolve();
    });
    const editorKeydown = keydown;
    if (!editorKeydown) throw new Error('Missing editor keydown listener.');
    await act(async () => {
      editorKeydown(
        contractInput<KeyboardEvent>({
          ctrlKey: false,
          metaKey: true,
          key: 'f',
          preventDefault,
        }),
      );
      await Promise.resolve();
    });
    expect(preventDefault).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });
});
