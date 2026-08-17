import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement, ReactNode } from 'react';

import type { DraftBlockChoice } from '../../apps/desktop/renderer/src/features/writing/draft-block-picker.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement, useState } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
  readonly useState: <State>(
    initial: State | (() => State),
  ) => readonly [State, (value: State | ((current: State) => State)) => void];
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

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const thirdId = '33333333-3333-4333-8333-333333333333';
const blocks: readonly DraftBlockChoice[] = [
  { logicalBlockId: firstId, text: '  第一段   有多余空格  ', locked: false },
  { logicalBlockId: secondId, text: '   ', locked: true },
  { logicalBlockId: thirdId, text: '长'.repeat(130), locked: false },
];

interface HarnessProps {
  readonly onMultiple: (value: string[] | null) => void;
  readonly onAnchor: (value: string | null | undefined) => void;
}

function textContent(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textContent).join('');
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const found = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!found) throw new Error(`Missing ${type} control.`);
  return found;
}

function button(root: TestInstance, label: string, index = 0): TestInstance {
  const found = root.findAll((node) => node.type === 'button' && textContent(node) === label)[
    index
  ];
  if (!found) throw new Error(`Missing button ${label}#${index}.`);
  return found;
}

async function invoke(node: TestInstance, prop: 'onClick' | 'onChange', argument?: unknown) {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(props: HarnessProps): Promise<TestRenderer> {
  const { useDraftBlockPicker } =
    await import('../../apps/desktop/renderer/src/features/writing/draft-block-picker.js');
  function Harness(): ReactNode {
    const picker = useDraftBlockPicker();
    const [, setTick] = useState(0);
    const startMultiple = (input: Parameters<typeof picker.pickMultipleBlocks>[0]) => {
      void picker.pickMultipleBlocks(input).then((value) => {
        props.onMultiple(value);
        setTick((current: number) => current + 1);
      });
    };
    const startAnchor = (input: Parameters<typeof picker.pickBlockAnchor>[0]) => {
      void picker.pickBlockAnchor(input).then((value) => {
        props.onAnchor(value);
        setTick((current: number) => current + 1);
      });
    };
    return createElement(
      'div',
      null,
      createElement(
        'button',
        {
          'data-start': 'multiple-default',
          onClick: () => startMultiple({ title: '选择正文', description: '选择多个段落', blocks }),
        },
        '多选默认',
      ),
      createElement(
        'button',
        {
          'data-start': 'multiple-options',
          onClick: () =>
            startMultiple({
              title: '锁定选择',
              description: '锁定段落不可操作',
              blocks,
              initialIds: [secondId],
              allowEmpty: true,
              disableLocked: true,
            }),
        },
        '多选选项',
      ),
      createElement(
        'button',
        {
          'data-start': 'multiple-empty',
          onClick: () =>
            startMultiple({
              title: '允许空选择',
              description: '允许不选正文',
              blocks: [],
              allowEmpty: true,
            }),
        },
        '空多选',
      ),
      createElement(
        'button',
        {
          'data-start': 'anchor-default',
          onClick: () => startAnchor({ title: '插入位置', description: '选择段落之后', blocks }),
        },
        '锚点默认',
      ),
      createElement(
        'button',
        {
          'data-start': 'anchor-start',
          onClick: () =>
            startAnchor({
              title: '选择原文',
              description: '可选择章节开头',
              blocks,
              initialId: secondId,
              allowStart: true,
              labelMode: 'select',
            }),
        },
        '锚点开头',
      ),
      picker.picker,
    );
  }

  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(Harness));
    await Promise.resolve();
  });
  return renderer;
}

async function unmount(renderer: TestRenderer): Promise<void> {
  await act(async () => {
    renderer.unmount();
    await Promise.resolve();
  });
}

function start(root: TestInstance, key: string): TestInstance {
  return control(root, 'button', (node) => node.props['data-start'] === key);
}

function choices(root: TestInstance): TestInstance[] {
  return root.findAll(
    (node) =>
      node.type === 'input' && (node.props.type === 'checkbox' || node.props.type === 'radio'),
  );
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});

describe('M11 正文段落选择器交互覆盖', () => {
  it('覆盖默认多选、锁定初选、空选择、摘要截断和取消', async () => {
    const onMultiple = vi.fn();
    const renderer = await mount({ onMultiple, onAnchor: vi.fn() });

    await invoke(start(renderer.root, 'multiple-default'), 'onClick');
    expect(textContent(renderer.root)).toContain('第一段 有多余空格');
    expect(textContent(renderer.root)).toContain('空段落');
    expect(textContent(renderer.root)).toContain(`${'长'.repeat(120)}…`);
    expect(textContent(renderer.root)).toContain('第 2 段 · 已锁定');
    const confirm = button(renderer.root, '确认选择');
    expect(confirm.props.disabled).toBe(true);

    const firstChoice = choices(renderer.root)[0]!;
    await invoke(firstChoice, 'onChange', { target: { checked: true } });
    await invoke(firstChoice, 'onChange', { target: { checked: false } });
    expect(button(renderer.root, '确认选择').props.disabled).toBe(true);
    await invoke(firstChoice, 'onChange', { target: { checked: true } });
    expect(button(renderer.root, '确认选择').props.disabled).toBe(false);
    await invoke(button(renderer.root, '确认选择'), 'onClick');
    expect(onMultiple).toHaveBeenLastCalledWith([firstId]);

    await invoke(start(renderer.root, 'multiple-options'), 'onClick');
    const optionChoices = choices(renderer.root);
    expect(optionChoices[1]!.props.checked).toBe(true);
    expect(optionChoices[1]!.props.disabled).toBe(true);
    expect(button(renderer.root, '确认选择').props.disabled).toBe(false);
    await invoke(button(renderer.root, '确认选择'), 'onClick');
    expect(onMultiple).toHaveBeenLastCalledWith([secondId]);

    await invoke(start(renderer.root, 'multiple-empty'), 'onClick');
    expect(textContent(renderer.root)).toContain('当前没有可选择的正文段落。');
    expect(button(renderer.root, '确认选择').props.disabled).toBe(false);
    await invoke(button(renderer.root, '确认选择'), 'onClick');
    expect(onMultiple).toHaveBeenLastCalledWith([]);

    await invoke(start(renderer.root, 'multiple-default'), 'onClick');
    await invoke(button(renderer.root, '取消', 0), 'onClick');
    expect(onMultiple).toHaveBeenLastCalledWith(null);
    await unmount(renderer);
  });

  it('覆盖普通锚点、章节开头、标签模式与取消结果', async () => {
    const onAnchor = vi.fn();
    const renderer = await mount({ onMultiple: vi.fn(), onAnchor });

    await invoke(start(renderer.root, 'anchor-default'), 'onClick');
    expect(textContent(renderer.root)).toContain('第 1 段之后');
    expect(button(renderer.root, '确认选择').props.disabled).toBe(true);
    await invoke(choices(renderer.root)[0]!, 'onChange', { target: { checked: true } });
    await invoke(button(renderer.root, '确认选择'), 'onClick');
    expect(onAnchor).toHaveBeenLastCalledWith(firstId);

    await invoke(start(renderer.root, 'anchor-start'), 'onClick');
    expect(textContent(renderer.root)).toContain('章节开头');
    expect(textContent(renderer.root)).toContain('第 1 段');
    expect(textContent(renderer.root)).not.toContain('第 1 段之后');
    const anchorChoices = choices(renderer.root);
    expect(anchorChoices[2]!.props.checked).toBe(true);
    await invoke(anchorChoices[0]!, 'onChange', { target: { checked: true } });
    await invoke(button(renderer.root, '确认选择'), 'onClick');
    expect(onAnchor).toHaveBeenLastCalledWith(null);

    await invoke(start(renderer.root, 'anchor-default'), 'onClick');
    await invoke(button(renderer.root, '取消', 1), 'onClick');
    expect(onAnchor).toHaveBeenLastCalledWith(undefined);
    await unmount(renderer);
  });

  it('新请求会取消旧请求，卸载会取消仍未决的选择', async () => {
    const onMultiple = vi.fn();
    const onAnchor = vi.fn();
    const renderer = await mount({ onMultiple, onAnchor });

    await invoke(start(renderer.root, 'multiple-default'), 'onClick');
    await invoke(start(renderer.root, 'anchor-default'), 'onClick');
    expect(onMultiple).toHaveBeenCalledWith(null);
    expect(textContent(renderer.root)).toContain('插入位置');

    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onAnchor).toHaveBeenCalledWith(undefined);
  });
});
