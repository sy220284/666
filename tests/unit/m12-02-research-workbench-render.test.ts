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

function success<T>(data: T) {
  return {
    state: 'success' as const,
    generation: 1,
    requestId: '66666666-6666-4666-8666-666666666666',
    data,
  };
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function byText(root: TestInstance, text: string): TestInstance {
  const matches = root.findAll((node) => textContent(node) === text);
  const match = matches.find((node) => typeof node.type === 'string');
  if (!match) throw new Error(`Missing rendered node: ${text}`);
  return match;
}

function inputByPlaceholder(root: TestInstance, placeholder: string): TestInstance {
  const match = root.findAll((node) => node.props.placeholder === placeholder)[0];
  if (!match) throw new Error(`Missing input: ${placeholder}`);
  return match;
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

afterEach(() => {
  consumeResearchReferenceSelection(projectId, [
    { sourceType: 'note', sourceId: noteId },
    { sourceType: 'attachment', sourceId: attachmentId },
  ]);
  vi.unstubAllGlobals();
});

describe('M12-02 research workbench render and interaction coverage', () => {
  it('loads the catalog and exercises author-controlled note, attachment, link and AI-reference actions', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const research = {
      list: vi.fn(async () => success(catalog)),
      createNote: vi.fn(async () => success(catalog)),
      updateNote: vi.fn(async () => success(catalog)),
      setNoteStatus: vi.fn(async () => success(catalog)),
      deleteNote: vi.fn(async () => success(catalog)),
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

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(ResearchWorkbench, {
          bridge,
          projectId,
          readOnly: false,
          selectedNoteId: noteId,
          navigationQuery: '城防',
          onNavigate,
          onSelectNote,
          onClose,
        }),
      );
      await flushPromises();
    });

    expect(textContent(renderer.root)).toContain('北地城防资料');
    expect(textContent(renderer.root)).toContain('城防摘要.md');
    expect(textContent(renderer.root)).toContain('章节');
    expect(research.list).toHaveBeenCalled();

    await act(async () => {
      invoke(byText(renderer.root, '保存笔记'), 'onClick');
      await flushPromises();
    });
    expect(research.updateNote).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('研究笔记已保存。');

    await act(async () => {
      invoke(byText(renderer.root, '归档'), 'onClick');
      await flushPromises();
    });
    expect(research.setNoteStatus).toHaveBeenCalled();

    await act(async () => {
      invoke(byText(renderer.root, '加入本地附件'), 'onClick');
      await flushPromises();
    });
    expect(research.importAttachment).toHaveBeenCalled();

    await act(async () => {
      invoke(byText(renderer.root, '安全预览'), 'onClick');
      await flushPromises();
    });
    expect(research.previewAttachment).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('北门换防。');

    const referenceCheckboxes = renderer.root.findAll(
      (node) => node.props.type === 'checkbox' && node.props.checked === false,
    );
    const attachmentReference = referenceCheckboxes.at(-1);
    if (!attachmentReference) throw new Error('Missing attachment reference checkbox.');
    await act(async () => {
      invoke(attachmentReference, 'onChange', { target: { checked: true } });
    });

    await act(async () => {
      invoke(inputByPlaceholder(renderer.root, '粘贴当前作品内对象 ID'), 'onChange', {
        target: { value: targetId },
      });
    });
    await act(async () => {
      invoke(byText(renderer.root, '建立关联'), 'onClick');
      await flushPromises();
    });
    expect(research.addLink).toHaveBeenCalled();

    const navigateButton = renderer.root
      .findAll((node) => typeof node.props.onClick === 'function')
      .find((node) => textContent(node).includes('跳转'));
    if (navigateButton) {
      await act(async () => invoke(navigateButton, 'onClick'));
      expect(onNavigate).toHaveBeenCalled();
    }

    const unlinkButton = renderer.root
      .findAll((node) => typeof node.props.onClick === 'function')
      .find((node) => textContent(node).includes('移除关联'));
    if (unlinkButton) {
      await act(async () => {
        invoke(unlinkButton, 'onClick');
        await flushPromises();
      });
      expect(research.removeLink).toHaveBeenCalled();
    }

    await act(async () => {
      invoke(byText(renderer.root, '删除附件'), 'onClick');
      await flushPromises();
    });
    expect(research.deleteAttachment).toHaveBeenCalled();

    await act(async () => {
      invoke(byText(renderer.root, '新建笔记'), 'onClick');
      await flushPromises();
    });
    expect(research.createNote).toHaveBeenCalled();

    const deleteNoteButton = renderer.root
      .findAll((node) => typeof node.props.onClick === 'function')
      .find((node) => textContent(node) === '删除笔记');
    if (deleteNoteButton) {
      await act(async () => {
        invoke(deleteNoteButton, 'onClick');
        await flushPromises();
      });
      expect(research.deleteNote).toHaveBeenCalled();
    }

    await act(async () => invoke(byText(renderer.root, '返回写作'), 'onClick'));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => renderer.unmount());
  });

  it('renders a read-only catalog without exposing mutation controls as enabled', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const bridge = contractInput<RendererBridgeAdapter>({
      research: {
        list: vi.fn(async () => success(catalog)),
      },
    });
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(
        createElement(ResearchWorkbench, {
          bridge,
          projectId,
          readOnly: true,
          selectedNoteId: noteId,
          navigationQuery: null,
          onNavigate: () => undefined,
          onSelectNote: () => undefined,
          onClose: () => undefined,
        }),
      );
      await flushPromises();
    });

    expect(byText(renderer.root, '新建笔记').props.disabled).toBe(true);
    expect(byText(renderer.root, '保存笔记').props.disabled).toBe(true);
    expect(byText(renderer.root, '归档').props.disabled).toBe(true);
    expect(byText(renderer.root, '加入本地附件').props.disabled).toBe(true);
    await act(async () => renderer.unmount());
  });
});
