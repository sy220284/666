import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrashEntry } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { TrashPanel } from '../../apps/desktop/renderer/src/features/structure/trash-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  commandError: null as null | { code: string; message: string; retryable: boolean },
  commandPending: false,
  commandRun: vi.fn(),
  commandRefresh: null as null | (() => Promise<void>),
  queryLoad: null as null | (() => Promise<unknown>),
  resourceData: undefined as undefined | { entries: TrashEntry[] },
  resourceRefresh: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.queryLoad = load;
    return {
      data: controls.resourceData,
      refresh: controls.resourceRefresh,
    };
  },
  useBridgeCommand: (refresh?: () => Promise<void>) => {
    controls.commandRefresh = refresh ?? null;
    return {
      pending: controls.commandPending,
      error: controls.commandError,
      run: controls.commandRun,
    };
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
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const activeRenderers: TestRenderer[] = [];

function entry(): TrashEntry {
  return contractInput<TrashEntry>({
    id: 'trash-1',
    title: '被删除的章节',
    entityType: 'chapter',
  });
}

function createBridge() {
  const list = vi.fn().mockResolvedValue({ state: 'success', data: { entries: [] } });
  const restore = vi.fn().mockResolvedValue({ state: 'success', data: entry() });
  const previewPermanentDelete = vi.fn().mockResolvedValue({
    state: 'success',
    data: { canDelete: true, blockers: [], planHash: 'plan-1' },
  });
  const permanentDelete = vi.fn().mockResolvedValue({
    state: 'success',
    data: { backupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
  });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      trash: { list, restore, previewPermanentDelete, permanentDelete },
    }),
    list,
    restore,
    previewPermanentDelete,
    permanentDelete,
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

function click(node: TestInstance): void {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick.');
  (handler as () => void)();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderPanel(options: {
  bridge: RendererBridgeAdapter;
  readOnly?: boolean;
  onClose?: ReturnType<typeof vi.fn>;
  onStructureRefresh?: ReturnType<typeof vi.fn>;
}): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(TrashPanel, {
        bridge: options.bridge,
        projectId,
        readOnly: options.readOnly ?? false,
        onClose: options.onClose ?? vi.fn(),
        onStructureRefresh: options.onStructureRefresh ?? vi.fn().mockResolvedValue(undefined),
      }),
    );
  });
  activeRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controls.commandError = null;
  controls.commandPending = false;
  controls.commandRun.mockReset();
  controls.commandRun.mockImplementation(async (operation: () => Promise<unknown>) => {
    const outcome = (await operation()) as { state?: string; data?: unknown };
    return outcome.state === 'success' ? outcome.data : null;
  });
  controls.commandRefresh = null;
  controls.queryLoad = null;
  controls.resourceData = undefined;
  controls.resourceRefresh.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('window', { prompt: vi.fn() });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('TrashPanel destructive-operation coverage', () => {
  it('loads through the replace lane, refreshes both views and renders empty/error/close states', async () => {
    const harness = createBridge();
    controls.resourceData = { entries: [] };
    controls.commandError = {
      code: 'COMMON_TIMEOUT_005',
      message: '回收站操作超时。',
      retryable: true,
    };
    const onClose = vi.fn();
    const onStructureRefresh = vi.fn().mockResolvedValue(undefined);
    const renderer = await renderPanel({
      bridge: harness.bridge,
      onClose,
      onStructureRefresh,
    });

    expect(textContent(renderer.root)).toContain('回收站为空。');
    expect(textContent(renderer.root)).toContain('操作等待超时');
    click(dataNode(renderer.root, 'data-close-trash'));
    expect(onClose).toHaveBeenCalledOnce();

    expect(controls.queryLoad).not.toBeNull();
    await controls.queryLoad?.();
    expect(harness.list).toHaveBeenCalledWith(projectId, { mode: 'replace' });

    expect(controls.commandRefresh).not.toBeNull();
    await controls.commandRefresh?.();
    expect(controls.resourceRefresh).toHaveBeenCalledOnce();
    expect(onStructureRefresh).toHaveBeenCalledOnce();
  });

  it('restores an entry and enforces read-only or pending button locks', async () => {
    const harness = createBridge();
    controls.resourceData = { entries: [entry()] };
    const renderer = await renderPanel({ bridge: harness.bridge });

    expect(textContent(renderer.root)).toContain('被删除的章节');
    expect(textContent(renderer.root)).toContain('chapter');
    const restoreButton = dataNode(renderer.root, 'data-restore-original');
    const deleteButton = dataNode(renderer.root, 'data-permanent-delete');
    expect(restoreButton.props.disabled).toBe(false);
    expect(deleteButton.props.disabled).toBe(false);
    await act(async () => {
      click(restoreButton);
      await flushPromises();
    });
    expect(harness.restore).toHaveBeenCalledWith({
      projectId,
      trashEntryId: 'trash-1',
      placement: 'original',
    });

    controls.commandPending = true;
    const pendingRenderer = await renderPanel({ bridge: harness.bridge, readOnly: true });
    expect(dataNode(pendingRenderer.root, 'data-restore-original').props.disabled).toBe(true);
    expect(dataNode(pendingRenderer.root, 'data-permanent-delete').props.disabled).toBe(true);
  });

  it('stops permanent deletion when preview fails or blockers deny deletion', async () => {
    const harness = createBridge();
    controls.resourceData = { entries: [entry()] };
    harness.previewPermanentDelete
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'COMMON_CONFLICT_003', message: '预览失效。', retryable: true },
      })
      .mockResolvedValueOnce({
        state: 'success',
        data: {
          canDelete: false,
          planHash: 'blocked-plan',
          blockers: [
            { source: '场景引用', kind: 'scene', deleteAction: '同步删除', count: 2 },
            { source: null, kind: 'canon', deleteAction: null, count: 1 },
          ],
        },
      });
    const renderer = await renderPanel({ bridge: harness.bridge });

    await act(async () => {
      click(dataNode(renderer.root, 'data-permanent-delete'));
      await flushPromises();
    });
    expect(window.prompt as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
    expect(harness.permanentDelete).not.toHaveBeenCalled();

    await act(async () => {
      click(dataNode(renderer.root, 'data-permanent-delete'));
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('永久删除已阻止');
    expect(textContent(renderer.root)).toContain('场景引用 同步删除 ×2');
    expect(textContent(renderer.root)).toContain('canon  ×1');
    expect(harness.permanentDelete).not.toHaveBeenCalled();
  });

  it('requires an exact title, handles a cancelled delete result and reports successful backup evidence', async () => {
    const harness = createBridge();
    controls.resourceData = { entries: [entry()] };
    const prompt = window.prompt as ReturnType<typeof vi.fn>;
    prompt
      .mockReturnValueOnce('错误标题')
      .mockReturnValueOnce('被删除的章节')
      .mockReturnValueOnce('被删除的章节');
    harness.permanentDelete.mockResolvedValueOnce({ state: 'cancelled' }).mockResolvedValueOnce({
      state: 'success',
      data: { backupId: '12345678-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    const renderer = await renderPanel({ bridge: harness.bridge });

    await act(async () => {
      click(dataNode(renderer.root, 'data-permanent-delete'));
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('标题确认不匹配，已取消永久删除');
    expect(harness.permanentDelete).not.toHaveBeenCalled();

    await act(async () => {
      click(dataNode(renderer.root, 'data-permanent-delete'));
      await flushPromises();
    });
    expect(harness.permanentDelete).toHaveBeenNthCalledWith(1, {
      projectId,
      trashEntryId: 'trash-1',
      planHash: 'plan-1',
      confirmationTitle: '被删除的章节',
    });
    expect(textContent(renderer.root)).toContain('标题确认不匹配，已取消永久删除');

    await act(async () => {
      click(dataNode(renderer.root, 'data-permanent-delete'));
      await flushPromises();
    });
    expect(harness.permanentDelete).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain('已永久删除 · 恢复点 12345678…');
  });
});
