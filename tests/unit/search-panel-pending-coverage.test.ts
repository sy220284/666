import { createRequire } from 'node:module';

import type { ReplacePlan, SearchIndexState, SearchProjectResult } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { SearchPanel } from '../../apps/desktop/renderer/src/features/checks/search-panel.js';
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

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const blockId = '77777777-7777-4777-8777-777777777777';
const planId = '88888888-8888-4888-8888-888888888888';
const now = '2026-08-16T00:00:00.000Z';

class FakeFormData {
  private readonly values: Record<string, string>;

  constructor(target?: { readonly values?: Record<string, string> }) {
    this.values = target?.values ?? {};
  }

  get(name: string): string | null {
    return this.values[name] ?? null;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function success<T>(data: T) {
  return { state: 'success' as const, data };
}

function failure() {
  return {
    state: 'failure' as const,
    error: {
      code: 'MODEL_UNAVAILABLE' as const,
      message: '底层错误不直接展示给作者',
      retryable: true,
    },
  };
}

function indexState(status: SearchIndexState['status'] = 'ready'): SearchIndexState {
  return contractInput<SearchIndexState>({
    projectId,
    status,
    pendingCount: 0,
    failedCount: 0,
    lastIndexedAt: null,
    staleAt: null,
    lastErrorCode: null,
    updatedAt: now,
  });
}

function searchResult(): SearchProjectResult {
  return contractInput<SearchProjectResult>({
    projectId,
    query: 'keyword',
    normalizedQuery: 'keyword',
    strategy: 'fts',
    indexStatus: 'ready',
    items: [],
  });
}

function replacePlan(status: ReplacePlan['status'] = 'preview'): ReplacePlan {
  return contractInput<ReplacePlan>({
    planId,
    projectId,
    query: '旧词',
    replacement: '新词',
    matchCase: true,
    status,
    itemCount: 1,
    eligibleCount: 1,
    lockedCount: 0,
    checkpointId: null,
    items: [
      {
        planItemId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        projectId,
        chapterId,
        draftId,
        logicalBlockId: blockId,
        baseRevision: 1,
        expectedBlockHash: 'a'.repeat(64),
        matchedText: '旧词',
        matchStart: 0,
        matchEnd: 2,
        replacement: '新词',
        locked: false,
      },
    ],
    createdAt: now,
    updatedAt: now,
    appliedAt: status === 'applied' ? now : null,
  });
}

function createBridge(overrides: Record<string, unknown> = {}) {
  const methods = {
    getIndexState: vi.fn().mockResolvedValue(success(indexState())),
    listDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: [] })),
    search: vi.fn().mockResolvedValue(success(searchResult())),
    previewReplace: vi.fn().mockResolvedValue(success(replacePlan())),
    applyReplace: vi.fn().mockResolvedValue(failure()),
    upsertDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: [] })),
    deleteDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: [] })),
    rebuildIndex: vi.fn().mockResolvedValue(
      success({
        projectId,
        draftCount: 1,
        versionCount: 0,
        entityCount: 0,
        researchCount: 0,
        failedCount: 0,
        status: 'ready',
      }),
    ),
    ...overrides,
  };
  return {
    bridge: contractInput<RendererBridgeAdapter>({ searchTools: methods }),
    methods,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findOne(
  root: TestInstance,
  predicate: (node: TestInstance) => boolean,
  label: string,
): TestInstance {
  const match = root.findAll(predicate)[0];
  if (!match) throw new Error(`Missing ${label}`);
  return match;
}

function button(root: TestInstance, text: string): TestInstance {
  return findOne(
    root,
    (node) => node.type === 'button' && textContent(node).includes(text),
    `button ${text}`,
  );
}

function form(root: TestInstance, className: string): TestInstance {
  return findOne(
    root,
    (node) => node.type === 'form' && node.props.className === className,
    `form ${className}`,
  );
}

function formGrid(root: TestInstance, index: number): TestInstance {
  const forms = root.findAll(
    (node) => node.type === 'form' && node.props.className === 'form-grid',
  );
  const match = forms[index];
  if (!match) throw new Error(`Missing form-grid ${index}`);
  return match;
}

function invoke(
  node: TestInstance,
  name: 'onClick' | 'onChange' | 'onSubmit',
  argument?: unknown,
): unknown {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name}`);
  return (handler as (value?: unknown) => unknown)(argument);
}

function submitEvent(values: Record<string, string> = {}) {
  return {
    preventDefault: vi.fn(),
    currentTarget: { values, reset: vi.fn() },
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function render(
  bridge: RendererBridgeAdapter,
  readOnly = false,
  currentProjectId = projectId,
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(SearchPanel, {
        bridge,
        projectId: currentProjectId,
        readOnly,
        onNavigate: vi.fn(),
      }),
    );
    await flush();
  });
  return renderer;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SearchPanel pending and stale request coverage', () => {
  it('covers pending labels, failed apply, cancelled plan and rebuild read failure', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);

    const searchPending = deferred<ReturnType<typeof success<SearchProjectResult>>>();
    const previewPending = deferred<ReturnType<typeof success<ReplacePlan>>>();
    const applyPending = deferred<ReturnType<typeof failure>>();
    const dictionaryPending =
      deferred<ReturnType<typeof success<{ projectId: string; entries: readonly [] }>>>();
    const rebuildPending = deferred<
      ReturnType<
        typeof success<{
          projectId: string;
          draftCount: number;
          versionCount: number;
          entityCount: number;
          researchCount: number;
          failedCount: number;
          status: 'ready';
        }>
      >
    >();

    const getIndexState = vi
      .fn()
      .mockResolvedValueOnce(success(indexState()))
      .mockResolvedValueOnce(failure());
    const previewReplace = vi
      .fn()
      .mockImplementationOnce(() => previewPending.promise)
      .mockResolvedValueOnce(success(replacePlan('cancelled')));
    const { bridge, methods } = createBridge({
      getIndexState,
      search: vi.fn(() => searchPending.promise),
      previewReplace,
      applyReplace: vi.fn(() => applyPending.promise),
      upsertDictionary: vi.fn(() => dictionaryPending.promise),
      rebuildIndex: vi.fn(() => rebuildPending.promise),
    });
    const renderer = await render(bridge);

    const query = findOne(
      renderer.root,
      (node) => node.type === 'input' && node.props['aria-label'] === '全文搜索词',
      'query input',
    );
    await act(async () => invoke(query, 'onChange', { target: { value: 'keyword' } }));
    await act(async () => {
      void invoke(form(renderer.root, 'filter-bar'), 'onSubmit', submitEvent());
      await flush();
    });
    expect(textContent(renderer.root)).toContain('正在搜索…');
    await act(async () => {
      searchPending.resolve(success(searchResult()));
      await flush();
    });

    const replaceForm = formGrid(renderer.root, 0);
    await act(async () => {
      void invoke(
        replaceForm,
        'onSubmit',
        submitEvent({ query: '旧词', replacement: '新词', matchCase: 'on' }),
      );
      await flush();
    });
    expect(textContent(renderer.root)).toContain('正在处理…');
    await act(async () => {
      previewPending.resolve(success(replacePlan()));
      await flush();
    });

    await act(async () => {
      void invoke(button(renderer.root, '创建恢复点并替换'), 'onClick');
      await flush();
    });
    expect(textContent(renderer.root)).toContain('正在替换…');
    await act(async () => {
      applyPending.resolve(failure());
      await flush();
    });
    expect(textContent(renderer.root)).toContain('操作未完成');

    await act(async () => {
      void invoke(replaceForm, 'onSubmit', submitEvent({ query: '旧词', replacement: '新词' }));
      await flush();
    });
    expect(textContent(renderer.root)).toContain('已取消');

    const dictionaryForm = formGrid(renderer.root, 1);
    await act(async () => {
      void invoke(
        dictionaryForm,
        'onSubmit',
        submitEvent({ term: 'Omega', action: 'canonical', replacementTerm: '', notes: '' }),
      );
      await flush();
    });
    expect(textContent(renderer.root)).toContain('正在保存…');
    await act(async () => {
      dictionaryPending.resolve(success({ projectId, entries: [] }));
      await flush();
    });

    await act(async () => {
      void invoke(button(renderer.root, '重建全文搜索'), 'onClick');
      await flush();
    });
    expect(textContent(renderer.root)).toContain('正在重建…');
    await act(async () => {
      rebuildPending.resolve(
        success({
          projectId,
          draftCount: 1,
          versionCount: 0,
          entityCount: 0,
          researchCount: 0,
          failedCount: 0,
          status: 'ready',
        }),
      );
      await flush();
    });
    expect(textContent(renderer.root)).toContain('全文搜索重建完成 · 全文搜索已就绪');
    expect(getIndexState).toHaveBeenCalledTimes(2);
    expect(methods.search).toHaveBeenCalledOnce();

    await act(async () => renderer.unmount());
  });

  it('keeps apply guarded after the panel becomes read-only', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const applyReplace = vi.fn().mockResolvedValue(failure());
    const { bridge } = createBridge({ applyReplace });
    const renderer = await render(bridge);

    await act(async () => {
      void invoke(
        formGrid(renderer.root, 0),
        'onSubmit',
        submitEvent({ query: '旧词', replacement: '新词', matchCase: 'on' }),
      );
      await flush();
    });

    await act(async () => {
      renderer.update(
        createElement(SearchPanel, {
          bridge,
          projectId,
          readOnly: true,
          onNavigate: vi.fn(),
        }),
      );
      await flush();
    });
    const applyButton = button(renderer.root, '创建恢复点并替换');
    expect(applyButton.props.disabled).toBe(true);
    await act(async () => {
      void invoke(applyButton, 'onClick');
      await flush();
    });
    expect(applyReplace).not.toHaveBeenCalled();

    await act(async () => renderer.unmount());
  });

  it('ignores an obsolete initial read rejection after project replacement', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const oldIndex = deferred<ReturnType<typeof success<SearchIndexState>>>();
    const oldDictionary =
      deferred<ReturnType<typeof success<{ projectId: string; entries: readonly [] }>>>();
    const oldBridge = createBridge({
      getIndexState: vi.fn(() => oldIndex.promise),
      listDictionary: vi.fn(() => oldDictionary.promise),
    }).bridge;
    const nextBridge = createBridge().bridge;
    const renderer = await render(oldBridge);
    const nextProjectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

    await act(async () => {
      renderer.update(
        createElement(SearchPanel, {
          bridge: nextBridge,
          projectId: nextProjectId,
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await flush();
    });
    expect(textContent(renderer.root)).toContain('搜索覆盖当前稿、历史版本与人物世界设定');

    await act(async () => {
      oldIndex.reject(new Error('obsolete read'));
      await flush();
    });
    expect(textContent(renderer.root)).not.toContain('搜索工具读取异常');

    await act(async () => renderer.unmount());
  });
});
