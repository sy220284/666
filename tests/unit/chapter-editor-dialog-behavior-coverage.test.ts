import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, ProjectStructure, Volume } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { ChapterEditorDialog } from '../../apps/desktop/renderer/src/features/structure/chapter-editor-dialog.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  error: null as null | { code: string; message: string; retryable: boolean },
  pending: false,
  run: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeCommand: () => ({
    pending: controls.pending,
    error: controls.error,
    run: controls.run,
  }),
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
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const activeRenderers: TestRenderer[] = [];

const volumeOne = contractInput<Volume>({ id: 'volume-1', title: '第一卷', chapters: [] });
const volumeTwo = contractInput<Volume>({ id: 'volume-2', title: '第二卷', chapters: [] });
const chapter = contractInput<Chapter>({
  id: 'chapter-1',
  title: '旧标题',
  status: 'writing',
  targetWordMin: 1200,
  targetWordMax: null,
});
const structure = contractInput<ProjectStructure>({ volumes: [volumeOne, volumeTwo] });

function createBridge() {
  const createChapter = vi.fn().mockResolvedValue({ state: 'success', data: chapter });
  const updateChapter = vi.fn().mockResolvedValue({ state: 'success', data: chapter });
  const moveChapter = vi.fn().mockResolvedValue({ state: 'success', data: chapter });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      planning: { createChapter, updateChapter, moveChapter },
    }),
    createChapter,
    updateChapter,
    moveChapter,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}
function dataNode(root: TestInstance, key: string): TestInstance {
  const node = root.findAll((candidate) => candidate.props[key] !== undefined)[0];
  if (!node) throw new Error(`Missing ${key}.`);
  return node;
}
function submit(root: TestInstance, currentTarget: unknown): void {
  const handler = dataNode(root, 'data-structure-form').props.onSubmit;
  if (typeof handler !== 'function') throw new Error('Missing submit handler.');
  (handler as (event: unknown) => void)({ currentTarget, preventDefault: vi.fn() });
}
async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function installFormData(values: Record<string, string | null>): void {
  class FakeFormData {
    get(name: string): string | null {
      return values[name] ?? null;
    }
  }
  vi.stubGlobal('FormData', FakeFormData);
}

async function renderDialog(options: {
  bridge: RendererBridgeAdapter;
  chapter?: Chapter | null;
  structure?: ProjectStructure | null;
  onClose?: ReturnType<typeof vi.fn>;
  onSaved?: ReturnType<typeof vi.fn>;
}): Promise<{
  renderer: TestRenderer;
  onClose: ReturnType<typeof vi.fn>;
  onSaved: ReturnType<typeof vi.fn>;
}> {
  const onClose = options.onClose ?? vi.fn();
  const onSaved = options.onSaved ?? vi.fn().mockResolvedValue(undefined);
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(ChapterEditorDialog, {
        bridge: options.bridge,
        chapter: options.chapter ?? null,
        projectId,
        structure: options.structure === undefined ? structure : options.structure,
        volume: volumeOne,
        onClose,
        onSaved,
      }),
    );
  });
  activeRenderers.push(renderer);
  return { renderer, onClose, onSaved };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controls.error = null;
  controls.pending = false;
  controls.run.mockReset();
  controls.run.mockImplementation(async (operation: () => Promise<unknown>) => {
    const outcome = (await operation()) as { state?: string; data?: unknown };
    return outcome.state === 'success' ? outcome.data : null;
  });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('ChapterEditorDialog author behavior coverage', () => {
  it('creates a chapter from trimmed form values and only refreshes after success', async () => {
    const harness = createBridge();
    installFormData({ title: '  新章节  ' });
    const view = await renderDialog({ bridge: harness.bridge, structure: null });

    expect(textContent(view.renderer.root)).toContain('新建章节');
    expect(dataNode(view.renderer.root, 'data-structure-status-field').props.hidden).toBe(true);
    expect(dataNode(view.renderer.root, 'data-structure-volume-field').props.hidden).toBe(true);
    expect(dataNode(view.renderer.root, 'data-structure-word-fields').props.hidden).toBe(true);

    await act(async () => {
      submit(view.renderer.root, {});
      await flushPromises();
    });
    expect(harness.createChapter).toHaveBeenCalledWith({
      projectId,
      volumeId: 'volume-1',
      title: '新章节',
    });
    expect(view.onSaved).toHaveBeenCalledOnce();

    harness.createChapter.mockResolvedValueOnce({ state: 'cancelled' });
    installFormData({ title: null });
    await act(async () => {
      submit(view.renderer.root, {});
      await flushPromises();
    });
    expect(view.onSaved).toHaveBeenCalledOnce();
  });

  it('updates chapter metadata without moving when the volume remains unchanged', async () => {
    const harness = createBridge();
    installFormData({
      title: '  新标题  ',
      status: 'reviewing',
      volumeId: 'volume-1',
      targetWordMin: '1500',
      targetWordMax: '',
    });
    const view = await renderDialog({ bridge: harness.bridge, chapter });

    expect(textContent(view.renderer.root)).toContain('编辑章节');
    expect(dataNode(view.renderer.root, 'data-structure-status-field').props.hidden).toBe(false);
    expect(dataNode(view.renderer.root, 'data-structure-volume-field').props.hidden).toBe(false);
    expect(dataNode(view.renderer.root, 'data-structure-word-fields').props.hidden).toBe(false);
    expect(textContent(view.renderer.root)).toContain('第一卷');
    expect(textContent(view.renderer.root)).toContain('第二卷');

    await act(async () => {
      submit(view.renderer.root, {});
      await flushPromises();
    });
    expect(harness.updateChapter).toHaveBeenCalledWith({
      projectId,
      chapterId: 'chapter-1',
      patch: {
        title: '新标题',
        status: 'reviewing',
        targetWordMin: 1500,
        targetWordMax: null,
      },
    });
    expect(harness.moveChapter).not.toHaveBeenCalled();
    expect(view.onSaved).toHaveBeenCalledOnce();
  });

  it('does not move after update failure and moves to another volume only after update success', async () => {
    const harness = createBridge();
    installFormData({
      title: '跨卷章节',
      status: 'finalized',
      volumeId: 'volume-2',
      targetWordMin: null,
      targetWordMax: '3000',
    });
    harness.updateChapter
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'COMMON_CONFLICT_003', message: '章节已变化。', retryable: true },
      })
      .mockResolvedValueOnce({ state: 'success', data: chapter });
    const view = await renderDialog({ bridge: harness.bridge, chapter });

    await act(async () => {
      submit(view.renderer.root, {});
      await flushPromises();
    });
    expect(harness.moveChapter).not.toHaveBeenCalled();
    expect(view.onSaved).not.toHaveBeenCalled();

    await act(async () => {
      submit(view.renderer.root, {});
      await flushPromises();
    });
    expect(harness.moveChapter).toHaveBeenCalledWith({
      projectId,
      chapterId: 'chapter-1',
      targetVolumeId: 'volume-2',
      placement: { kind: 'end' },
    });
    expect(view.onSaved).toHaveBeenCalledOnce();
  });

  it('shows command error, pending locks and closes only through the explicit close action', async () => {
    controls.pending = true;
    controls.error = {
      code: 'COMMON_TIMEOUT_005',
      message: '章节保存超时。',
      retryable: true,
    };
    const harness = createBridge();
    const onClose = vi.fn();
    const view = await renderDialog({ bridge: harness.bridge, chapter, onClose });

    expect(textContent(view.renderer.root)).toContain('操作等待超时');
    expect(dataNode(view.renderer.root, 'data-save-structure').props.disabled).toBe(true);
    const close = view.renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node).includes('关闭'),
    )[0]!;
    expect(close.props.disabled).toBe(true);
    const handler = close.props.onClick;
    expect(typeof handler).toBe('function');
    (handler as () => void)();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
