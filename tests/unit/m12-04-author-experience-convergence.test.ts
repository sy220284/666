import { readdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import { AuthorDialogHost } from '../../apps/desktop/renderer/src/components/author-dialog-host.js';
import { authorGenerationStageLabel } from '../../apps/desktop/renderer/src/presentation/author-status-labels.js';
import {
  authorConfirm,
  authorConfirmName,
  authorPrompt,
  authorSelect,
  resetAuthorDialogsForTesting,
} from '../../apps/desktop/renderer/src/runtime/author-dialog.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};

interface TestInstance {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
  findAll(predicate: (node: TestInstance) => boolean): TestInstance[];
}

interface TestRenderer {
  readonly root: TestInstance;
  unmount(): void;
}

const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (
    element: ReactElement,
    options: { readonly createNodeMock: (element: TestInstance) => unknown },
  ) => TestRenderer;
};

class FocusTarget {
  readonly focus = vi.fn();
}

let previousFocus: FocusTarget;
let keydown: ((event: { readonly key: string; preventDefault(): void }) => void) | null = null;
let activeRenderer: TestRenderer | null = null;
const focusedControls: FocusTarget[] = [];

function node(root: TestInstance, attribute: string): TestInstance {
  const result = root.findAll((item) => item.props[attribute] !== undefined)[0];
  if (!result) throw new Error(`MISSING_AUTHOR_DIALOG_CONTROL:${attribute}`);
  return result;
}

async function click(root: TestInstance, attribute: string): Promise<void> {
  const handler = node(root, attribute).props.onClick;
  if (typeof handler !== 'function') throw new Error(`MISSING_AUTHOR_DIALOG_CLICK:${attribute}`);
  await act(async () => {
    handler();
    await Promise.resolve();
  });
}

async function change(root: TestInstance, value: string): Promise<void> {
  const handler = node(root, 'data-author-dialog-input').props.onChange;
  if (typeof handler !== 'function') throw new Error('MISSING_AUTHOR_DIALOG_CHANGE');
  await act(async () => {
    handler({ target: { value } });
  });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('HTMLElement', FocusTarget);
  previousFocus = new FocusTarget();
  vi.stubGlobal('document', { activeElement: previousFocus });
  vi.stubGlobal('window', {
    addEventListener: vi.fn((type: string, listener: typeof keydown) => {
      if (type === 'keydown') keydown = listener;
    }),
    removeEventListener: vi.fn((_type: string, listener: typeof keydown) => {
      if (keydown === listener) keydown = null;
    }),
  });
  await act(async () => {
    activeRenderer = create(createElement(AuthorDialogHost), {
      createNodeMock: () => {
        const control = new FocusTarget();
        focusedControls.push(control);
        return control;
      },
    });
  });
});

afterEach(async () => {
  await act(async () => {
    resetAuthorDialogsForTesting();
    activeRenderer?.unmount();
    activeRenderer = null;
  });
  focusedControls.splice(0);
  keydown = null;
  vi.unstubAllGlobals();
});

describe('M12-04 author interaction convergence', () => {
  it('renders confirmation, text, options and exact-name safeguards through one focused host', async () => {
    if (!activeRenderer) throw new Error('AUTHOR_DIALOG_HOST_NOT_MOUNTED');
    const renderer = activeRenderer;
    let confirmation!: Promise<boolean>;
    await act(async () => {
      confirmation = authorConfirm({ title: '确认删除章节', danger: true });
    });
    expect(node(renderer.root, 'data-author-dialog').props['data-author-dialog-kind']).toBe(
      'confirm',
    );
    expect(focusedControls.some((control) => control.focus.mock.calls.length > 0)).toBe(true);
    await click(renderer.root, 'data-author-dialog-confirm');
    expect(await confirmation).toBe(true);
    expect(previousFocus.focus).toHaveBeenCalled();

    let text!: Promise<string | null>;
    await act(async () => {
      text = authorPrompt({ title: '填写章节名称', initialValue: '旧名称' });
    });
    await change(renderer.root, '新章节');
    await click(renderer.root, 'data-author-dialog-confirm');
    expect(await text).toBe('新章节');

    let selection!: Promise<string | null>;
    await act(async () => {
      selection = authorSelect({
        title: '选择目标章节',
        options: [{ value: 'chapter-a', label: '第一章' }],
      });
    });
    expect(node(renderer.root, 'data-author-dialog-confirm').props.disabled).toBe(true);
    await change(renderer.root, 'chapter-a');
    await click(renderer.root, 'data-author-dialog-confirm');
    expect(await selection).toBe('chapter-a');

    let protectedDelete!: Promise<boolean>;
    await act(async () => {
      protectedDelete = authorConfirmName({
        title: '永久删除',
        expectedName: '沈砚',
        danger: true,
      });
    });
    expect(node(renderer.root, 'data-author-dialog-confirm').props.disabled).toBe(true);
    await change(renderer.root, '沈砚');
    expect(node(renderer.root, 'data-author-dialog-confirm').props.disabled).toBe(false);
    await click(renderer.root, 'data-author-dialog-confirm');
    expect(await protectedDelete).toBe(true);
  });

  it('cancels with Escape and maps internal generation stages into author language', async () => {
    let decision!: Promise<boolean>;
    await act(async () => {
      decision = authorConfirm({ title: '确认放弃修改' });
    });
    const preventDefault = vi.fn();
    await act(async () => {
      keydown?.({ key: 'Escape', preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(await decision).toBe(false);

    expect(authorGenerationStageLabel('queued')).toBe('等待开始');
    expect(authorGenerationStageLabel('assembling_constraints')).toBe('准备上下文');
    expect(authorGenerationStageLabel('receiving_output')).toBe('生成建议稿');
    expect(authorGenerationStageLabel('saving_candidate')).toBe('整理结果');
    expect(authorGenerationStageLabel('completed', 'succeeded')).toBe('已完成');
    expect(authorGenerationStageLabel('completed', 'failed')).toBe('失败');
    expect(authorGenerationStageLabel('completed', 'cancelled')).toBe('已取消');
  });

  it('leaves native confirmation only in the documented synchronous shutdown safeguard', async () => {
    const rendererRoot = path.join(process.cwd(), 'apps/desktop/renderer/src');
    for (const directory of ['features', 'runtime']) {
      const root = path.join(rendererRoot, directory);
      const files = await readdir(root, { recursive: true, withFileTypes: true });
      for (const entry of files) {
        if (!entry.isFile() || !/\.(?:ts|tsx)$/u.test(entry.name)) continue;
        const source = await readFile(path.join(entry.parentPath, entry.name), 'utf8');
        if (directory === 'runtime' && entry.name === 'unsaved-changes.ts') {
          expect(source).toContain('仅此安全兜底保留原生确认框');
          expect(source.match(/window\.confirm\(/gu)).toHaveLength(1);
          continue;
        }
        expect(source).not.toMatch(/window\.(?:prompt|confirm)\(/u);
      }
    }
  });
});
