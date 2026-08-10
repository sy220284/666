import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactHarness = vi.hoisted(() => ({
  stateOverrides: [] as unknown[],
  cleanups: [] as Array<() => void>,
}));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useCallback: <T>(callback: T): T => callback,
    useEffect: (effect: () => void | (() => void)): void => {
      const cleanup = effect();
      if (typeof cleanup === 'function') reactHarness.cleanups.push(cleanup);
    },
    useRef: <T>(initialValue: T) => ({ current: initialValue }),
    useState: <T>(initialValue: T | (() => T)) => {
      let current = reactHarness.stateOverrides.length
        ? (reactHarness.stateOverrides.shift() as T)
        : typeof initialValue === 'function'
          ? (initialValue as () => T)()
          : initialValue;
      const setState = (next: T | ((value: T) => T)): void => {
        current = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
      };
      return [current, setState] as const;
    },
  };
});

import {
  useDraftBlockPicker,
  type DraftBlockChoice,
} from '../../apps/desktop/renderer/src/features/writing/draft-block-picker.js';

type ElementLike = ReactElement<Record<string, unknown>, string | ((props: never) => unknown)>;

function isElement(value: unknown): value is ElementLike {
  return typeof value === 'object' && value !== null && 'props' in value && 'type' in value;
}

function collectElements(root: unknown): ElementLike[] {
  const elements: ElementLike[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isElement(value)) return;
    elements.push(value);
    visit(value.props.children);
  };
  visit(root);
  return elements;
}

const blocks: readonly DraftBlockChoice[] = [
  { logicalBlockId: 'block-a', text: '第一段正文', locked: false },
  { logicalBlockId: 'block-b', text: '', locked: true },
  { logicalBlockId: 'block-c', text: '长段落'.repeat(50), locked: false },
];

const multipleRequest = {
  kind: 'multiple' as const,
  requestId: 1,
  title: '选择正文段落',
  description: '直接勾选原文。',
  blocks,
  initialIds: ['block-a'],
  allowEmpty: false,
  disableLocked: true,
};

describe('M11 可视化正文段落选择器', () => {
  beforeEach(() => {
    reactHarness.stateOverrides.length = 0;
    reactHarness.cleanups.length = 0;
  });

  it('覆盖选择请求的取消、完成和卸载清理', async () => {
    reactHarness.stateOverrides.push(multipleRequest);
    const pickerApi = useDraftBlockPicker();
    expect(isElement(pickerApi.picker)).toBe(true);
    if (!isElement(pickerApi.picker)) throw new Error('正文选择器未生成');

    const cancel = pickerApi.picker.props.onCancel as () => void;
    const confirm = pickerApi.picker.props.onConfirm as (result: unknown) => void;

    const multiple = pickerApi.pickMultipleBlocks({
      title: '移动正文段落',
      description: '选择要移动的正文。',
      blocks,
      initialIds: ['block-a'],
      disableLocked: true,
    });
    cancel();
    await expect(multiple).resolves.toBeNull();

    const anchor = pickerApi.pickBlockAnchor({
      title: '选择插入位置',
      description: '选择原文位置。',
      blocks,
      initialId: 'block-b',
      allowStart: true,
      labelMode: 'select',
    });
    confirm({ kind: 'anchor', id: 'block-b' });
    await expect(anchor).resolves.toBe('block-b');

    reactHarness.cleanups.forEach((cleanup) => cleanup());
  });

  it('覆盖多选段落、锁定状态、空段落和长段落预览', () => {
    reactHarness.stateOverrides.push(multipleRequest);
    const pickerApi = useDraftBlockPicker();
    if (!isElement(pickerApi.picker) || typeof pickerApi.picker.type !== 'function') {
      throw new Error('正文选择器对话框未生成');
    }

    const confirm = vi.fn();
    const cancel = vi.fn();
    reactHarness.stateOverrides.push(new Set(['block-a']), null);
    const dialog = pickerApi.picker.type({
      ...pickerApi.picker.props,
      request: multipleRequest,
      onCancel: cancel,
      onConfirm: confirm,
    } as never);
    const elements = collectElements(dialog);
    const inputs = elements.filter((element) => element.type === 'input');
    expect(inputs).toHaveLength(3);
    expect(inputs[1]?.props.disabled).toBe(true);

    const firstChange = inputs[0]?.props.onChange as
      | ((event: { target: { checked: boolean } }) => void)
      | undefined;
    firstChange?.({ target: { checked: false } });
    firstChange?.({ target: { checked: true } });

    const secondChange = inputs[1]?.props.onChange as
      | ((event: { target: { checked: boolean } }) => void)
      | undefined;
    secondChange?.({ target: { checked: true } });

    const text = elements
      .map((element) => element.props.children)
      .flat(Infinity)
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    expect(text).toContain('已锁定');
    expect(text).toContain('空段落');
    expect(text).toContain('…');

    const confirmButton = elements.find(
      (element) => element.props['data-confirm-draft-block-picker'] === true,
    );
    (confirmButton?.props.onClick as (() => void) | undefined)?.();
    expect(confirm).toHaveBeenCalledWith({ kind: 'multiple', ids: ['block-a'] });

    elements
      .filter((element) => element.type === 'button' && element.props.children === '取消')
      .forEach((button) => (button.props.onClick as () => void)());
    expect(cancel).toHaveBeenCalled();
  });

  it('覆盖章节开头、指定段落和段后位置三类锚点', () => {
    reactHarness.stateOverrides.push({
      kind: 'anchor',
      requestId: 2,
      title: '选择来源正文',
      description: '选择原文。',
      blocks,
      initialId: 'block-b',
      allowStart: true,
      labelMode: 'select',
    });
    const pickerApi = useDraftBlockPicker();
    if (!isElement(pickerApi.picker) || typeof pickerApi.picker.type !== 'function') {
      throw new Error('正文锚点选择器未生成');
    }

    const anchorRequest = pickerApi.picker.props.request;
    const confirm = vi.fn();
    reactHarness.stateOverrides.push(new Set<string>(), 'block-b');
    const dialog = pickerApi.picker.type({
      ...pickerApi.picker.props,
      request: anchorRequest,
      onCancel: vi.fn(),
      onConfirm: confirm,
    } as never);
    const elements = collectElements(dialog);
    const radios = elements.filter((element) => element.type === 'input');
    expect(radios).toHaveLength(4);
    (radios[0]?.props.onChange as (() => void) | undefined)?.();
    (radios[1]?.props.onChange as (() => void) | undefined)?.();

    const confirmButton = elements.find(
      (element) => element.props['data-confirm-draft-block-picker'] === true,
    );
    (confirmButton?.props.onClick as (() => void) | undefined)?.();
    expect(confirm).toHaveBeenCalledWith({ kind: 'anchor', id: 'block-b' });

    reactHarness.stateOverrides.push(new Set<string>(), null);
    const afterDialog = pickerApi.picker.type({
      ...pickerApi.picker.props,
      request: {
        ...(anchorRequest as Record<string, unknown>),
        allowStart: false,
        labelMode: 'after',
        initialId: null,
      },
      onCancel: vi.fn(),
      onConfirm: vi.fn(),
    } as never);
    const afterElements = collectElements(afterDialog);
    const afterText = afterElements
      .map((element) => element.props.children)
      .flat(Infinity)
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    expect(afterText).toContain('段之后');
    const disabledConfirm = afterElements.find(
      (element) => element.props['data-confirm-draft-block-picker'] === true,
    );
    expect(disabledConfirm?.props.disabled).toBe(true);
  });

  it('在没有正文时显示空状态，并允许解除全部多选关联', () => {
    reactHarness.stateOverrides.push({
      ...multipleRequest,
      requestId: 3,
      blocks: [],
      initialIds: [],
      allowEmpty: true,
      disableLocked: false,
    });
    const pickerApi = useDraftBlockPicker();
    if (!isElement(pickerApi.picker) || typeof pickerApi.picker.type !== 'function') {
      throw new Error('空正文选择器未生成');
    }

    const confirm = vi.fn();
    reactHarness.stateOverrides.push(new Set<string>(), null);
    const dialog = pickerApi.picker.type({
      ...pickerApi.picker.props,
      onCancel: vi.fn(),
      onConfirm: confirm,
    } as never);
    const elements = collectElements(dialog);
    const text = elements
      .map((element) => element.props.children)
      .flat(Infinity)
      .filter((value): value is string => typeof value === 'string')
      .join(' ');
    expect(text).toContain('当前没有可选择的正文段落。');

    const confirmButton = elements.find(
      (element) => element.props['data-confirm-draft-block-picker'] === true,
    );
    expect(confirmButton?.props.disabled).toBe(false);
    (confirmButton?.props.onClick as (() => void) | undefined)?.();
    expect(confirm).toHaveBeenCalledWith({ kind: 'multiple', ids: [] });
  });
});
