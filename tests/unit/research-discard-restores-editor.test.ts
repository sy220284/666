import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { ResearchWorkbench } from '../../apps/desktop/renderer/src/features/research/research-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

vi.mock('../../apps/desktop/renderer/src/runtime/author-dialog.js', () => ({
  authorConfirm: async ({ message }: { message: string }) => window.confirm(message),
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
const noteId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-08-19T08:00:00.000Z';

const catalog: ResearchCatalog = {
  projectId,
  notes: [
    {
      id: noteId,
      projectId,
      title: '原始资料标题',
      body: '原始正文',
      sourceType: 'book',
      sourceLabel: '地方志',
      sourceUri: null,
      tags: ['城防'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ],
  attachments: [],
  links: [],
};

const emptyCatalog: ResearchCatalog = {
  projectId,
  notes: [],
  attachments: [],
  links: [],
};

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '33333333-3333-4333-8333-333333333333',
    data,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function controlByLabel(root: TestInstance, label: string): TestInstance {
  const field = root.findAll(
    (node) => node.type === 'label' && textContent(node).startsWith(label),
  )[0];
  const control = field?.findAll((node) =>
    ['input', 'textarea', 'select'].includes(String(node.type)),
  )[0];
  if (!control) throw new Error(`MISSING_CONTROL:${label}`);
  return control;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('research draft preservation across filtering', () => {
  it('keeps the current unsaved note across every author filter and saves the preserved draft', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const confirm = vi.fn(() => true);
    vi.stubGlobal('window', { confirm });
    const updateNote = vi.fn(async () => success(catalog));
    const list = vi.fn(async (input: { readonly query?: string }) =>
      success(input.query ? emptyCatalog : catalog),
    );
    const bridge = contractInput<RendererBridgeAdapter>({
      research: {
        list,
        updateNote,
      },
    });

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(ResearchWorkbench, {
          bridge,
          projectId,
          readOnly: false,
          selectedNoteId: noteId,
          navigationQuery: null,
          onNavigate: () => undefined,
          onSelectNote: () => undefined,
          onClose: () => undefined,
        }),
      );
      await flushPromises();
    });

    await act(async () => {
      (controlByLabel(renderer.root, '标题').props.onChange as (event: unknown) => void)({
        target: { value: '准备放弃的标题' },
      });
    });
    expect(controlByLabel(renderer.root, '标题').props.value).toBe('准备放弃的标题');

    const search = renderer.root.findAll(
      (node) => node.props.placeholder === '标题、正文、标签或来源',
    )[0];
    if (!search) throw new Error('MISSING_RESEARCH_SEARCH');
    await act(async () => {
      (search.props.onChange as (event: unknown) => void)({ target: { value: '城门' } });
      await flushPromises();
    });

    for (const [label, target] of [
      ['按标签筛选', { value: '城防' }],
      ['按来源筛选', { value: 'book' }],
      ['显示已归档', { checked: true }],
      ['故事对象筛选', { value: 'chapter' }],
    ] as const) {
      await act(async () => {
        (controlByLabel(renderer.root, label).props.onChange as (event: unknown) => void)({
          target,
        });
        await flushPromises();
      });
      expect(confirm).not.toHaveBeenCalled();
      expect(controlByLabel(renderer.root, '标题').props.value).toBe('准备放弃的标题');
    }

    expect(confirm).not.toHaveBeenCalled();
    expect(controlByLabel(renderer.root, '标题').props.value).toBe('准备放弃的标题');
    expect(textContent(renderer.root)).toContain('有未保存修改');
    expect(textContent(renderer.root)).toContain('当前编辑的笔记不在本次筛选结果中');
    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        query: '城门',
        tags: ['城防'],
        noteSourceType: 'book',
        includeArchived: true,
        targetType: 'chapter',
      }),
      expect.anything(),
    );

    const save = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '保存笔记',
    )[0];
    if (!save) throw new Error('MISSING_RESEARCH_SAVE');
    await act(async () => {
      (save.props.onClick as () => void)();
      await flushPromises();
    });
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ title: '准备放弃的标题', body: '原始正文' }),
      expect.anything(),
    );

    await act(async () => renderer.unmount());
  });
});
