import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import {
  DraftFlushFailureDialog,
  DraftFlushFailureDialogView,
} from '../../apps/desktop/renderer/src/components/draft-flush-failure-dialog.js';

const controls = vi.hoisted(() => ({
  flushRegisteredDraft: vi.fn(),
  dispatch: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/runtime/draft-flush-registry.js', () => ({
  DRAFT_FLUSH_FAILED_EVENT: 'worldforge:draft-flush-failed',
  flushRegisteredDraft: controls.flushRegisteredDraft,
}));

vi.mock('../../apps/desktop/renderer/src/state/ui-store.js', () => ({
  useRendererUiStore: (selector: (state: { dispatch: typeof controls.dispatch }) => unknown) =>
    selector({ dispatch: controls.dispatch }),
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
  toJSON(): unknown;
  unmount(): void;
}

const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const failedEvent = 'worldforge:draft-flush-failed';
const activeRenderers: TestRenderer[] = [];
let listeners: Map<string, () => void>;
let addEventListener: ReturnType<typeof vi.fn>;
let removeEventListener: ReturnType<typeof vi.fn>;

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonByLabel(root: TestInstance, label: string): TestInstance {
  const button = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(label),
  )[0];
  if (!button) throw new Error(`Missing button: ${label}`);
  return button;
}

function click(node: TestInstance): void {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick handler.');
  (handler as () => void)();
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function renderDialog(): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(DraftFlushFailureDialog));
  });
  activeRenderers.push(renderer);
  return renderer;
}

async function openDialog(): Promise<void> {
  const listener = listeners.get(failedEvent);
  if (!listener) throw new Error('Missing draft flush failure listener.');
  await act(async () => listener());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controls.flushRegisteredDraft.mockReset();
  controls.dispatch.mockReset();
  listeners = new Map();
  addEventListener = vi.fn((event: string, listener: () => void) => {
    listeners.set(event, listener);
  });
  removeEventListener = vi.fn((event: string, listener: () => void) => {
    if (listeners.get(event) === listener) listeners.delete(event);
  });
  vi.stubGlobal('window', { addEventListener, removeEventListener });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('DraftFlushFailureDialog author safety coverage', () => {
  it('renders the retrying view state and wires every explicit author action', async () => {
    const onRetry = vi.fn();
    const onReturn = vi.fn();
    const onOpenRecovery = vi.fn();
    const onCancel = vi.fn();
    let renderer!: TestRenderer;

    await act(async () => {
      renderer = create(
        createElement(DraftFlushFailureDialogView, {
          notice: '保存仍在处理中。',
          retrying: true,
          onRetry,
          onReturn,
          onOpenRecovery,
          onCancel,
        }),
      );
    });
    activeRenderers.push(renderer);

    expect(textContent(renderer.root)).toContain('保存仍在处理中。');
    expect(buttonByLabel(renderer.root, '正在重试…').props.disabled).toBe(true);
    expect(buttonByLabel(renderer.root, '打开恢复中心').props.disabled).toBe(true);

    click(buttonByLabel(renderer.root, '正在重试…'));
    click(buttonByLabel(renderer.root, '返回正文检查'));
    click(buttonByLabel(renderer.root, '打开恢复中心'));
    click(buttonByLabel(renderer.root, '取消操作'));

    expect(onRetry).toHaveBeenCalledOnce();
    expect(onReturn).toHaveBeenCalledOnce();
    expect(onOpenRecovery).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('subscribes to save failures, opens with the safe notice and removes the listener on unmount', async () => {
    const renderer = await renderDialog();
    expect(renderer.toJSON()).toBeNull();
    expect(addEventListener).toHaveBeenCalledWith(failedEvent, expect.any(Function));

    await openDialog();
    expect(textContent(renderer.root)).toContain('当前稿尚未安全保存，操作已经停止。');
    expect(textContent(renderer.root)).toContain('程序不会自动丢弃当前窗口中的修改');

    await act(async () => renderer.unmount());
    activeRenderers.splice(activeRenderers.indexOf(renderer), 1);
    expect(removeEventListener).toHaveBeenCalledWith(failedEvent, expect.any(Function));
    expect(listeners.has(failedEvent)).toBe(false);
  });

  it('keeps the dialog open after a failed retry and closes only after the draft is saved', async () => {
    controls.flushRegisteredDraft.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const renderer = await renderDialog();
    await openDialog();

    await act(async () => {
      click(buttonByLabel(renderer.root, '重试保存'));
      await flushPromises();
    });
    expect(controls.flushRegisteredDraft).toHaveBeenCalledTimes(1);
    expect(textContent(renderer.root)).toContain(
      '重试保存仍未成功。正文保留在当前窗口，请检查后再次重试。',
    );

    await act(async () => {
      click(buttonByLabel(renderer.root, '重试保存'));
      await flushPromises();
    });
    expect(controls.flushRegisteredDraft).toHaveBeenCalledTimes(2);
    expect(renderer.toJSON()).toBeNull();
  });

  it('never leaves writing for recovery until the current draft flush succeeds', async () => {
    controls.flushRegisteredDraft.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const renderer = await renderDialog();
    await openDialog();

    await act(async () => {
      click(buttonByLabel(renderer.root, '打开恢复中心'));
      await flushPromises();
    });
    expect(controls.dispatch).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain(
      '恢复中心不会在当前稿尚未安全保存时切走写作页面。',
    );

    await act(async () => {
      click(buttonByLabel(renderer.root, '打开恢复中心'));
      await flushPromises();
    });
    expect(controls.dispatch).toHaveBeenCalledOnce();
    expect(controls.dispatch).toHaveBeenCalledWith({
      type: 'navigate',
      route: 'recovery',
    });
    expect(renderer.toJSON()).toBeNull();
  });

  it('lets the author return or cancel, and a later failure reopens with the canonical notice', async () => {
    controls.flushRegisteredDraft.mockResolvedValue(false);
    const renderer = await renderDialog();
    await openDialog();

    await act(async () => click(buttonByLabel(renderer.root, '返回正文检查')));
    expect(renderer.toJSON()).toBeNull();

    await openDialog();
    await act(async () => {
      click(buttonByLabel(renderer.root, '重试保存'));
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('重试保存仍未成功');

    await act(async () => click(buttonByLabel(renderer.root, '取消操作')));
    expect(renderer.toJSON()).toBeNull();

    await openDialog();
    expect(textContent(renderer.root)).toContain('当前稿尚未安全保存，操作已经停止。');
    expect(textContent(renderer.root)).not.toContain('重试保存仍未成功');
  });
});
