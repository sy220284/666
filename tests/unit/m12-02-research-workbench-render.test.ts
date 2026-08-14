import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { consumeResearchReferenceSelection } from '../../apps/desktop/renderer/src/bridge/research-reference-selection.js';
import { ResearchWorkbench } from '../../apps/desktop/renderer/src/features/research/research-workbench.js';
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
  unmount(): void;
}
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => TestRenderer;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const noteId = '22222222-2222-4222-8222-222222222222';
const createdNoteId = '23232323-2323-4323-8323-232323232323';
const attachmentId = '33333333-3333-4333-8333-333333333333';
const largeAttachmentId = '34343434-3434-4343-8343-343434343434';
const linkId = '44444444-4444-4444-8444-444444444444';
const targetId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-08-14T08:00:00.000Z';

const catalog: ResearchCatalog = {
  projectId,
  notes: [
    {
      id: noteId,
      projectId,
      title: '北地城防资料',
      body: '记录城门、河道与守军换防。',
      sourceType: 'book',
      sourceLabel: '地方志',
      sourceUri: 'file://local-source',
      tags: ['城防', '地理'],
      status: 'active',
      createdAt: timestamp,
      updatedAt: timestamp,
      archivedAt: null,
    },
  ],
  attachments: [
    {
      id: attachmentId,
      projectId,
      noteId,
      displayName: '城防摘要.md',
      mediaType: 'text/markdown',
      sizeBytes: 2048,
      contentHash: 'a'.repeat(64),
      managedRelativePath: `artifacts/research/${attachmentId}.md`,
      createdAt: timestamp,
    },
  ],
  links: [
    {
      id: linkId,
      projectId,
      sourceType: 'note',
      sourceId: noteId,
      targetType: 'chapter',
      targetId,
      createdAt: timestamp,
    },
  ],
};

const archivedCatalog: ResearchCatalog = {
  projectId,
  notes: [
    {
      ...catalog.notes[0]!,
      status: 'archived',
      archivedAt: timestamp,
      sourceType: null,
      sourceLabel: null,
      sourceUri: null,
      tags: [],
    },
  ],
  attachments: [
    {
      ...catalog.attachments[0]!,
      sizeBytes: 2 * 1024 * 1024,
    },
    {
      id: largeAttachmentId,
      projectId,
      noteId,
      displayName: '地图.pdf',
      mediaType: 'application/pdf',
      sizeBytes: 3 * 1024 * 1024,
      contentHash: 'b'.repeat(64),
      managedRelativePath: `artifacts/research/${largeAttachmentId}.pdf`,
      createdAt: timestamp,
    },
  ],
  links: catalog.links,
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
    requestId: '66666666-6666-4666-8666-666666666666',
    data,
  };
}

function failure(code = 'COMMON_INTERNAL_999') {
  return {
    state: 'failure' as const,
    generation: 1,
    requestId: '66666666-6666-4666-8666-666666666666',
    error: {
      code,
      message: '测试失败',
      retryable: code !== 'COMMON_CANCELLED_004',
    },
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonByText(root: TestInstance, text: string): TestInstance {
  const match = root.findAll((node) => node.type === 'button' && textContent(node) === text)[0];
  if (!match) throw new Error(`Missing button: ${text}`);
  return match;
}

function buttonContaining(root: TestInstance, text: string): TestInstance {
  const match = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
  if (!match) throw new Error(`Missing button containing: ${text}`);
  return match;
}

function inputByPlaceholder(root: TestInstance, placeholder: string): TestInstance {
  const match = root.findAll((node) => node.props.placeholder === placeholder)[0];
  if (!match) throw new Error(`Missing input: ${placeholder}`);
  return match;
}

function controlByLabel(root: TestInstance, label: string): TestInstance {
  const field = root.findAll(
    (node) => node.type === 'label' && textContent(node).startsWith(label),
  )[0];
  if (!field) throw new Error(`Missing field: ${label}`);
  const control = field.findAll((node) =>
    ['input', 'textarea', 'select'].includes(String(node.type)),
  )[0];
  if (!control) throw new Error(`Missing control: ${label}`);
  return control;
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function invoke(node: TestInstance, name: 'onClick' | 'onChange', argument?: unknown): void {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name} handler.`);
  (handler as (value?: unknown) => void)(argument);
}

async function renderWorkbench(
  bridge: RendererBridgeAdapter,
  overrides: Partial<{
    readOnly: boolean;
    selectedNoteId: string | null;
    navigationQuery: string | null;
    onNavigate: (target: unknown) => void;
    onSelectNote: (noteId: string | null) => void;
    onClose: () => void;
  }> = {},
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(ResearchWorkbench, {
        bridge,
        projectId,
        readOnly: overrides.readOnly ?? false,
        selectedNoteId: overrides.selectedNoteId === undefined ? noteId : overrides.selectedNoteId,
        navigationQuery: overrides.navigationQuery ?? null,
        onNavigate: overrides.onNavigate ?? (() => undefined),
        onSelectNote: overrides.onSelectNote ?? (() => undefined),
        onClose: overrides.onClose ?? (() => undefined),
      }),
    );
    await flushPromises();
  });
  return renderer;
}

afterEach(() => {
  consumeResearchReferenceSelection(projectId, [
    { sourceType: 'note', sourceId: noteId },
    { sourceType: 'attachment', sourceId: attachmentId },
    { sourceType: 'attachment', sourceId: largeAttachmentId },
  ]);
  vi.unstubAllGlobals();
});

describe('M12-02 research workbench render and interaction coverage', () => {
  it('loads the catalog and exercises author-controlled note, attachment, link and AI-reference actions', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const createdCatalog: ResearchCatalog = {
      ...catalog,
      notes: [
        ...catalog.notes,
        {
          ...catalog.notes[0]!,
          id: createdNoteId,
          title: '新建资料',
          createdAt: '2026-08-14T09:00:00.000Z',
          updatedAt: '2026-08-14T09:00:00.000Z',
        },
      ],
    };
    const research = {
      list: vi.fn(async () => success(catalog)),
      createNote: vi.fn(async () => success(createdCatalog)),
      updateNote: vi.fn(async () => success(catalog)),
      setNoteStatus: vi.fn(async () => success(archivedCatalog)),
      deleteNote: vi.fn(async () => success(emptyCatalog)),
      importAttachment: vi.fn(async () => success(catalog)),
      previewAttachment: vi.fn(async () =>
        success({
          projectId,
          attachmentId,
          displayName: '城防摘要.md',
          mediaType: 'text/markdown' as const,
          contentHash: 'a'.repeat(64),
          text: '# 城防摘要\n北门换防。',
          truncated: false,
        }),
      ),
      deleteAttachment: vi.fn(async () => success(catalog)),
      addLink: vi.fn(async () => success(catalog)),
      removeLink: vi.fn(async () => success(catalog)),
    };
    const bridge = contractInput<RendererBridgeAdapter>({ research });
    const onNavigate = vi.fn();
    const onSelectNote = vi.fn();
    const onClose = vi.fn();
    const renderer = await renderWorkbench(bridge, {
      navigationQuery: '城防',
      onNavigate,
      onSelectNote,
      onClose,
    });

    expect(textContent(renderer.root)).toContain('北地城防资料');
    expect(textContent(renderer.root)).toContain('城防摘要.md');
    expect(textContent(renderer.root)).toContain('章节');
    expect(research.list).toHaveBeenCalled();

    await act(async () => {
      invoke(inputByPlaceholder(renderer.root, '标题、正文、标签或来源'), 'onChange', {
        target: { value: ' 河道 ' },
      });
      invoke(controlByLabel(renderer.root, '显示已归档'), 'onChange', {
        target: { checked: true },
      });
      invoke(buttonContaining(renderer.root, '北地城防资料'), 'onClick');
      invoke(controlByLabel(renderer.root, '标题'), 'onChange', { target: { value: ' 北门 ' } });
      invoke(controlByLabel(renderer.root, '标签'), 'onChange', {
        target: { value: '历史，历史 地理' },
      });
      invoke(controlByLabel(renderer.root, '来源类型'), 'onChange', { target: { value: '' } });
      invoke(controlByLabel(renderer.root, '来源名称'), 'onChange', { target: { value: '' } });
      invoke(controlByLabel(renderer.root, '来源地址'), 'onChange', { target: { value: '' } });
      invoke(controlByLabel(renderer.root, '笔记正文'), 'onChange', {
        target: { value: '更新后的正文' },
      });
      await flushPromises();
    });

    await act(async () => {
      invoke(buttonByText(renderer.root, '保存笔记'), 'onClick');
      await flushPromises();
    });
    expect(research.updateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '北门',
        sourceType: null,
        sourceLabel: null,
        sourceUri: null,
        tags: ['历史', '地理'],
      }),
      expect.anything(),
    );
    expect(textContent(renderer.root)).toContain('研究笔记已保存。');

    await act(async () => {
      invoke(buttonByText(renderer.root, '归档'), 'onClick');
      await flushPromises();
    });
    expect(research.setNoteStatus).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('研究笔记已归档。');

    await act(async () => {
      invoke(buttonByText(renderer.root, '加入本地附件'), 'onClick');
      await flushPromises();
    });
    expect(research.importAttachment).toHaveBeenCalled();

    await act(async () => {
      invoke(buttonByText(renderer.root, '安全预览'), 'onClick');
      await flushPromises();
    });
    expect(research.previewAttachment).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('北门换防。');

    const attachmentReference = renderer.root.findAll(
      (node) =>
        node.type === 'label' &&
        textContent(node).includes('本次智能参考') &&
        !textContent(node).includes('当前笔记'),
    )[0];
    if (!attachmentReference) throw new Error('Missing attachment reference control.');
    await act(async () => {
      invoke(attachmentReference.findAll((node) => node.type === 'input')[0]!, 'onChange');
      invoke(
        controlByLabel(renderer.root, '将当前笔记列入本次智能参考'),
        'onChange',
      );
      invoke(controlByLabel(renderer.root, '关联类型'), 'onChange', {
        target: { value: 'entity' },
      });
      invoke(inputByPlaceholder(renderer.root, '粘贴当前作品内对象 ID'), 'onChange', {
        target: { value: targetId },
      });
    });
    await act(async () => {
      invoke(buttonByText(renderer.root, '建立关联'), 'onClick');
      await flushPromises();
    });
    expect(research.addLink).toHaveBeenCalled();

    await act(async () => invoke(buttonByText(renderer.root, '打开'), 'onClick'));
    expect(onNavigate).toHaveBeenCalledOnce();
    await act(async () => {
      invoke(buttonByText(renderer.root, '移除'), 'onClick');
      await flushPromises();
    });
    expect(research.removeLink).toHaveBeenCalled();

    await act(async () => {
      invoke(buttonByText(renderer.root, '删除附件'), 'onClick');
      await flushPromises();
    });
    expect(research.deleteAttachment).toHaveBeenCalled();

    await act(async () => {
      invoke(buttonByText(renderer.root, '新建笔记'), 'onClick');
      await flushPromises();
    });
    expect(research.createNote).toHaveBeenCalled();
    expect(onSelectNote).toHaveBeenCalledWith(createdNoteId);

    await act(async () => {
      invoke(buttonByText(renderer.root, '删除笔记'), 'onClick');
      await flushPromises();
    });
    expect(research.deleteNote).toHaveBeenCalled();

    await act(async () => invoke(buttonByText(renderer.root, '返回写作'), 'onClick'));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it('renders archived/read-only/large-attachment states and truncated preview safely', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const research = {
      list: vi.fn(async () => success(archivedCatalog)),
      previewAttachment: vi.fn(async () =>
        success({
          projectId,
          attachmentId,
          displayName: '城防摘要.md',
          mediaType: 'text/markdown' as const,
          contentHash: 'a'.repeat(64),
          text: '截断预览',
          truncated: true,
        }),
      ),
    };
    const renderer = await renderWorkbench(contractInput<RendererBridgeAdapter>({ research }), {
      readOnly: true,
    });

    expect(textContent(renderer.root)).toContain('只读作品');
    expect(textContent(renderer.root)).toContain('2.0 MB');
    expect(textContent(renderer.root)).toContain('地图.pdf · 3.0 MB · application/pdf');
    expect(textContent(renderer.root)).toContain('无标签 · 已归档');
    expect(buttonByText(renderer.root, '新建笔记').props.disabled).toBe(true);
    expect(buttonByText(renderer.root, '保存笔记').props.disabled).toBe(true);
    expect(buttonByText(renderer.root, '恢复').props.disabled).toBe(true);
    expect(buttonByText(renderer.root, '加入本地附件').props.disabled).toBe(true);
    expect(
      renderer.root.findAll(
        (node) => node.type === 'button' && textContent(node) === '安全预览',
      ),
    ).toHaveLength(1);

    await act(async () => {
      invoke(buttonByText(renderer.root, '安全预览'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('预览已按 256 KiB 安全上限截断。');
    expect(textContent(renderer.root)).toContain('预览内容已截断。');

    await act(async () => {
      invoke(buttonByText(renderer.root, '新建笔记'), 'onClick');
      invoke(buttonByText(renderer.root, '保存笔记'), 'onClick');
      invoke(buttonByText(renderer.root, '恢复'), 'onClick');
      invoke(buttonByText(renderer.root, '删除笔记'), 'onClick');
      invoke(buttonByText(renderer.root, '加入本地附件'), 'onClick');
      invoke(buttonByText(renderer.root, '删除附件'), 'onClick');
    });
    await act(async () => renderer.unmount());
  });

  it('handles load selection fallback, empty catalogs and archived restore success', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const onSelectMissing = vi.fn();
    const missingRenderer = await renderWorkbench(
      contractInput<RendererBridgeAdapter>({ research: { list: vi.fn(async () => success(catalog)) } }),
      {
        selectedNoteId: '77777777-7777-4777-8777-777777777777',
        onSelectNote: onSelectMissing,
      },
    );
    expect(onSelectMissing).toHaveBeenCalledWith(noteId);
    expect(textContent(missingRenderer.root)).toContain('选择一条研究笔记');
    await act(async () => missingRenderer.unmount());

    const onSelectInitial = vi.fn();
    const initialRenderer = await renderWorkbench(
      contractInput<RendererBridgeAdapter>({ research: { list: vi.fn(async () => success(catalog)) } }),
      { selectedNoteId: null, onSelectNote: onSelectInitial },
    );
    expect(onSelectInitial).toHaveBeenCalledWith(noteId);
    await act(async () => initialRenderer.unmount());

    const emptyRenderer = await renderWorkbench(
      contractInput<RendererBridgeAdapter>({
        research: { list: vi.fn(async () => success(emptyCatalog)) },
      }),
      { selectedNoteId: null },
    );
    expect(textContent(emptyRenderer.root)).toContain('还没有符合条件的研究笔记。');
    expect(textContent(emptyRenderer.root)).toContain('选择一条研究笔记，或新建第一条。');
    await act(async () => emptyRenderer.unmount());

    const status = vi.fn(async () => success(catalog));
    const archivedRenderer = await renderWorkbench(
      contractInput<RendererBridgeAdapter>({
        research: { list: vi.fn(async () => success(archivedCatalog)), setNoteStatus: status },
      }),
    );
    await act(async () => {
      invoke(buttonByText(archivedRenderer.root, '恢复'), 'onClick');
      await flushPromises();
    });
    expect(status).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
      expect.anything(),
    );
    expect(textContent(archivedRenderer.root)).toContain('研究笔记已恢复。');
    await act(async () => archivedRenderer.unmount());
  });

  it('surfaces load and every author mutation failure without mutating authority', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const loadFailure = await renderWorkbench(
      contractInput<RendererBridgeAdapter>({ research: { list: vi.fn(async () => failure()) } }),
    );
    expect(textContent(loadFailure.root)).toContain('研究资料读取失败');
    await act(async () => loadFailure.unmount());

    const research = {
      list: vi.fn(async () => success(catalog)),
      createNote: vi.fn(async () => failure()),
      updateNote: vi.fn(async () => failure()),
      setNoteStatus: vi.fn(async () => failure()),
      deleteNote: vi.fn(async () => failure()),
      importAttachment: vi
        .fn()
        .mockResolvedValueOnce(failure('COMMON_CANCELLED_004'))
        .mockResolvedValueOnce(failure()),
      previewAttachment: vi.fn(async () => failure()),
      deleteAttachment: vi.fn(async () => failure()),
      addLink: vi.fn(async () => failure()),
      removeLink: vi.fn(async () => failure()),
    };
    const renderer = await renderWorkbench(contractInput<RendererBridgeAdapter>({ research }));

    const run = async (button: string, expected: string) => {
      await act(async () => {
        invoke(buttonByText(renderer.root, button), 'onClick');
        await flushPromises();
      });
      expect(textContent(renderer.root)).toContain(expected);
    };

    await run('新建笔记', '创建失败');
    await run('保存笔记', '保存失败');
    await run('归档', '状态更新失败');
    await run('删除笔记', '删除失败');
    await run('加入本地附件', '已取消选择附件。');
    await run('加入本地附件', '附件导入失败');
    await run('安全预览', '预览失败');
    await run('删除附件', '附件删除失败');

    await act(async () => {
      invoke(inputByPlaceholder(renderer.root, '粘贴当前作品内对象 ID'), 'onChange', {
        target: { value: targetId },
      });
    });
    await run('建立关联', '关联失败');
    await run('移除', '移除关联失败');
    await act(async () => renderer.unmount());
  });
});
