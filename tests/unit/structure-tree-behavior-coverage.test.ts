import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, ProjectStructure, Volume } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { BridgeRequestError } from '../../apps/desktop/renderer/src/bridge/request-lifecycle.js';
import { StructureTree } from '../../apps/desktop/renderer/src/features/structure/structure-tree.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

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

function chapter(id: string, title: string, overrides: Partial<Chapter> = {}): Chapter {
  return contractInput<Chapter>({
    id,
    title,
    status: 'writing',
    targetWordMin: null,
    targetWordMax: null,
    ...overrides,
  });
}

const chapterOne = chapter('chapter-1', '第一章');
const chapterTwo = chapter('chapter-2', '第二章', { targetWordMin: 1200 });
const chapterThree = chapter('chapter-3', '第三章', { targetWordMax: 2400 });

function volume(
  id: string,
  title: string,
  chapters: readonly Chapter[],
  overrides: Partial<Volume> = {},
): Volume {
  return contractInput<Volume>({
    id,
    title,
    status: 'pending',
    chapters,
    ...overrides,
  });
}

const firstVolume = volume('volume-1', '第一卷', [chapterOne]);
const secondVolume = volume('volume-2', '第二卷', [chapterTwo, chapterThree], {
  status: 'finalized',
});

function structure(volumes: readonly Volume[] = [firstVolume, secondVolume]): ProjectStructure {
  return contractInput<ProjectStructure>({ volumes });
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function dataNodes(root: TestInstance, key: string): TestInstance[] {
  return root.findAll((node) => node.props[key] !== undefined);
}

function buttonByText(root: TestInstance, text: string): TestInstance {
  const button = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

function click(node: TestInstance): void {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick.');
  (handler as () => void)();
}

function baseProps(overrides: Record<string, unknown> = {}) {
  return {
    activeSelectedChapterId: null as string | null,
    commandPending: false,
    error: null as BridgeRequestError | null,
    loading: false,
    previewPending: false,
    readOnly: false,
    structure: structure() as ProjectStructure | null,
    onCreateChapter: vi.fn(),
    onEditChapter: vi.fn(),
    onEditVolume: vi.fn(),
    onMergeChapter: vi.fn().mockResolvedValue(undefined),
    onMoveBlocks: vi.fn().mockResolvedValue(undefined),
    onMoveVolumeUp: vi.fn().mockResolvedValue(undefined),
    onOpenChapter: vi.fn(),
    onRemoveChapter: vi.fn().mockResolvedValue(undefined),
    onRemoveVolume: vi.fn().mockResolvedValue(undefined),
    onRetry: vi.fn().mockResolvedValue(undefined),
    onSplitChapter: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function renderTree(props = baseProps()): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(StructureTree, props));
  });
  activeRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StructureTree author behavior coverage', () => {
  it('shows loading, empty and recoverable error states and retries explicitly', async () => {
    const error: BridgeRequestError = {
      code: 'COMMON_TIMEOUT_005',
      message: '读取卷章超时。',
      retryable: true,
    };
    const props = baseProps({
      error,
      loading: true,
      structure: structure([]),
    });
    const renderer = await renderTree(props);

    expect(dataNodes(renderer.root, 'data-structure-tree')[0]?.props['data-compact']).toBe('false');
    expect(textContent(renderer.root)).toContain('正在读取卷章…');
    expect(textContent(renderer.root)).toContain('专业空白项目：从新建卷开始。');
    expect(textContent(renderer.root)).toContain('操作等待超时');
    click(buttonByText(renderer.root, '重试'));
    expect(props.onRetry).toHaveBeenCalledOnce();

    await act(async () => {
      renderer.update(createElement(StructureTree, baseProps({ structure: null })));
    });
    expect(textContent(renderer.root)).not.toContain('正在读取卷章…');
    expect(textContent(renderer.root)).not.toContain('专业空白项目');
  });

  it('executes every full tree action while preserving selection and structural guards', async () => {
    const props = baseProps({ activeSelectedChapterId: chapterTwo.id });
    const renderer = await renderTree(props);

    expect(textContent(renderer.root)).toContain('第一卷');
    expect(textContent(renderer.root)).toContain('待规划');
    expect(textContent(renderer.root)).toContain('第二卷');
    expect(textContent(renderer.root)).toContain('已定稿');
    expect(textContent(renderer.root)).toContain('1200—∞ 字');
    expect(textContent(renderer.root)).toContain('0—2400 字');

    const chapterRows = dataNodes(renderer.root, 'data-chapter-id');
    expect(chapterRows[0]?.props.className).toBe('structure-row chapter-node');
    expect(chapterRows[1]?.props.className).toContain('is-selected is-active');

    const addButtons = dataNodes(renderer.root, 'data-add-chapter');
    click(addButtons[0]!);
    click(addButtons[1]!);
    expect(props.onCreateChapter).toHaveBeenNthCalledWith(1, firstVolume);
    expect(props.onCreateChapter).toHaveBeenNthCalledWith(2, secondVolume);

    const editVolumeButtons = dataNodes(renderer.root, 'data-edit-volume');
    click(editVolumeButtons[0]!);
    click(editVolumeButtons[1]!);
    expect(props.onEditVolume).toHaveBeenNthCalledWith(1, firstVolume);
    expect(props.onEditVolume).toHaveBeenNthCalledWith(2, secondVolume);

    const moveVolumeButtons = dataNodes(renderer.root, 'data-move-volume-up');
    expect(moveVolumeButtons[0]?.props.disabled).toBe(true);
    expect(moveVolumeButtons[1]?.props.disabled).toBe(false);
    click(moveVolumeButtons[0]!);
    click(moveVolumeButtons[1]!);
    expect(props.onMoveVolumeUp).toHaveBeenCalledOnce();
    expect(props.onMoveVolumeUp).toHaveBeenCalledWith(secondVolume, firstVolume);

    for (const button of dataNodes(renderer.root, 'data-delete-volume')) click(button);
    expect(props.onRemoveVolume).toHaveBeenNthCalledWith(1, firstVolume);
    expect(props.onRemoveVolume).toHaveBeenNthCalledWith(2, secondVolume);

    const openButtons = dataNodes(renderer.root, 'data-open-chapter');
    const editButtons = dataNodes(renderer.root, 'data-edit-chapter');
    const splitButtons = dataNodes(renderer.root, 'data-split-chapter');
    const mergeButtons = dataNodes(renderer.root, 'data-merge-chapter');
    const moveBlocksButtons = dataNodes(renderer.root, 'data-move-blocks');
    const deleteButtons = dataNodes(renderer.root, 'data-delete-chapter');

    expect(mergeButtons[0]?.props.disabled).toBe(true);
    expect(moveBlocksButtons[0]?.props.disabled).toBe(true);
    expect(mergeButtons[1]?.props.disabled).toBe(false);
    expect(moveBlocksButtons[1]?.props.disabled).toBe(false);

    for (let index = 0; index < openButtons.length; index += 1) {
      click(openButtons[index]!);
      click(editButtons[index]!);
      click(splitButtons[index]!);
      click(mergeButtons[index]!);
      click(moveBlocksButtons[index]!);
      click(deleteButtons[index]!);
    }

    expect(props.onOpenChapter).toHaveBeenCalledTimes(3);
    expect(props.onEditChapter).toHaveBeenNthCalledWith(2, secondVolume, chapterTwo);
    expect(props.onSplitChapter).toHaveBeenNthCalledWith(3, chapterThree);
    expect(props.onMergeChapter).toHaveBeenNthCalledWith(2, secondVolume, chapterTwo, 0);
    expect(props.onMergeChapter).toHaveBeenNthCalledWith(3, secondVolume, chapterThree, 1);
    expect(props.onMoveBlocks).toHaveBeenNthCalledWith(3, secondVolume, chapterThree, 1);
    expect(props.onRemoveChapter).toHaveBeenNthCalledWith(1, chapterOne);
    expect(props.onRemoveChapter).toHaveBeenNthCalledWith(3, chapterThree);
  });

  it('keeps compact and locked trees minimal and blocks every unsafe write affordance', async () => {
    const renderer = await renderTree(
      baseProps({
        commandPending: true,
        compact: true,
        previewPending: true,
        readOnly: true,
      }),
    );

    expect(dataNodes(renderer.root, 'data-structure-tree')[0]?.props['data-compact']).toBe('true');
    expect(dataNodes(renderer.root, 'data-edit-volume')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-delete-volume')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-edit-chapter')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-split-chapter')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-merge-chapter')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-move-blocks')).toHaveLength(0);
    expect(dataNodes(renderer.root, 'data-delete-chapter')).toHaveLength(0);

    for (const button of dataNodes(renderer.root, 'data-add-chapter')) {
      expect(button.props.disabled).toBe(true);
      expect(textContent(button)).toBe('新章');
    }
    for (const button of dataNodes(renderer.root, 'data-open-chapter')) {
      expect(button.props.disabled).toBe(true);
    }
  });
});
