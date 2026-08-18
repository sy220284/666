import { createRequire } from 'node:module';

import type { Chapter, ProjectStructure, Volume } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  load: null as null | (() => Promise<unknown>),
  resource: {
    state: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
    data: null as unknown,
    error: null as unknown,
    refresh: vi.fn(),
  },
  tree: vi.fn(),
  volume: vi.fn(),
  chapter: vi.fn(),
  trash: vi.fn(),
  operations: {
    command: { pending: false, error: null as unknown },
    previewCommand: { pending: false },
    mergeChapter: vi.fn(),
    moveBlocks: vi.fn(),
    moveVolumeUp: vi.fn(),
    removeChapter: vi.fn(),
    removeVolume: vi.fn(),
    splitChapter: vi.fn(),
  },
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.load = load;
    return controls.resource;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/structure-operation-dialog.js', () => ({
  StructureOperationDialog: ({ children }: { children: (operations: unknown) => ReactElement }) =>
    children(controls.operations),
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/structure-tree.js', () => ({
  StructureTree: (props: Record<string, unknown>) => {
    controls.tree(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/volume-editor-dialog.js', () => ({
  VolumeEditorDialog: (props: Record<string, unknown>) => {
    controls.volume(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/chapter-editor-dialog.js', () => ({
  ChapterEditorDialog: (props: Record<string, unknown>) => {
    controls.chapter(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/structure/trash-panel.js', () => ({
  TrashPanel: (props: Record<string, unknown>) => {
    controls.trash(props);
    return null;
  },
}));

import { StructureNavigator } from '../../apps/desktop/renderer/src/features/structure/structure-navigator.js';

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
const volume = contractInput<Volume>({
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  title: '第一卷',
});
const chapter = contractInput<Chapter>({
  id: '33333333-3333-4333-8333-333333333333',
  projectId,
  volumeId: volume.id,
  title: '第一章',
});
const secondChapter = contractInput<Chapter>({
  id: '44444444-4444-4444-8444-444444444444',
  projectId,
  volumeId: volume.id,
  title: '第二章',
});
const structure = contractInput<ProjectStructure>({
  projectId,
  volumes: [{ ...volume, chapters: [chapter, secondChapter] }],
});
const planningListStructure = vi.fn(async () => ({ state: 'success', data: structure }));
const bridge = contractInput<RendererBridgeAdapter>({
  planning: { listStructure: planningListStructure },
});
const active: TestRenderer[] = [];
const onSelectChapter = vi.fn();
const onOpenChapter = vi.fn();
const onStatus = vi.fn();

function element(
  options: {
    selected?: string | null | undefined;
    withSelect?: boolean;
    withOpen?: boolean;
    withStatus?: boolean;
    compact?: boolean;
    readOnly?: boolean;
  } = {},
): ReactElement {
  return createElement(StructureNavigator, {
    bridge,
    projectId,
    readOnly: options.readOnly ?? false,
    ...(options.selected === undefined ? {} : { selectedChapterId: options.selected }),
    ...(options.withSelect === false ? {} : { onSelectChapter }),
    ...(options.withOpen === false ? {} : { onOpenChapter }),
    ...(options.withStatus === false ? {} : { onStatus }),
    compact: options.compact ?? false,
  });
}

async function render(options: Parameters<typeof element>[0] = {}): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element(options));
    await Promise.resolve();
  });
  active.push(renderer);
  return renderer;
}

function last(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error('Missing captured props');
  return contractInput<Record<string, unknown>>(call[0]);
}

async function callback(props: Record<string, unknown>, name: string, ...args: unknown[]) {
  const fn = props[name];
  if (typeof fn !== 'function') throw new Error(`Missing ${name}`);
  await act(async () => {
    await fn(...args);
    await Promise.resolve();
  });
}

function button(root: TestInstance, attribute: string): TestInstance {
  const node = root.findAll((candidate) => attribute in candidate.props)[0];
  if (!node) throw new Error(`Missing ${attribute}`);
  return node;
}

async function click(node: TestInstance): Promise<void> {
  const fn = node.props.onClick;
  if (typeof fn !== 'function') throw new Error('Missing onClick');
  await act(async () => {
    fn();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  controls.load = null;
  controls.resource.state = 'success';
  controls.resource.data = structure;
  controls.resource.error = null;
  controls.resource.refresh.mockResolvedValue(undefined);
  controls.operations.command.pending = false;
  controls.operations.command.error = null;
  controls.operations.previewCommand.pending = false;
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StructureNavigator edge coverage', () => {
  it('selects the first chapter for controlled/uncontrolled modes and opens chapters', async () => {
    const controlled = await render({ selected: null });
    expect(onSelectChapter).toHaveBeenCalledWith(chapter.id);
    let tree = last(controls.tree);
    await callback(tree, 'onOpenChapter', secondChapter);
    expect(onSelectChapter).toHaveBeenLastCalledWith(secondChapter.id);
    expect(onOpenChapter).toHaveBeenCalledWith(secondChapter);

    vi.clearAllMocks();
    const uncontrolled = await render({ withSelect: false, withOpen: false, withStatus: false });
    tree = last(controls.tree);
    expect(tree.activeSelectedChapterId).toBe(chapter.id);
    await callback(tree, 'onOpenChapter', secondChapter);
    expect(last(controls.tree).activeSelectedChapterId).toBe(secondChapter.id);
    expect(onOpenChapter).not.toHaveBeenCalled();
    expect(uncontrolled.root).toBeDefined();

    await act(async () => controlled.update(element({ selected: chapter.id })));
    expect(last(controls.tree).activeSelectedChapterId).toBe(chapter.id);
  });

  it('executes the structure query and covers empty controlled data', async () => {
    controls.resource.data = null;
    const renderer = await render({ selected: null });
    expect(last(controls.tree).structure).toBeNull();
    const load = controls.load;
    if (!load) throw new Error('Missing structure load callback');
    await load();
    expect(planningListStructure).toHaveBeenCalledWith(projectId, { mode: 'replace' });
    expect(last(controls.tree).activeSelectedChapterId).toBeNull();
    expect(renderer.root).toBeDefined();
  });

  it('keeps valid selection, clears empty uncontrolled selection and forwards tree state/operations', async () => {
    const renderer = await render({ selected: chapter.id });
    expect(onSelectChapter).not.toHaveBeenCalled();
    let tree = last(controls.tree);
    expect(tree).toMatchObject({
      activeSelectedChapterId: chapter.id,
      commandPending: false,
      compact: false,
      loading: false,
      previewPending: false,
      readOnly: false,
      structure,
    });
    expect(tree.onMergeChapter).toBe(controls.operations.mergeChapter);
    expect(tree.onMoveBlocks).toBe(controls.operations.moveBlocks);
    expect(tree.onMoveVolumeUp).toBe(controls.operations.moveVolumeUp);
    expect(tree.onRemoveChapter).toBe(controls.operations.removeChapter);
    expect(tree.onRemoveVolume).toBe(controls.operations.removeVolume);
    expect(tree.onSplitChapter).toBe(controls.operations.splitChapter);
    expect(tree.onRetry).toBe(controls.resource.refresh);

    controls.resource.data = contractInput<ProjectStructure>({ projectId, volumes: [] });
    await act(async () => renderer.update(element({ withSelect: false, withOpen: false })));
    tree = last(controls.tree);
    expect(tree.activeSelectedChapterId).toBeNull();
  });

  it('opens create/edit dialogs and closes or saves them with refresh/status', async () => {
    const renderer = await render();
    await click(button(renderer.root, 'data-create-volume'));
    let volumeDialog = last(controls.volume);
    expect(volumeDialog.volume).toBeNull();
    await callback(volumeDialog, 'onClose');

    let tree = last(controls.tree);
    await callback(tree, 'onEditVolume', volume);
    volumeDialog = last(controls.volume);
    expect(volumeDialog.volume).toBe(volume);
    await callback(volumeDialog, 'onSaved');
    expect(controls.resource.refresh).toHaveBeenCalledOnce();
    expect(onStatus).toHaveBeenCalledWith('卷章结构已保存。');

    tree = last(controls.tree);
    await callback(tree, 'onCreateChapter', volume);
    let chapterDialog = last(controls.chapter);
    expect(chapterDialog.chapter).toBeNull();
    await callback(chapterDialog, 'onClose');

    tree = last(controls.tree);
    await callback(tree, 'onEditChapter', volume, chapter);
    chapterDialog = last(controls.chapter);
    expect(chapterDialog.chapter).toBe(chapter);
    await callback(chapterDialog, 'onSaved');
    expect(controls.resource.refresh).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledTimes(2);
  });

  it('opens/closes trash and covers compact/read-only/pending/error branches', async () => {
    controls.operations.command.pending = true;
    controls.operations.previewCommand.pending = true;
    controls.operations.command.error = {
      code: 'COMMON_INTERNAL_999',
      message: '结构失败',
      retryable: true,
    };
    controls.resource.state = 'loading';
    controls.resource.error = { code: 'DB_READ_FAILED_003' };
    const renderer = await render({ readOnly: true });
    expect(button(renderer.root, 'data-create-volume').props.disabled).toBe(true);
    expect(
      renderer.root.findAll((node) => node.props['data-structure-state'] !== undefined)[0]?.children
        .length,
    ).toBeGreaterThan(0);
    let tree = last(controls.tree);
    expect(tree).toMatchObject({
      commandPending: true,
      loading: true,
      previewPending: true,
      readOnly: true,
    });

    await click(button(renderer.root, 'data-open-trash'));
    const trash = last(controls.trash);
    expect(trash.readOnly).toBe(true);
    expect(trash.onStructureRefresh).toBe(controls.resource.refresh);
    await callback(trash, 'onClose');

    const compactRenderer = await render({ compact: true });
    expect(compactRenderer.root.findAll((node) => 'data-create-volume' in node.props)).toHaveLength(
      0,
    );
    expect(compactRenderer.root.findAll((node) => 'data-open-trash' in node.props)).toHaveLength(0);
    tree = last(controls.tree);
    expect(tree.compact).toBe(true);
  });
});
