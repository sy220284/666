import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ProjectDictionaryEntry,
  ReplacePlan,
  SearchIndexState,
  SearchProjectResult,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

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

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findOne(root: TestInstance, predicate: (node: TestInstance) => boolean, label: string) {
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

function inputByLabel(root: TestInstance, label: string): TestInstance {
  return findOne(root, (node) => node.type === 'input' && node.props['aria-label'] === label, label);
}

function formByClass(root: TestInstance, className: string): TestInstance {
  return findOne(root, (node) => node.type === 'form' && node.props.className === className, className);
}

function detailsForm(root: TestInstance, placeholder: string): TestInstance {
  return findOne(
    root,
    (node) =>
      node.type === 'form' &&
      node.findAll(
        (child) => child.type === 'input' && child.props.placeholder === placeholder,
      ).length > 0,
    `form with ${placeholder}`,
  );
}

function invoke(node: TestInstance, name: 'onClick' | 'onChange' | 'onSubmit', argument?: unknown) {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name}`);
  return (handler as (value?: unknown) => unknown)(argument);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
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

function failure(message = '操作失败') {
  return {
    state: 'failure' as const,
    error: { code: 'MODEL_UNAVAILABLE' as const, message, retryable: true },
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
        title: '失效章节命中',
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
    listDictionary: vi
      .fn()
      .mockResolvedValue(success({ projectId, entries: dictionary })),
    search: vi.fn().mockResolvedValue(success(searchResult('fts', 'ready'))),
    previewReplace: vi.fn().mockResolvedValue(success(replacePlan('preview'))),
    applyReplace: vi.fn().mockResolvedValue(
      success({
        plan: replacePlan('applied'),
        changedDrafts: [{ draftId, chapterId, previousRevision: 1, committedRevision: 2, replacementCount: 1 }],
      }),
    ),
    upsertDictionary: vi
      .fn()
      .mockResolvedValue(success({ projectId, entries: dictionary })),
    rebuildIndex: vi.fn().mockResolvedValue(
      success({ projectId, draftCount: 1, versionCount: 1, entityCount: 1, researchCount: 1, failedCount: 0, status: 'ready' }),
    ),
    deleteDictionary: vi
      .fn()
      .mockResolvedValue(success({ projectId, entries: dictionary.slice(1) })),
    ...overrides,
  };
  return {
    bridge: contractInput<RendererBridgeAdapter>({ searchTools: methods }),
    methods,
  };
}

class FakeFormData {
  readonly values: Record<string, string>;
  constructor(target?: { readonly values?: Record<string, string> }) {
    this.values = target?.values ?? {};
  }
  get(name: string): string | null {
    return this.values[name] ?? null;
  }
}

async function render(
  bridge: RendererBridgeAdapter,
  readOnly = false,
  onNavigate = vi.fn(),
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(SearchPanel, { bridge, projectId, readOnly, onNavigate }));
    await flushPromises();
  });
  return renderer;
}

function submitEvent(values: Record<string, string> = {}) {
  return {
    preventDefault: vi.fn(),
    currentTarget: { values, reset: vi.fn() },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SearchPanel full behavioral coverage', () => {
  it('covers initial loading, filters, all search labels and navigation outcomes', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);
    const search = vi
      .fn()
      .mockResolvedValueOnce(success(searchResult('fts', 'ready')))
      .mockResolvedValueOnce(success(searchResult('dictionary', 'rebuilding')))
      .mockResolvedValueOnce(success(searchResult('authoritative-like', 'stale')))
      .mockResolvedValueOnce(failure('搜索失败'));
    const { bridge } = createBridge({ search });
    const onNavigate = vi.fn();
    const renderer = await render(bridge, false, onNavigate);

    expect(textContent(renderer.root)).toContain('全文搜索与安全替换');
    expect(textContent(renderer.root)).toContain('等待更新 0');
    expect(textContent(renderer.root)).toContain('Alpha · 规范词');
    expect(textContent(renderer.root)).toContain('Beta · 别名 → Alpha');
    expect(textContent(renderer.root)).toContain('Gamma · 忽略');
    expect(textContent(renderer.root)).toContain('Delta · 替换建议 → Alpha');

    const searchForm = formByClass(renderer.root, 'filter-bar');
    const emptyEvent = submitEvent();
    await act(async () => invoke(searchForm, 'onSubmit', emptyEvent));
    expect(emptyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(search).not.toHaveBeenCalled();

    const queryInput = inputByLabel(renderer.root, '全文搜索词');
    await act(async () => invoke(queryInput, 'onChange', { target: { value: 'keyword' } }));

    const sourceCheckboxes = renderer.root.findAll(
      (node) => node.type === 'input' && node.props.type === 'checkbox',
    );
    expect(sourceCheckboxes).toHaveLength(4);
    for (const checkbox of sourceCheckboxes.slice(0, 3)) {
      await act(async () => invoke(checkbox, 'onChange', { target: { checked: false } }));
    }
    await act(async () => invoke(searchForm, 'onSubmit', submitEvent()));
    expect(search).not.toHaveBeenCalled();

    await act(async () => invoke(sourceCheckboxes[0]!, 'onChange', { target: { checked: true } }));
    await act(async () => {
      invoke(searchForm, 'onSubmit', submitEvent());
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('找到 5 项 · 全文搜索 · 全文搜索已就绪');
    expect(textContent(renderer.root)).toContain('当前稿');
    expect(textContent(renderer.root)).toContain('历史版本 · 只读');
    expect(textContent(renderer.root)).toContain('人物世界设定 · 专用编辑入口');

    const resultButtons = renderer.root.findAll(
      (node) => node.type === 'button' && String(node.props['data-author-return-key'] ?? '').startsWith('search:'),
    );
    expect(resultButtons).toHaveLength(5);
    for (const resultButton of resultButtons.slice(0, 4)) {
      await act(async () => invoke(resultButton, 'onClick'));
    }
    expect(onNavigate.mock.calls.map((call) => call[0]?.type)).toEqual([
      'draft-block',
      'version',
      'entity',
      'research-note',
    ]);
    await act(async () => invoke(resultButtons[4]!, 'onClick'));
    expect(textContent(renderer.root)).toContain('目标章节已经变化');

    await act(async () => {
      invoke(formByClass(renderer.root, 'filter-bar'), 'onSubmit', submitEvent());
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('作品词典 · 正在重建全文搜索');

    await act(async () => {
      invoke(formByClass(renderer.root, 'filter-bar'), 'onSubmit', submitEvent());
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('权威数据补充搜索 · 全文搜索需要更新');

    await act(async () => {
      invoke(formByClass(renderer.root, 'filter-bar'), 'onSubmit', submitEvent());
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('搜索失败');

    await act(async () => renderer.unmount());
  });

  it('covers replace preview/apply, dictionary mutations, rebuild and reload success/failure paths', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);

    const previewReplace = vi
      .fn()
      .mockResolvedValueOnce(success(replacePlan('preview')))
      .mockResolvedValueOnce(success(replacePlan('stale')))
      .mockResolvedValueOnce(failure('预览失败'));
    const applyReplace = vi
      .fn()
      .mockResolvedValueOnce(
        success({
          plan: replacePlan('applied'),
          changedDrafts: [{ draftId, chapterId }],
        }),
      )
      .mockResolvedValueOnce(failure('替换失败'));
    const upsertDictionary = vi
      .fn()
      .mockResolvedValueOnce(success({ projectId, entries: dictionary }))
      .mockResolvedValueOnce(failure('词典保存失败'));
    const deleteDictionary = vi
      .fn()
      .mockResolvedValueOnce(success({ projectId, entries: dictionary.slice(1) }))
      .mockResolvedValueOnce(failure('词典删除失败'));
    const rebuildIndex = vi
      .fn()
      .mockResolvedValueOnce(failure('重建失败'))
      .mockResolvedValueOnce({ state: 'cancelled' })
      .mockResolvedValueOnce(
        success({ projectId, draftCount: 1, versionCount: 1, entityCount: 1, researchCount: 0, failedCount: 0, status: 'rebuilding' }),
      )
      .mockResolvedValueOnce(
        success({ projectId, draftCount: 1, versionCount: 1, entityCount: 1, researchCount: 0, failedCount: 0, status: 'stale' }),
      );
    const getIndexState = vi
      .fn()
      .mockResolvedValueOnce(success(indexState('ready')))
      .mockResolvedValueOnce(success(indexState('rebuilding')))
      .mockResolvedValueOnce({ state: 'failure', error: { code: 'MODEL_UNAVAILABLE', message: '状态失败', retryable: true } })
      .mockResolvedValue(success(indexState('stale')));

    const { bridge } = createBridge({
      previewReplace,
      applyReplace,
      upsertDictionary,
      deleteDictionary,
      rebuildIndex,
      getIndexState,
    });
    const renderer = await render(bridge);

    const replaceForm = detailsForm(renderer.root, '专名或别名').findAll(
      (node) => node.type === 'form' && node.props.className === 'form-grid',
    )[0];
    expect(replaceForm).toBeDefined();

    const allForms = renderer.root.findAll(
      (node) => node.type === 'form' && node.props.className === 'form-grid',
    );
    const previewForm = allForms[0]!;
    const dictionaryForm = allForms[1]!;

    await act(async () => {
      invoke(previewForm, 'onSubmit', submitEvent({ query: '旧词', replacement: '新词', matchCase: 'on' }));
      await flushPromises();
    });
    expect(previewReplace).toHaveBeenCalledWith(
      expect.objectContaining({ query: '旧词', replacement: '新词', matchCase: true }),
    );
    expect(textContent(renderer.root)).toContain('等待确认 · 命中 2');
    expect(textContent(renderer.root)).toContain('可以替换 · 旧词 → 新词');
    expect(textContent(renderer.root)).toContain('已锁定，跳过 · 旧词 → 新词');

    await act(async () => {
      invoke(button(renderer.root, '创建恢复点并替换'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('替换完成 · 1 个当前稿');
    expect(textContent(renderer.root)).toContain('已经替换');

    await act(async () => {
      invoke(previewForm, 'onSubmit', submitEvent({ query: '旧词', replacement: '', matchCase: '' }));
      await flushPromises();
    });
    expect(previewReplace).toHaveBeenLastCalledWith(expect.objectContaining({ matchCase: false }));
    expect(textContent(renderer.root)).toContain('预览已经过期');

    await act(async () => {
      invoke(previewForm, 'onSubmit', submitEvent({ query: '旧词', replacement: '新词' }));
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('预览失败');

    const reset = vi.fn();
    await act(async () => {
      invoke(dictionaryForm, 'onSubmit', {
        preventDefault: vi.fn(),
        currentTarget: {
          values: { term: 'Omega', action: 'alias', replacementTerm: ' Alpha ', notes: '备注' },
          reset,
        },
      });
      await flushPromises();
    });
    expect(upsertDictionary).toHaveBeenCalledWith(
      expect.objectContaining({ term: 'Omega', action: 'alias', replacementTerm: 'Alpha', notes: '备注' }),
    );
    expect(reset).toHaveBeenCalledOnce();
    expect(textContent(renderer.root)).toContain('作品词典已保存');

    await act(async () => {
      invoke(dictionaryForm, 'onSubmit', submitEvent({ term: 'Omega', action: 'canonical', replacementTerm: '' }));
      await flushPromises();
    });
    expect(upsertDictionary).toHaveBeenLastCalledWith(expect.objectContaining({ replacementTerm: null }));
    expect(textContent(renderer.root)).toContain('词典保存失败');

    await act(async () => {
      invoke(button(renderer.root, '删除'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('作品词典词条已删除');

    await act(async () => {
      const currentDelete = button(renderer.root, '删除');
      invoke(currentDelete, 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('词典删除失败');

    await act(async () => {
      invoke(button(renderer.root, '重建全文搜索'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('重建失败');

    await act(async () => {
      invoke(button(renderer.root, '重建全文搜索'), 'onClick');
      await flushPromises();
    });
    expect(rebuildIndex).toHaveBeenCalledTimes(2);

    await act(async () => {
      invoke(button(renderer.root, '重建全文搜索'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('全文搜索重建完成 · 正在重建全文搜索');

    await act(async () => {
      invoke(button(renderer.root, '重建全文搜索'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('全文搜索重建完成 · 全文搜索需要更新');

    await act(async () => {
      invoke(button(renderer.root, '重新读取搜索状态'), 'onClick');
      await flushPromises();
    });
    expect(getIndexState.mock.calls.length).toBeGreaterThan(1);

    await act(async () => renderer.unmount());
  });

  it('covers read-only guards and initial effect failures, rejection and late cleanup', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);

    const getIndexState = vi.fn().mockResolvedValue(failure('状态读取失败'));
    const listDictionary = vi.fn().mockResolvedValue(failure('词典读取失败'));
    const previewReplace = vi.fn();
    const upsertDictionary = vi.fn();
    const applyReplace = vi.fn();
    const { bridge } = createBridge({
      getIndexState,
      listDictionary,
      previewReplace,
      upsertDictionary,
      applyReplace,
    });
    const renderer = await render(bridge, true);
    expect(textContent(renderer.root)).toContain('全文搜索状态读取失败');
    expect(textContent(renderer.root)).toContain('作品词典读取失败');

    const forms = renderer.root.findAll(
      (node) => node.type === 'form' && node.props.className === 'form-grid',
    );
    await act(async () => invoke(forms[0]!, 'onSubmit', submitEvent({ query: 'x' })));
    await act(async () => invoke(forms[1]!, 'onSubmit', submitEvent({ term: 'x' })));
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

    const pendingIndex = deferred<ReturnType<typeof success<SearchIndexState>>>();
    const pendingDictionary = deferred<ReturnType<typeof success<{ projectId: string; entries: readonly ProjectDictionaryEntry[] }>>>();
    const pendingBridge = createBridge({
      getIndexState: vi.fn(() => pendingIndex.promise),
      listDictionary: vi.fn(() => pendingDictionary.promise),
    });
    let pendingRenderer!: TestRenderer;
    await act(async () => {
      pendingRenderer = create(
        createElement(SearchPanel, {
          bridge: pendingBridge.bridge,
          projectId,
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await Promise.resolve();
    });
    await act(async () => pendingRenderer.unmount());
    await act(async () => {
      pendingIndex.resolve(success(indexState()));
      pendingDictionary.resolve(success({ projectId, entries: dictionary }));
      await flushPromises();
    });
  });

  it('ignores stale search, replace, dictionary and index responses after a project/bridge generation change', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('FormData', FakeFormData);

    const pendingSearch = deferred<ReturnType<typeof success<SearchProjectResult>>>();
    const pendingPreview = deferred<ReturnType<typeof success<ReplacePlan>>>();
    const pendingUpsert = deferred<ReturnType<typeof success<{ projectId: string; entries: readonly ProjectDictionaryEntry[] }>>>();
    const pendingDelete = deferred<ReturnType<typeof success<{ projectId: string; entries: readonly ProjectDictionaryEntry[] }>>>();
    const pendingRebuild = deferred<ReturnType<typeof success<{ status: 'ready' }>>>();
    const first = createBridge({
      search: vi.fn(() => pendingSearch.promise),
      previewReplace: vi.fn(() => pendingPreview.promise),
      upsertDictionary: vi.fn(() => pendingUpsert.promise),
      deleteDictionary: vi.fn(() => pendingDelete.promise),
      rebuildIndex: vi.fn(() => pendingRebuild.promise),
    });
    const second = createBridge();
    const renderer = await render(first.bridge);

    await act(async () => invoke(inputByLabel(renderer.root, '全文搜索词'), 'onChange', { target: { value: 'keyword' } }));
    await act(async () => invoke(formByClass(renderer.root, 'filter-bar'), 'onSubmit', submitEvent()));
    const forms = renderer.root.findAll(
      (node) => node.type === 'form' && node.props.className === 'form-grid',
    );
    await act(async () => invoke(forms[0]!, 'onSubmit', submitEvent({ query: '旧词', replacement: '新词' })));
    await act(async () => invoke(forms[1]!, 'onSubmit', submitEvent({ term: 'X', action: 'canonical' })));
    await act(async () => invoke(button(renderer.root, '删除'), 'onClick'));
    await act(async () => invoke(button(renderer.root, '重建全文搜索'), 'onClick'));

    await act(async () => {
      renderer.update(
        createElement(SearchPanel, {
          bridge: second.bridge,
          projectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await flushPromises();
    });

    await act(async () => {
      pendingSearch.resolve(success(searchResult('fts', 'ready')));
      pendingPreview.resolve(success(replacePlan()));
      pendingUpsert.resolve(success({ projectId, entries: dictionary }));
      pendingDelete.resolve(success({ projectId, entries: [] }));
      pendingRebuild.resolve(success({ status: 'ready' }));
      await flushPromises();
    });

    expect(textContent(renderer.root)).not.toContain('找到 5 项');
    await act(async () => renderer.unmount());
  });
});
