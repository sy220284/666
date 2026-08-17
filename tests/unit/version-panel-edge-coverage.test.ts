import { createRequire } from 'node:module';

import type {
  Chapter,
  DraftDocument,
  ProjectWorkspaceSummary,
  VersionDocument,
  VersionSummary,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { VersionPanel } from '../../apps/desktop/renderer/src/features/writing/version-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

vi.mock('../../apps/desktop/renderer/src/features/writing/review-diff-panel.js', () => ({
  ReviewDiffPanel: () => null,
}));

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
const draftId = '33333333-3333-4333-8333-333333333333';
const firstVersionId = '44444444-4444-4444-8444-444444444444';
const secondVersionId = '55555555-5555-4555-8555-555555555555';
const active: TestRenderer[] = [];

function project(mode: ProjectWorkspaceSummary['databaseMode'] = 'read-write') {
  return contractInput<ProjectWorkspaceSummary>({ projectId, databaseMode: mode });
}
function chapter() {
  return contractInput<Chapter>({ id: chapterId, title: '第一章' });
}
function draft(revision = 7) {
  return contractInput<DraftDocument>({
    draftId,
    revision,
    blocks: [{ logicalBlockId: 'block-1', text: '当前正文' }],
  });
}
function summary(
  versionId: string,
  title: string,
  options: { label?: string | null; finalized?: boolean } = {},
): VersionSummary {
  return contractInput<VersionSummary>({
    versionId,
    title,
    wordCount: 10,
    sourceRevision: 5,
    label: options.label === undefined ? '节点' : options.label,
    finalized: options.finalized ?? false,
  });
}
function document(versionId: string, title: string): VersionDocument {
  return contractInput<VersionDocument>({
    versionId,
    title,
    blocks: [{ logicalBlockId: 'block-1', text: `${title}正文` }],
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function bridgeHarness() {
  const versionList = vi.fn().mockResolvedValue({
    state: 'success',
    data: {
      versions: [
        summary(firstVersionId, '版本一'),
        summary(secondVersionId, '版本二', { label: null, finalized: true }),
      ],
    },
  });
  const versionGet = vi.fn().mockResolvedValue({
    state: 'success',
    data: document(firstVersionId, '版本一'),
  });
  const versionCreate = vi.fn().mockResolvedValue({
    state: 'success',
    data: document(firstVersionId, '新版本'),
  });
  const versionSetFinal = vi.fn().mockResolvedValue({
    state: 'success',
    data: document(firstVersionId, '版本一'),
  });
  const versionRestore = vi.fn().mockResolvedValue({ state: 'success', data: draft(8) });
  const draftOpen = vi.fn().mockResolvedValue({ state: 'success', data: draft() });
  const exportVersion = vi.fn().mockResolvedValue({ state: 'success', data: undefined });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      version: {
        list: versionList,
        get: versionGet,
        create: versionCreate,
        setFinal: versionSetFinal,
        restore: versionRestore,
      },
      draft: { open: draftOpen },
      recovery: { exportVersion },
    }),
    versionList,
    versionGet,
    versionCreate,
    versionSetFinal,
    versionRestore,
    draftOpen,
    exportVersion,
  };
}

async function render(
  harness: ReturnType<typeof bridgeHarness>,
  options: {
    navigationVersionId?: string | null;
    workspace?: ProjectWorkspaceSummary;
    flush?: ReturnType<typeof vi.fn>;
    onDraftReplace?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const flush = options.flush ?? vi.fn().mockResolvedValue(true);
  const onDraftReplace = options.onDraftReplace ?? vi.fn();
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(VersionPanel, {
        bridge: harness.bridge,
        chapter: chapter(),
        draft: draft(),
        project: options.workspace ?? project(),
        navigationVersionId: options.navigationVersionId ?? null,
        flush,
        onClose: vi.fn(),
        onDraftReplace,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  active.push(renderer);
  return { renderer, flush, onDraftReplace };
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}
function action(root: TestInstance, name: string, index = 0): TestInstance {
  const node = root.findAll((candidate) => candidate.props['data-version-action'] === name)[index];
  if (!node) throw new Error(`Missing action ${name}:${index}`);
  return node;
}
function form(root: TestInstance): TestInstance {
  const node = root.findAll((candidate) => candidate.type === 'form')[0];
  if (!node) throw new Error('Missing form');
  return node;
}
async function invoke(node: TestInstance, prop: 'onClick' | 'onSubmit', argument?: unknown) {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}`);
  await act(async () => {
    handler(argument);
    await Promise.resolve();
    await Promise.resolve();
  });
}

class TestFormData {
  readonly #values: Record<string, unknown>;
  constructor(form: unknown) {
    this.#values = contractInput<{ values: Record<string, unknown> }>(form).values;
  }
  get(name: string): unknown {
    return Object.hasOwn(this.#values, name) ? this.#values[name] : null;
  }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FormData', TestFormData);
});
afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('VersionPanel remaining edge coverage', () => {
  it('covers initial list failure and navigation-version failure', async () => {
    const harness = bridgeHarness();
    harness.versionList.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'DB_READ_FAILED_003', message: '列表失败', retryable: true },
    });
    const listFailureView = await render(harness);
    expect(textContent(listFailureView.renderer.root)).toContain('版本读取失败');

    const navigationHarness = bridgeHarness();
    navigationHarness.versionGet.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'VERSION_MISSING', message: '版本不存在', retryable: false },
    });
    const navigationView = await render(navigationHarness, { navigationVersionId: firstVersionId });
    expect(textContent(navigationView.renderer.root)).toContain(
      '目标历史版本已经变化，请重新搜索。',
    );
  });

  it('covers locked/blank create and failure/cancellation with null optional form values', async () => {
    const locked = bridgeHarness();
    const readOnlyView = await render(locked, { workspace: project('read-only') });
    await invoke(form(readOnlyView.renderer.root), 'onSubmit', {
      currentTarget: { reset: vi.fn(), values: { title: '只读版本' } },
      preventDefault: vi.fn(),
    });
    expect(locked.versionCreate).not.toHaveBeenCalled();

    const harness = bridgeHarness();
    const view = await render(harness);
    await invoke(form(view.renderer.root), 'onSubmit', {
      currentTarget: { reset: vi.fn(), values: { title: '   ' } },
      preventDefault: vi.fn(),
    });
    expect(harness.versionCreate).not.toHaveBeenCalled();

    harness.versionCreate
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'VERSION_WRITE_FAILED', message: '写入失败', retryable: true },
      })
      .mockResolvedValueOnce({ state: 'cancelled' });
    const failureForm = { reset: vi.fn(), values: { title: '失败版本' } };
    await invoke(form(view.renderer.root), 'onSubmit', {
      currentTarget: failureForm,
      preventDefault: vi.fn(),
    });
    expect(harness.versionCreate).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: '失败版本', label: null, description: '' }),
    );
    expect(textContent(view.renderer.root)).toContain('创建失败');
    await invoke(form(view.renderer.root), 'onSubmit', {
      currentTarget: { reset: vi.fn(), values: { title: '取消版本' } },
      preventDefault: vi.fn(),
    });
    expect(textContent(view.renderer.root)).toContain('创建已取消。');
  });

  it('covers manual preview stale result and preview failure', async () => {
    const harness = bridgeHarness();
    const first = deferred<{ state: 'success'; data: VersionDocument }>();
    harness.versionGet
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ state: 'success', data: document(secondVersionId, '版本二') });
    const view = await render(harness);
    const compareButtons = view.renderer.root.findAll(
      (node) => node.props['data-version-action'] === 'compare',
    );
    const firstClick = compareButtons[0]!.props.onClick;
    const secondClick = compareButtons[1]!.props.onClick;
    if (typeof firstClick !== 'function' || typeof secondClick !== 'function') {
      throw new Error('Missing compare handlers');
    }
    await act(async () => {
      firstClick();
      secondClick();
      await Promise.resolve();
      await Promise.resolve();
    });
    first.resolve({ state: 'success', data: document(firstVersionId, '版本一迟到') });
    await act(async () => {
      await first.promise;
      await Promise.resolve();
    });
    expect(textContent(view.renderer.root)).toContain('正在比较：版本二');
    expect(textContent(view.renderer.root)).not.toContain('版本一迟到');

    harness.versionGet.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'VERSION_MISSING', message: '版本不存在', retryable: false },
    });
    await invoke(action(view.renderer.root, 'compare'), 'onClick');
    expect(textContent(view.renderer.root)).toContain('预览失败');
  });

  it('covers finalize failure and command-coordinator failed outcome', async () => {
    const harness = bridgeHarness();
    harness.versionSetFinal
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'VERSION_FINAL_FAILED', message: '定稿失败', retryable: true },
      })
      .mockRejectedValueOnce(new Error('unexpected mutation failure'));
    const view = await render(harness);
    await invoke(action(view.renderer.root, 'final'), 'onClick');
    expect(textContent(view.renderer.root)).toContain('定稿失败');
    await invoke(action(view.renderer.root, 'final'), 'onClick');
    expect(textContent(view.renderer.root)).toContain('历史版本操作遇到异常');
  });

  it('covers current-draft cancellation and restore failure', async () => {
    const harness = bridgeHarness();
    harness.draftOpen
      .mockResolvedValueOnce({ state: 'cancelled' })
      .mockResolvedValueOnce({ state: 'success', data: draft() });
    harness.versionRestore.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'VERSION_RESTORE_FAILED', message: '恢复失败', retryable: true },
    });
    const view = await render(harness);
    await invoke(action(view.renderer.root, 'restore'), 'onClick');
    expect(textContent(view.renderer.root)).toContain('当前稿确认已取消。');
    await invoke(action(view.renderer.root, 'restore'), 'onClick');
    expect(textContent(view.renderer.root)).toContain('恢复失败');
  });

  it('covers export success and true pending early-return plus finalized/no-label rendering', async () => {
    const harness = bridgeHarness();
    const pending = deferred<{ state: 'success'; data: VersionDocument }>();
    harness.versionSetFinal.mockReturnValueOnce(pending.promise);
    const view = await render(harness);
    expect(textContent(view.renderer.root)).toContain('版本二');
    expect(textContent(view.renderer.root)).toContain(' · 定稿');

    await invoke(action(view.renderer.root, 'final'), 'onClick');
    expect(action(view.renderer.root, 'export').props.disabled).toBe(true);
    await invoke(action(view.renderer.root, 'export'), 'onClick');
    expect(harness.exportVersion).not.toHaveBeenCalled();
    pending.resolve({ state: 'success', data: document(firstVersionId, '版本一') });
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
      await Promise.resolve();
    });

    await invoke(action(view.renderer.root, 'export'), 'onClick');
    expect(harness.exportVersion).toHaveBeenCalledWith({ projectId, versionId: firstVersionId });
    expect(textContent(view.renderer.root)).toContain('历史版本已导出。');
  });
  it('covers all cancelled outcomes and a missing create title field', async () => {
    const listCancelled = bridgeHarness();
    listCancelled.versionList.mockResolvedValueOnce({ state: 'cancelled' });
    await render(listCancelled);

    const navigationCancelled = bridgeHarness();
    navigationCancelled.versionGet.mockResolvedValueOnce({ state: 'cancelled' });
    await render(navigationCancelled, { navigationVersionId: firstVersionId });

    const harness = bridgeHarness();
    const view = await render(harness);
    await invoke(form(view.renderer.root), 'onSubmit', {
      currentTarget: { reset: vi.fn(), values: {} },
      preventDefault: vi.fn(),
    });
    expect(harness.versionCreate).not.toHaveBeenCalled();

    harness.versionGet.mockResolvedValueOnce({ state: 'cancelled' });
    await invoke(action(view.renderer.root, 'compare'), 'onClick');

    harness.versionSetFinal.mockResolvedValueOnce({ state: 'cancelled' });
    await invoke(action(view.renderer.root, 'final'), 'onClick');

    harness.versionRestore.mockResolvedValueOnce({ state: 'cancelled' });
    await invoke(action(view.renderer.root, 'restore'), 'onClick');

    harness.exportVersion.mockResolvedValueOnce({ state: 'cancelled' });
    await invoke(action(view.renderer.root, 'export'), 'onClick');
  });
});
