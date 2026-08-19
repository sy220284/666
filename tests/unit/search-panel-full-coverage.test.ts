import { createRequire } from 'node:module';

import type {
  ProjectDictionaryEntry,
  ReplacePlan,
  SearchIndexState,
  SearchProjectResult,
} from '@worldforge/contracts';
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
const versionId = '44444444-4444-4444-8444-444444444444';
const entityId = '55555555-5555-4555-8555-555555555555';
const researchId = '66666666-6666-4666-8666-666666666666';
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

function invoke(
  node: TestInstance,
  name: 'onClick' | 'onChange' | 'onSubmit',
  argument?: unknown,
): unknown {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name}`);
  return (handler as (value?: unknown) => unknown)(argument);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
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
    pendingCount: status === 'stale' ? 2 : 0,
    failedCount: status === 'stale' ? 1 : 0,
    lastIndexedAt: null,
    staleAt: null,
    lastErrorCode: null,
    updatedAt: now,
  });
}

function dictionaryEntry(
  term: string,
  action: ProjectDictionaryEntry['action'],
  replacementTerm: string | null,
): ProjectDictionaryEntry {
  return contractInput<ProjectDictionaryEntry>({
    term,
    normalizedTerm: term.toLowerCase(),
    category: 'terminology',
    action,
    replacementTerm,
    notes: '',
    createdAt: now,
    updatedAt: now,
  });
}

const dictionary = [
  dictionaryEntry('Alpha', 'canonical', null),
  dictionaryEntry('Beta', 'alias', 'Alpha'),
  dictionaryEntry('Gamma', 'ignore', null),
  dictionaryEntry('Delta', 'replace', 'Alpha'),
] as const;

function searchResult(
  strategy: SearchProjectResult['strategy'],
  indexStatus: SearchProjectResult['indexStatus'],
): SearchProjectResult {
  return contractInput<SearchProjectResult>({
    projectId,
    query: 'keyword',
    normalizedQuery: 'keyword',
    strategy,
    indexStatus,
    items: [
      {
        sourceType: 'draft',
        targetId: draftId,
        anchorId: blockId,
        chapterId,
        title: '当前稿命中',
        excerpt: '当前稿片段',
        score: 10,
      },
      {
        sourceType: 'version',
        targetId: versionId,
        anchorId: null,
        chapterId,
        title: '历史版本命中',
        excerpt: '历史版本片段',
        score: 9,
      },
      {
        sourceType: 'entity',
        targetId: entityId,
        anchorId: null,
        chapterId: null,
        title: '人物设定命中',
        excerpt: '人物设定片段',
        score: 8,
      },
      {
        sourceType: 'research',
        targetId: researchId,
        anchorId: null,
        chapterId: null,
        title: '研究资料命中',
        excerpt: '研究资料片段',
        score: 7,
      },
      {
        sourceType: 'draft',
        targetId: '99999999-9999-4999-8999-999999999999',
        anchorId: null,
        chapterId: null,
        title: '失效命中',
        excerpt: '失效片段',
        score: 6,
      },
    ],
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
    itemCount: 2,
    eligibleCount: 1,
    lockedCount: 1,
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
      {
        planItemId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId,
        chapterId,
        draftId,
        logicalBlockId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        baseRevision: 2,
        expectedBlockHash: 'b'.repeat(64),
        matchedText: '旧词',
        matchStart: 4,
        matchEnd: 6,
        replacement: '新词',
        locked: true,
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
    listDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: dictionary })),
    search: vi.fn().mockResolvedValue(success(searchResult('fts', 'ready'))),
    previewReplace: vi.fn().mockResolvedValue(success(replacePlan())),
    applyReplace: vi.fn().mockResolvedValue(
      success({
        plan: replacePlan('applied'),
        changedDrafts: [{ draftId, chapterId }],
      }),
    ),
    upsertDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: dictionary })),
    deleteDictionary: vi
      .fn()
      .mockResolvedValue(success({ projectId, entries: dictionary.slice(1) })),
    rebuildIndex: vi.fn().mockResolvedValue(
      success({
        projectId,
        draftCount: 1,
        versionCount: 1,
        entityCount: 1,
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

function submitEvent(values: Record<string, string> = {}) {
  return {
    preventDefault: vi.fn(),
    currentTarget: { values, reset: vi.fn() },
  };
}

async function render(
  bridge: RendererBridgeAdapter,
  readOnly = false,
  onNavigate = vi.fn(),
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(SearchPanel, { bridge, projectId, readOnly, onNavigate }));
    await flush();
  });
  return renderer;
}

function formGrid(root: TestInstance, index: number): TestInstance {
  const forms = root.findAll(
    (node) => node.type === 'form' && node.props.className === 'form-grid',
  );
  const match = forms[index];
  if (!match) throw new Error(`Missing form-grid ${index}`);
  return match;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SearchPanel coverage', () => {
  it('covers search filters, labels, navigation and author-facing failure', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const search = vi
      .fn()
      .mockResolvedValueOnce(success(searchResult('fts', 'ready')))
      .mockResolvedValueOnce(success(searchResult('dictionary', 'rebuilding')))
      .mockResolvedValueOnce(success(searchResult('authoritative-like', 'stale')))
      .mockResolvedValueOnce(failure());
    const { bridge } = createBridge({ search });
    const onNavigate = vi.fn();
    const renderer = await render(bridge, false, onNavigate);
    const searchForm = form(renderer.root, 'filter-bar');

    expect(textContent(renderer.root)).toContain('Alpha · 规范词');
    expect(textContent(renderer.root)).toContain('Beta · 别名 → Alpha');
    expect(textContent(renderer.root)).toContain('Gamma · 忽略');
    expect(textContent(renderer.root)).toContain('Delta · 替换建议 → Alpha');

    await act(async () => invoke(searchForm, 'onSubmit', submitEvent()));
    expect(search).not.toHaveBeenCalled();

    const queryInput = findOne(
      renderer.root,
      (node) => node.type === 'input' && node.props['aria-label'] === '全文搜索词',
      'search input',
    );
    await act(async () => invoke(queryInput, 'onChange', { target: { value: 'keyword' } }));

    const checkboxes = renderer.root.findAll(
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    expect(textContent(renderer.root)).toContain('研究资料');
    for (const checkbox of checkboxes.slice(0, 4)) {
      await act(async () => invoke(checkbox, 'onChange', { target: { checked: false } }));
    }
    await act(async () => invoke(searchForm, 'onSubmit', submitEvent()));
    expect(search).not.toHaveBeenCalled();
    await act(async () => invoke(checkboxes[0]!, 'onChange', { target: { checked: true } }));

    await act(async () => {
      invoke(searchForm, 'onSubmit', submitEvent());
      await flush();
    });
    expect(textContent(renderer.root)).toContain('找到 5 项 · 全文搜索 · 全文搜索已就绪');
    expect(textContent(renderer.root)).toContain('当前稿');
    expect(textContent(renderer.root)).toContain('历史版本 · 只读');
    expect(textContent(renderer.root)).toContain('人物世界设定 · 专用编辑入口');

    const resultButtons = renderer.root.findAll(
      (node) =>
        node.type === 'button' &&
        String(node.props['data-author-return-key'] ?? '').startsWith('search:'),
    );
    for (const resultButton of resultButtons) {
      await act(async () => invoke(resultButton, 'onClick'));
    }
    expect(onNavigate.mock.calls.map((call) => call[0]?.type)).toEqual([
      'draft-block',
      'version',
      'entity',
      'research-note',
    ]);
    expect(textContent(renderer.root)).toContain('目标章节已经变化');

    for (const expected of [
      '作品词典 · 正在重建全文搜索',
      '权威数据补充搜索 · 全文搜索需要更新',
      '操作未完成',
    ]) {
      await act(async () => {
        invoke(searchForm, 'onSubmit', submitEvent());
        await flush();
      });
      expect(textContent(renderer.root)).toContain(expected);
    }

    await act(async () => renderer.unmount());
  });

  it('covers replace, dictionary and index mutation outcomes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const previewReplace = vi
      .fn()
      .mockResolvedValueOnce(success(replacePlan()))
      .mockResolvedValueOnce(success(replacePlan('stale')))
      .mockResolvedValueOnce(failure());
    const applyReplace = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          plan: replacePlan('applied'),
          changedDrafts: [{ draftId, chapterId }],
        }),
      )
      .mockResolvedValueOnce(failure());
    const upsertDictionary = vi
      .fn()
      .mockResolvedValueOnce(success({ projectId, entries: dictionary }))
      .mockResolvedValueOnce(failure());
    const deleteDictionary = vi
      .fn()
      .mockResolvedValueOnce(success({ projectId, entries: dictionary.slice(1) }))
      .mockResolvedValueOnce(failure());
    const rebuildIndex = vi
      .fn()
      .mockResolvedValueOnce(failure())
      .mockResolvedValueOnce({ state: 'cancelled' })
      .mockResolvedValueOnce(
        success({
          projectId,
          draftCount: 1,
          versionCount: 1,
          entityCount: 1,
          researchCount: 0,
          failedCount: 0,
          status: 'rebuilding',
        }),
      )
      .mockResolvedValueOnce(
        success({
          projectId,
          draftCount: 1,
          versionCount: 1,
          entityCount: 1,
          researchCount: 0,
          failedCount: 0,
          status: 'stale',
        }),
      );
    const { bridge } = createBridge({
      previewReplace,
      applyReplace,
      upsertDictionary,
      deleteDictionary,
      rebuildIndex,
    });
    const renderer = await render(bridge);
    const previewForm = formGrid(renderer.root, 0);
    const dictionaryForm = formGrid(renderer.root, 1);

    await act(async () => {
      invoke(
        previewForm,
        'onSubmit',
        submitEvent({ query: '旧词', replacement: '新词', matchCase: 'on' }),
      );
      await flush();
    });
    expect(previewReplace).toHaveBeenCalledWith(expect.objectContaining({ matchCase: true }));
    expect(textContent(renderer.root)).toContain('等待确认 · 命中 2');
    expect(textContent(renderer.root)).toContain('已锁定，跳过 · 旧词 → 新词');

    await act(async () => {
      invoke(button(renderer.root, '创建恢复点并替换'), 'onClick');
      await flush();
    });
    expect(textContent(renderer.root)).toContain('替换完成 · 1 个当前稿');
    expect(textContent(renderer.root)).toContain('已经替换');

    await act(async () => {
      invoke(
        previewForm,
        'onSubmit',
        submitEvent({ query: '旧词', replacement: '', matchCase: '' }),
      );
      await flush();
    });
    expect(previewReplace).toHaveBeenLastCalledWith(expect.objectContaining({ matchCase: false }));
    expect(textContent(renderer.root)).toContain('预览已经过期');

    await act(async () => {
      invoke(previewForm, 'onSubmit', submitEvent({ query: '旧词' }));
      await flush();
    });
    expect(textContent(renderer.root)).toContain('操作未完成');

    const reset = vi.fn();
    await act(async () => {
      invoke(dictionaryForm, 'onSubmit', {
        preventDefault: vi.fn(),
        currentTarget: {
          values: {
            term: 'Omega',
            action: 'alias',
            replacementTerm: ' Alpha ',
            notes: '备注',
          },
          reset,
        },
      });
      await flush();
    });
    expect(upsertDictionary).toHaveBeenCalledWith(
      expect.objectContaining({ replacementTerm: 'Alpha' }),
    );
    expect(reset).toHaveBeenCalledOnce();
    expect(textContent(renderer.root)).toContain('作品词典已保存');

    await act(async () => {
      invoke(dictionaryForm, 'onSubmit', submitEvent({ term: 'Omega', action: 'canonical' }));
      await flush();
    });
    expect(upsertDictionary).toHaveBeenLastCalledWith(
      expect.objectContaining({ replacementTerm: null }),
    );
    expect(textContent(renderer.root)).toContain('操作未完成');

    await act(async () => {
      invoke(button(renderer.root, '删除'), 'onClick');
      await flush();
    });
    expect(textContent(renderer.root)).toContain('作品词典词条已删除');
    await act(async () => {
      invoke(button(renderer.root, '删除'), 'onClick');
      await flush();
    });
    expect(textContent(renderer.root)).toContain('操作未完成');

    for (const expected of [
      '操作未完成',
      '操作未完成',
      '全文搜索重建完成 · 正在重建全文搜索',
      '全文搜索重建完成 · 全文搜索需要更新',
    ]) {
      await act(async () => {
        invoke(button(renderer.root, '重建全文搜索'), 'onClick');
        await flush();
      });
      expect(textContent(renderer.root)).toContain(expected);
    }

    await act(async () => renderer.unmount());
  });

  it('covers read-only guards, read failures, rejection and stale responses', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const previewReplace = vi.fn();
    const upsertDictionary = vi.fn();
    const { bridge } = createBridge({
      getIndexState: vi.fn().mockResolvedValue(failure()),
      listDictionary: vi.fn().mockResolvedValue(failure()),
      previewReplace,
      upsertDictionary,
    });
    const renderer = await render(bridge, true);
    expect(textContent(renderer.root)).toContain('全文搜索状态读取失败');
    expect(textContent(renderer.root)).toContain('作品词典读取失败');

    await act(async () =>
      invoke(formGrid(renderer.root, 0), 'onSubmit', submitEvent({ query: 'x' })),
    );
    await act(async () =>
      invoke(formGrid(renderer.root, 1), 'onSubmit', submitEvent({ term: 'x' })),
    );
    expect(previewReplace).not.toHaveBeenCalled();
    expect(upsertDictionary).not.toHaveBeenCalled();
    expect(button(renderer.root, '重建全文搜索').props.disabled).toBe(true);
    await act(async () => renderer.unmount());

    const rejecting = createBridge({
      getIndexState: vi.fn().mockRejectedValue(new Error('boom')),
      listDictionary: vi.fn().mockResolvedValue(success({ projectId, entries: [] })),
    });
    const rejectedRenderer = await render(rejecting.bridge);
    expect(textContent(rejectedRenderer.root)).toContain('搜索工具读取异常');
    await act(async () => rejectedRenderer.unmount());

    const pendingSearch = deferred<ReturnType<typeof success<SearchProjectResult>>>();
    const first = createBridge({ search: vi.fn(() => pendingSearch.promise) });
    const second = createBridge();
    const staleRenderer = await render(first.bridge);
    const input = findOne(
      staleRenderer.root,
      (node) => node.type === 'input' && node.props['aria-label'] === '全文搜索词',
      'search input',
    );
    await act(async () => invoke(input, 'onChange', { target: { value: 'keyword' } }));
    await act(async () =>
      invoke(form(staleRenderer.root, 'filter-bar'), 'onSubmit', submitEvent()),
    );
    await act(async () => {
      staleRenderer.update(
        createElement(SearchPanel, {
          bridge: second.bridge,
          projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await flush();
    });
    await act(async () => {
      pendingSearch.resolve(success(searchResult('fts', 'ready')));
      await flush();
    });
    expect(textContent(staleRenderer.root)).not.toContain('找到 5 项');
    await act(async () => staleRenderer.unmount());
  });
});
