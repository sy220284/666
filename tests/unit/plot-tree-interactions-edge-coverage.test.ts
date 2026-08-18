import { createRequire } from 'node:module';

import type { PlotNode } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  pending: false,
  result: {} as unknown,
  run: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeCommand: () => ({
    pending: controls.pending,
    error: null,
    run: controls.run,
    clearError: vi.fn(),
  }),
}));

import { PlotTree } from '../../apps/desktop/renderer/src/features/planning/outline/plot-tree.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
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
  update(element: ReactElement): void;
  unmount(): void;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const rootA = contractInput<PlotNode>({
  id: '22222222-2222-4222-8222-222222222222',
  projectId,
  parentId: null,
  title: '主线 A',
  nodeType: 'volume',
  status: 'active',
  orderKey: 1,
});
const rootB = contractInput<PlotNode>({
  id: '33333333-3333-4333-8333-333333333333',
  projectId,
  parentId: null,
  title: '主线 B',
  nodeType: 'arc',
  status: 'planned',
  orderKey: 2,
});
const child = contractInput<PlotNode>({
  id: '44444444-4444-4444-8444-444444444444',
  projectId,
  parentId: rootA.id,
  title: '子线索',
  nodeType: 'beat',
  status: 'planned',
  orderKey: 1,
});
const nodes = [rootA, rootB, child];

const movePlotNode = vi.fn(async () => ({ state: 'success', data: {} }));
const deletePlotNode = vi.fn(async () => ({ state: 'success', data: {} }));
const bridge = contractInput<RendererBridgeAdapter>({
  planning: { movePlotNode, deletePlotNode },
});
const onEdit = vi.fn();
const onCreateChild = vi.fn();
const onRefresh = vi.fn(async () => undefined);
const onStatus = vi.fn();
const active: TestRenderer[] = [];

function element(readOnly = false): ReactElement {
  return createElement(PlotTree, {
    bridge,
    nodes,
    projectId,
    readOnly,
    onEdit,
    onCreateChild,
    onRefresh,
    onStatus,
  });
}

async function render(readOnly = false): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element(readOnly));
    await Promise.resolve();
  });
  active.push(renderer);
  return renderer;
}

function article(renderer: TestRenderer, id: string): TestInstance {
  const node = renderer.root.findAll((candidate) => candidate.props['data-plot-node-id'] === id)[0];
  if (!node) throw new Error(`Missing plot node ${id}`);
  return node;
}

function buttonByLabel(root: TestInstance, label: string): TestInstance {
  const node = root.findAll((candidate) => candidate.props['aria-label'] === label)[0];
  if (!node) throw new Error(`Missing button ${label}`);
  return node;
}

function buttonByText(root: TestInstance, text: string): TestInstance {
  const node = root.findAll(
    (candidate) =>
      candidate.type === 'button' &&
      candidate.children.some((child) => typeof child === 'string' && child === text),
  )[0];
  if (!node) throw new Error(`Missing button ${text}`);
  return node;
}

async function invoke(node: TestInstance, prop: string, argument?: unknown): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}`);
  await act(async () => {
    handler(argument);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function dragEvent(id = '') {
  return contractInput({
    preventDefault: vi.fn(),
    dataTransfer: {
      setData: vi.fn(),
      getData: vi.fn(() => id),
    },
  });
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('window', { confirm: vi.fn(() => true) });
  vi.clearAllMocks();
  controls.pending = false;
  controls.result = { state: 'success' };
  controls.run.mockImplementation(async (operation: () => Promise<unknown>) => {
    await operation();
    return controls.result;
  });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('PlotTree interaction edge coverage', () => {
  it('forwards create/edit/drag-start and moves siblings before/after', async () => {
    const renderer = await render();
    const a = article(renderer, rootA.id);
    const b = article(renderer, rootB.id);

    await invoke(buttonByText(a, '+子节点'), 'onClick');
    await invoke(buttonByText(a, '编辑'), 'onClick');
    expect(onCreateChild).toHaveBeenCalledWith(rootA.id);
    expect(onEdit).toHaveBeenCalledWith(rootA);

    const drag = dragEvent();
    await invoke(a, 'onDragStart', drag);
    expect(drag.dataTransfer.setData).toHaveBeenCalledWith('text/worldforge-plot-node', rootA.id);

    await invoke(buttonByLabel(a, '下移主线 A'), 'onClick');
    expect(movePlotNode).toHaveBeenLastCalledWith({
      projectId,
      nodeId: rootA.id,
      targetParentId: null,
      placement: { kind: 'after', siblingId: rootB.id },
    });
    await invoke(buttonByLabel(b, '上移主线 B'), 'onClick');
    expect(movePlotNode).toHaveBeenLastCalledWith({
      projectId,
      nodeId: rootB.id,
      targetParentId: null,
      placement: { kind: 'before', siblingId: rootA.id },
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledTimes(2);
  });

  it('covers unavailable sibling guards and unsuccessful move result', async () => {
    const renderer = await render();
    const a = article(renderer, rootA.id);
    const b = article(renderer, rootB.id);

    await invoke(buttonByLabel(a, '上移主线 A'), 'onClick');
    await invoke(buttonByLabel(b, '下移主线 B'), 'onClick');
    expect(movePlotNode).not.toHaveBeenCalled();

    controls.result = null;
    await invoke(buttonByText(article(renderer, child.id), '移到根级'), 'onClick');
    expect(movePlotNode).toHaveBeenCalledWith({
      projectId,
      nodeId: child.id,
      targetParentId: null,
      placement: { kind: 'end' },
    });
    expect(onRefresh).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalled();
  });

  it('covers child/root drag targets including empty and self drops', async () => {
    const renderer = await render();
    const childDrop = article(renderer, rootA.id).findAll(
      (node) => 'data-outline-drop-child' in node.props,
    )[0]!;
    const rootDrop = renderer.root.findAll((node) => 'data-outline-root-drop' in node.props)[0]!;

    const over = dragEvent();
    await invoke(childDrop, 'onDragOver', over);
    expect(over.preventDefault).toHaveBeenCalledOnce();

    const self = dragEvent(rootA.id);
    await invoke(childDrop, 'onDrop', self);
    expect(self.preventDefault).toHaveBeenCalledOnce();
    expect(movePlotNode).not.toHaveBeenCalled();

    const empty = dragEvent('');
    await invoke(childDrop, 'onDrop', empty);
    expect(movePlotNode).not.toHaveBeenCalled();

    const valid = dragEvent(rootB.id);
    await invoke(childDrop, 'onDrop', valid);
    expect(movePlotNode).toHaveBeenLastCalledWith({
      projectId,
      nodeId: rootB.id,
      targetParentId: rootA.id,
      placement: { kind: 'end' },
    });

    const rootOver = dragEvent();
    await invoke(rootDrop, 'onDragOver', rootOver);
    expect(rootOver.preventDefault).toHaveBeenCalledOnce();
    await invoke(rootDrop, 'onDrop', dragEvent(''));
    const rootMove = dragEvent(child.id);
    await invoke(rootDrop, 'onDrop', rootMove);
    expect(movePlotNode).toHaveBeenLastCalledWith({
      projectId,
      nodeId: child.id,
      targetParentId: null,
      placement: { kind: 'end' },
    });
  });

  it('covers delete cancellation, success and unsuccessful command results', async () => {
    const renderer = await render();
    const remove = buttonByText(article(renderer, rootA.id), '删除');
    const confirm = contractInput<ReturnType<typeof vi.fn>>(window.confirm);

    confirm.mockReturnValueOnce(false);
    await invoke(remove, 'onClick');
    expect(deletePlotNode).not.toHaveBeenCalled();

    controls.result = { state: 'success' };
    confirm.mockReturnValueOnce(true);
    await invoke(remove, 'onClick');
    expect(deletePlotNode).toHaveBeenCalledWith({ projectId, nodeId: rootA.id });
    expect(onRefresh).toHaveBeenCalledOnce();

    controls.result = null;
    confirm.mockReturnValueOnce(true);
    await invoke(remove, 'onClick');
    expect(deletePlotNode).toHaveBeenCalledTimes(2);
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('covers read-only and command-pending lock presentation', async () => {
    const readOnly = await render(true);
    expect(article(readOnly, rootA.id).props.draggable).toBe(false);
    expect(buttonByText(article(readOnly, rootA.id), '删除').props.disabled).toBe(true);

    controls.pending = true;
    const pending = await render(false);
    expect(article(pending, rootA.id).props.draggable).toBe(false);
    expect(buttonByText(article(pending, rootA.id), '+子节点').props.disabled).toBe(true);
    expect(buttonByText(article(pending, rootA.id), '编辑').props.disabled).toBe(true);
  });
});
