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
const attachmentId = '33333333-3333-4333-8333-333333333333';
const secondAttachmentId = '34343434-3434-4343-8343-343434343434';
const linkId = '44444444-4444-4444-8444-444444444444';
const targetId = '55555555-5555-4555-8555-555555555555';
const timestamp = '2026-08-14T08:00:00.000Z';

const note = {
  id: noteId,
  projectId,
  title: '北地城防资料',
  body: '记录城门与换防。',
  sourceType: null,
  sourceLabel: null,
  sourceUri: null,
  tags: [],
  status: 'active' as const,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: null,
};

const attachment = {
  id: attachmentId,
  projectId,
  noteId,
  displayName: '资料.txt',
  mediaType: 'text/plain',
  sizeBytes: 100,
  contentHash: 'a'.repeat(64),
  managedRelativePath: `artifacts/research/${attachmentId}.txt`,
  createdAt: timestamp,
};

const catalog: ResearchCatalog = {
  projectId,
  notes: [note],
  attachments: [attachment],
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

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '66666666-6666-4666-8666-666666666666',
    data,
  };
}

function stale() {
  return contractInput({
    state: 'stale' as const,
    generation: 2,
    requestId: '66666666-6666-4666-8666-666666666666',
  });
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonByText(root: TestInstance, text: string, index = 0): TestInstance {
  const match = root.findAll((node) => node.type === 'button' && textContent(node) === text)[index];
  if (!match) throw new Error(`Missing button: ${text}[${index}]`);
  return match;
}

function inputByPlaceholder(root: TestInstance, placeholder: string): TestInstance {
  const match = root.findAll((node) => node.props.placeholder === placeholder)[0];
  if (!match) throw new Error(`Missing input: ${placeholder}`);
  return match;
}

function invoke(node: TestInstance, name: 'onClick' | 'onChange', argument?: unknown): void {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name} handler.`);
  (handler as (value?: unknown) => void)(argument);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function render(
  research: Record<string, unknown>,
  options: {
    readonly selectedNoteId?: string | null;
    readonly readOnly?: boolean;
    readonly onSelectNote?: (noteId: string | null) => void;
  } = {},
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(ResearchWorkbench, {
        bridge: contractInput<RendererBridgeAdapter>({ research }),
        projectId,
        readOnly: options.readOnly ?? false,
        selectedNoteId: options.selectedNoteId === undefined ? noteId : options.selectedNoteId,
        navigationQuery: null,
        onNavigate: () => undefined,
        onSelectNote: options.onSelectNote ?? (() => undefined),
        onClose: () => undefined,
      }),
    );
    await flush();
  });
  return renderer;
}

afterEach(() => {
  consumeResearchReferenceSelection(projectId, [
    { sourceType: 'note', sourceId: noteId },
    { sourceType: 'attachment', sourceId: attachmentId },
    { sourceType: 'attachment', sourceId: secondAttachmentId },
  ]);
  vi.unstubAllGlobals();
});

describe('M12-02 research workbench defensive branch coverage', () => {
  it('covers create sorting and applyCatalog fallback when no new note is returned', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const expanded: ResearchCatalog = {
      ...catalog,
      notes: [
        ...catalog.notes,
        { ...note, id: '77777777-7777-4777-8777-777777777777', createdAt: '2026-08-14T09:00:00.000Z' },
        { ...note, id: '88888888-8888-4888-8888-888888888888', createdAt: '2026-08-14T10:00:00.000Z' },
      ],
    };
    const createNote = vi.fn(async () => success(expanded));
    const onSelectNote = vi.fn();
    const renderer = await render({ list: vi.fn(async () => success(catalog)), createNote }, { onSelectNote });

    await act(async () => {
      invoke(buttonByText(renderer.root, '新建笔记'), 'onClick');
      await flush();
    });
    expect(onSelectNote).toHaveBeenCalledWith('88888888-8888-4888-8888-888888888888');

    await act(async () => {
      invoke(buttonByText(renderer.root, '新建笔记'), 'onClick');
      await flush();
    });
    expect(createNote).toHaveBeenCalledTimes(2);
    expect(onSelectNote).toHaveBeenCalledWith(noteId);
    await act(async () => renderer.unmount());
  });

  it('treats stale list and mutation outcomes as no-op results instead of author-visible failures', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const staleSelection = vi.fn();
    const staleLoad = await render({ list: vi.fn(async () => stale()) }, { onSelectNote: staleSelection });
    expect(staleSelection).not.toHaveBeenCalled();
    await act(async () => staleLoad.unmount());

    const emptySelection = vi.fn();
    const empty = await render(
      { list: vi.fn(async () => success({ projectId, notes: [], attachments: [], links: [] })) },
      { selectedNoteId: '99999999-9999-4999-8999-999999999999', onSelectNote: emptySelection },
    );
    expect(emptySelection).toHaveBeenCalledWith(null);
    await act(async () => empty.unmount());

    const research = {
      list: vi.fn(async () => success(catalog)),
      createNote: vi.fn(async () => stale()),
      updateNote: vi.fn(async () => stale()),
      setNoteStatus: vi.fn(async () => stale()),
      deleteNote: vi.fn(async () => stale()),
      importAttachment: vi.fn(async () => stale()),
      previewAttachment: vi.fn(async () => stale()),
      deleteAttachment: vi.fn(async () => stale()),
      addLink: vi.fn(async () => stale()),
      removeLink: vi.fn(async () => stale()),
    };
    const renderer = await render(research);
    const click = async (label: string, index = 0) => {
      await act(async () => {
        invoke(buttonByText(renderer.root, label, index), 'onClick');
        await flush();
      });
    };

    await click('新建笔记');
    await click('保存笔记');
    await click('归档');
    await click('删除笔记');
    await click('加入本地附件');
    await click('安全预览');
    await click('删除附件');
    await act(async () => {
      invoke(inputByPlaceholder(renderer.root, '粘贴当前作品内对象 ID'), 'onChange', {
        target: { value: targetId },
      });
    });
    await click('建立关联');
    await click('移除');
    expect(research.createNote).toHaveBeenCalled();
    expect(research.removeLink).toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('covers empty attachments and the defensive unknown-link label fallback', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const defensive = contractInput<ResearchCatalog>({
      projectId,
      notes: [note],
      attachments: [],
      links: [
        {
          id: linkId,
          projectId,
          sourceType: 'note',
          sourceId: noteId,
          targetType: 'legacy-target',
          targetId,
          createdAt: timestamp,
        },
      ],
    });
    const renderer = await render({ list: vi.fn(async () => success(defensive)) });
    expect(textContent(renderer.root)).toContain('暂无附件。');
    expect(textContent(renderer.root)).toContain('legacy-target');
    await act(async () => renderer.unmount());
  });

  it('guards duplicate actions while a preview is pending and covers mismatched preview deletion', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const twoAttachments: ResearchCatalog = {
      ...catalog,
      attachments: [
        attachment,
        {
          ...attachment,
          id: secondAttachmentId,
          displayName: '第二份资料.txt',
          contentHash: 'b'.repeat(64),
          managedRelativePath: `artifacts/research/${secondAttachmentId}.txt`,
        },
      ],
    };
    let resolvePreview!: (value: ReturnType<typeof success>) => void;
    const previewPromise = new Promise<ReturnType<typeof success>>((resolve) => {
      resolvePreview = resolve;
    });
    const previewAttachment = vi.fn(() => previewPromise);
    const deleteAttachment = vi.fn(async () => success(twoAttachments));
    const addLink = vi.fn(async () => success(twoAttachments));
    const removeLink = vi.fn(async () => success(twoAttachments));
    const renderer = await render({
      list: vi.fn(async () => success(twoAttachments)),
      previewAttachment,
      deleteAttachment,
      addLink,
      removeLink,
    });

    await act(async () => {
      invoke(inputByPlaceholder(renderer.root, '粘贴当前作品内对象 ID'), 'onChange', {
        target: { value: targetId },
      });
      invoke(buttonByText(renderer.root, '安全预览'), 'onClick');
      await Promise.resolve();
    });

    await act(async () => {
      invoke(buttonByText(renderer.root, '安全预览'), 'onClick');
      invoke(buttonByText(renderer.root, '删除附件', 1), 'onClick');
      invoke(buttonByText(renderer.root, '建立关联'), 'onClick');
      invoke(buttonByText(renderer.root, '移除'), 'onClick');
      await Promise.resolve();
    });
    expect(previewAttachment).toHaveBeenCalledTimes(1);
    expect(deleteAttachment).not.toHaveBeenCalled();
    expect(addLink).not.toHaveBeenCalled();
    expect(removeLink).not.toHaveBeenCalled();

    resolvePreview(
      success({
        projectId,
        attachmentId,
        displayName: '资料.txt',
        mediaType: 'text/plain' as const,
        contentHash: 'a'.repeat(64),
        text: '预览内容',
        truncated: false,
      }),
    );
    await act(async () => flush());

    await act(async () => {
      invoke(buttonByText(renderer.root, '删除附件', 1), 'onClick');
      await flush();
    });
    expect(deleteAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ attachmentId: secondAttachmentId }),
      expect.anything(),
    );
    expect(textContent(renderer.root)).toContain('预览内容');
    await act(async () => renderer.unmount());
  });
});
