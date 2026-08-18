import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Chapter,
  DraftDocument,
  ProjectWorkspaceSummary,
  VersionDocument,
  VersionSummary,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

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

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const secondVersionId = '55555555-5555-4555-8555-555555555555';
const activeRenderers: TestRenderer[] = [];

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonByAction(root: TestInstance, action: string): TestInstance {
  const button = root.findAll(
    (node) => node.type === 'button' && node.props['data-version-action'] === action,
  )[0];
  if (!button) throw new Error(`Missing version action: ${action}`);
  return button;
}

function formNode(root: TestInstance): TestInstance {
  const form = root.findAll((node) => node.type === 'form')[0];
  if (!form) throw new Error('Missing version form.');
  return form;
}

function invoke(node: TestInstance, name: 'onClick' | 'onSubmit', argument?: unknown): void {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name} handler.`);
  (handler as (value?: unknown) => void)(argument);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<Value>() {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

function project(databaseMode: ProjectWorkspaceSummary['databaseMode'] = 'read-write') {
  return contractInput<ProjectWorkspaceSummary>({ projectId, databaseMode });
}

function chapter(): Chapter {
  return contractInput<Chapter>({ id: chapterId, title: '第一章' });
}

function draft(revision = 7): DraftDocument {
  return contractInput<DraftDocument>({
    draftId,
    revision,
    blocks: [
      {
        logicalBlockId: 'block-1',
        text: '当前正文',
      },
    ],
  });
}

function summary(id = versionId, title = '历史版本一'): VersionSummary {
  return contractInput<VersionSummary>({
    versionId: id,
    title,
    wordCount: 4,
    sourceRevision: 6,
    label: '节点',
    finalized: false,
  });
}

function document(id = versionId, title = '历史版本一'): VersionDocument {
  return contractInput<VersionDocument>({
    versionId: id,
    title,
    blocks: [{ logicalBlockId: 'block-1', text: `${title}正文` }],
  });
}

function createBridge() {
  const versionList = vi.fn().mockResolvedValue({
    state: 'success',
    data: { versions: [summary()] },
  });
  const versionGet = vi.fn().mockResolvedValue({ state: 'success', data: document() });
  const versionCreate = vi.fn().mockResolvedValue({ state: 'success', data: document() });
  const versionSetFinal = vi.fn().mockResolvedValue({
    state: 'success',
    data: contractInput<VersionDocument>({ ...document(), finalized: true }),
  });
  const versionRestore = vi.fn().mockResolvedValue({
    state: 'success',
    data: draft(8),
  });
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

async function renderPanel(options: {
  bridge: RendererBridgeAdapter;
  navigationVersionId?: string | null;
  flush?: ReturnType<typeof vi.fn>;
  onDraftReplace?: ReturnType<typeof vi.fn>;
  workspace?: ProjectWorkspaceSummary;
}): Promise<{
  renderer: TestRenderer;
  flush: ReturnType<typeof vi.fn>;
  onDraftReplace: ReturnType<typeof vi.fn>;
}> {
  const flush = options.flush ?? vi.fn().mockResolvedValue(true);
  const onDraftReplace = options.onDraftReplace ?? vi.fn();
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(VersionPanel, {
        bridge: options.bridge,
        chapter: chapter(),
        draft: draft(),
        project: options.workspace ?? project(),
        navigationVersionId: options.navigationVersionId ?? null,
        flush,
        onClose: vi.fn(),
        onDraftReplace,
      }),
    );
    await flushPromises();
  });
  activeRenderers.push(renderer);
  return { renderer, flush, onDraftReplace };
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

describe('VersionPanel critical author behavior coverage', () => {
  it('keeps the latest navigation preview when an older request resolves later', async () => {
    const harness = createBridge();
    const first = deferred<{ state: 'success'; data: VersionDocument }>();
    harness.versionGet
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ state: 'success', data: document(secondVersionId, '历史版本二') });
    const view = await renderPanel({ bridge: harness.bridge, navigationVersionId: versionId });

    expect(harness.versionList).toHaveBeenCalledWith(projectId, chapterId, { mode: 'replace' });
    expect(harness.versionGet).toHaveBeenNthCalledWith(
      1,
      { projectId, chapterId, versionId },
      { mode: 'replace' },
    );

    await act(async () => {
      view.renderer.update(
        createElement(VersionPanel, {
          bridge: harness.bridge,
          chapter: chapter(),
          draft: draft(),
          project: project(),
          navigationVersionId: secondVersionId,
          flush: view.flush,
          onClose: vi.fn(),
          onDraftReplace: view.onDraftReplace,
        }),
      );
      await flushPromises();
    });
    expect(harness.versionGet).toHaveBeenNthCalledWith(
      2,
      { projectId, chapterId, versionId: secondVersionId },
      { mode: 'replace' },
    );
    expect(textContent(view.renderer.root)).toContain('正在比较：历史版本二');

    await act(async () => {
      first.resolve({ state: 'success', data: document(versionId, '历史版本一') });
      await flushPromises();
    });
    expect(textContent(view.renderer.root)).toContain('正在比较：历史版本二');
    expect(textContent(view.renderer.root)).not.toContain('正在比较：历史版本一');
  });

  it('gates restore behind autosave and a fresh current-draft confirmation before replacing the draft', async () => {
    const harness = createBridge();
    const flush = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    harness.draftOpen
      .mockResolvedValueOnce({
        state: 'failure',
        error: { code: 'DRAFT_STALE', message: '当前稿已变化。', retryable: true },
      })
      .mockResolvedValue({ state: 'success', data: draft() });
    const view = await renderPanel({ bridge: harness.bridge, flush });

    await act(async () => {
      invoke(buttonByAction(view.renderer.root, 'restore'), 'onClick');
      await flushPromises();
    });
    expect(harness.draftOpen).not.toHaveBeenCalled();
    expect(harness.versionRestore).not.toHaveBeenCalled();
    expect(textContent(view.renderer.root)).toContain('自动保存失败，未恢复历史版本。');

    await act(async () => {
      invoke(buttonByAction(view.renderer.root, 'restore'), 'onClick');
      await flushPromises();
    });
    expect(harness.draftOpen).toHaveBeenNthCalledWith(
      1,
      { projectId, chapterId },
      { mode: 'replace' },
    );
    expect(harness.versionRestore).not.toHaveBeenCalled();
    expect(textContent(view.renderer.root)).toContain('当前稿确认失败');

    await act(async () => {
      invoke(buttonByAction(view.renderer.root, 'restore'), 'onClick');
      await flushPromises();
    });
    expect(harness.versionRestore).toHaveBeenCalledWith({
      projectId,
      chapterId,
      versionId,
      expectedDraftId: draftId,
      expectedRevision: 7,
    });
    expect(view.onDraftReplace).toHaveBeenCalledWith(
      expect.objectContaining({ draftId, revision: 8 }),
      '已自动留档恢复前当前稿，并从只读历史版本创建新当前稿。',
    );
    expect(textContent(view.renderer.root)).toContain('恢复成功');
  });

  it('rejects a concurrent version operation instead of issuing a second backend mutation', async () => {
    const harness = createBridge();
    const pendingFinal = deferred<{ state: 'success'; data: VersionDocument }>();
    harness.versionSetFinal.mockReturnValueOnce(pendingFinal.promise);
    const view = await renderPanel({ bridge: harness.bridge });
    const finalButton = buttonByAction(view.renderer.root, 'final');
    const exportButton = buttonByAction(view.renderer.root, 'export');

    await act(async () => {
      invoke(finalButton, 'onClick');
      invoke(exportButton, 'onClick');
      await flushPromises();
    });
    expect(harness.versionSetFinal).toHaveBeenCalledWith({ projectId, chapterId, versionId });
    expect(harness.exportVersion).not.toHaveBeenCalled();
    expect(textContent(view.renderer.root)).toContain('已有历史版本操作正在处理中');

    await act(async () => {
      pendingFinal.resolve({
        state: 'success',
        data: contractInput<VersionDocument>({ ...document(), finalized: true }),
      });
      await flushPromises();
    });
    expect(harness.versionList).toHaveBeenCalledTimes(2);
  });

  it('creates only after autosave, snapshots form values, and reports export failures', async () => {
    const harness = createBridge();
    const flush = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
    const view = await renderPanel({ bridge: harness.bridge, flush });
    const reset = vi.fn();
    const fakeForm = {
      reset,
      values: {
        title: '  关键节点  ',
        label: '  转折  ',
        description: '恢复前留档',
      },
    };
    type FakeFormValues = typeof fakeForm.values;
    class FakeFormData {
      readonly #form: typeof fakeForm;
      constructor(form: typeof fakeForm) {
        this.#form = form;
      }
      get(name: string): string | null {
        return this.#form.values[name as keyof FakeFormValues] ?? null;
      }
    }
    vi.stubGlobal('FormData', FakeFormData);
    const submit = formNode(view.renderer.root);
    const event = { currentTarget: fakeForm, preventDefault: vi.fn() };

    await act(async () => {
      invoke(submit, 'onSubmit', event);
      await flushPromises();
    });
    expect(harness.versionCreate).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();

    await act(async () => {
      invoke(submit, 'onSubmit', event);
      await flushPromises();
    });
    expect(harness.versionCreate).toHaveBeenCalledWith({
      projectId,
      chapterId,
      draftId,
      baseRevision: 7,
      versionType: 'manual',
      parentVersionId: null,
      sourceCandidateId: null,
      title: '关键节点',
      label: '转折',
      description: '恢复前留档',
    });
    expect(reset).toHaveBeenCalledOnce();

    harness.exportVersion.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'EXPORT_FAILED', message: '磁盘不可写。', retryable: true },
    });
    await act(async () => {
      invoke(buttonByAction(view.renderer.root, 'export'), 'onClick');
      await flushPromises();
    });
    expect(harness.exportVersion).toHaveBeenCalledWith({ projectId, versionId });
    expect(textContent(view.renderer.root)).toContain('导出失败');
  });

  it('keeps every mutating version action blocked in read-only mode', async () => {
    const harness = createBridge();
    const view = await renderPanel({ bridge: harness.bridge, workspace: project('read-only') });

    for (const action of ['final', 'restore'] as const) {
      const button = buttonByAction(view.renderer.root, action);
      expect(button.props.disabled).toBe(true);
      await act(async () => {
        invoke(button, 'onClick');
        await flushPromises();
      });
    }
    expect(harness.versionSetFinal).not.toHaveBeenCalled();
    expect(harness.versionRestore).not.toHaveBeenCalled();
    expect(harness.draftOpen).not.toHaveBeenCalled();
  });
});
