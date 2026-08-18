import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entity, EntityCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { EntityCanonPanel } from '../../apps/desktop/renderer/src/features/canon/entity-canon-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  queryLoad: null as null | (() => Promise<unknown>),
  resource: {
    state: 'success' as const,
    data: null as unknown,
    error: null as unknown,
    refresh: vi.fn(),
  },
  commandRun: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.queryLoad = load;
    return controls.resource;
  },
  useBridgeCommand: () => ({
    pending: false,
    error: null,
    run: controls.commandRun,
  }),
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
const entityId = '22222222-2222-4222-8222-222222222222';
const otherEntityId = '33333333-3333-4333-8333-333333333333';
const activeRenderers: TestRenderer[] = [];

class TestFormData {
  readonly #values: Readonly<Record<string, unknown>>;

  constructor(target: unknown) {
    this.#values = (target as { readonly values?: Readonly<Record<string, unknown>> }).values ?? {};
  }

  get(name: string): unknown {
    return this.#values[name] ?? null;
  }
}

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function nodeWithProp(root: TestInstance, name: string, value?: unknown): TestInstance {
  const node = root.findAll((candidate) => {
    if (!(name in candidate.props)) return false;
    return arguments.length < 3 || candidate.props[name] === value;
  })[0];
  if (!node) throw new Error(`Missing node with prop: ${name}`);
  return node;
}

function invoke(node: TestInstance, name: 'onClick' | 'onChange', argument?: unknown): void {
  const handler = node.props[name];
  if (typeof handler !== 'function') throw new Error(`Missing ${name} handler.`);
  (handler as (value?: unknown) => void)(argument);
}

async function submit(
  node: TestInstance,
  values: Readonly<Record<string, unknown>>,
): Promise<{
  readonly preventDefault: ReturnType<typeof vi.fn>;
  readonly reset: ReturnType<typeof vi.fn>;
}> {
  const handler = node.props.onSubmit;
  if (typeof handler !== 'function') throw new Error('Missing onSubmit handler.');
  const preventDefault = vi.fn();
  const reset = vi.fn();
  await act(async () => {
    (handler as (event: unknown) => void)({
      preventDefault,
      currentTarget: { values, reset },
    });
    await flushPromises();
  });
  return { preventDefault, reset };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function entity(overrides: Partial<Entity> = {}): Entity {
  return contractInput<Entity>({
    id: entityId,
    projectId,
    entityType: 'character',
    name: '沈砚',
    aliases: ['阿砚'],
    summary: '主角',
    status: 'active',
    archivedAt: null,
    createdAt: '2026-08-16T08:00:00.000Z',
    updatedAt: '2026-08-16T08:00:00.000Z',
    facts: [],
    ...overrides,
  });
}

function catalog(...entities: Entity[]): EntityCatalog {
  return contractInput<EntityCatalog>({
    projectId,
    entities: entities.length ? entities : [entity()],
  });
}

function createBridge(initialCatalog = catalog()) {
  const list = vi.fn().mockResolvedValue({ state: 'success', data: initialCatalog });
  const createEntity = vi.fn().mockResolvedValue({ state: 'success', data: initialCatalog });
  const update = vi.fn().mockResolvedValue({ state: 'success', data: initialCatalog });
  const archive = vi.fn().mockResolvedValue({ state: 'success', data: initialCatalog });
  const setFact = vi.fn().mockResolvedValue({ state: 'success', data: initialCatalog });
  const previewDelete = vi.fn().mockResolvedValue({
    state: 'success',
    data: {
      projectId,
      entityId,
      entityName: '沈砚',
      archived: true,
      sceneBeatReferenceCount: 0,
      canonFactCount: 0,
      canDelete: true,
      blockers: [],
    },
  });
  const deleteEntity = vi.fn().mockResolvedValue({
    state: 'success',
    data: { projectId, entityId, deleted: true },
  });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      canon: {
        list,
        create: createEntity,
        update,
        archive,
        setFact,
        previewDelete,
        delete: deleteEntity,
      },
    }),
    list,
    createEntity,
    update,
    archive,
    setFact,
    previewDelete,
    deleteEntity,
  };
}

async function renderPanel(options: {
  bridge: RendererBridgeAdapter;
  entities?: readonly Entity[];
  readOnly?: boolean;
  selectedEntityId?: string | null;
}): Promise<TestRenderer> {
  controls.resource.data = catalog(...(options.entities ?? [entity()]));
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(EntityCanonPanel, {
        bridge: options.bridge,
        projectId,
        readOnly: options.readOnly ?? false,
        selectedEntityId: options.selectedEntityId,
      }),
    );
    await flushPromises();
  });
  activeRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FormData', TestFormData);
  controls.queryLoad = null;
  controls.resource.state = 'success';
  controls.resource.data = null;
  controls.resource.error = null;
  controls.resource.refresh.mockReset();
  controls.resource.refresh.mockResolvedValue(undefined);
  controls.commandRun.mockReset();
  controls.commandRun.mockImplementation(async (operation: () => Promise<unknown>) => {
    const outcome = (await operation()) as { state?: string; data?: unknown };
    return outcome.state === 'success' ? outcome.data : null;
  });
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('EntityCanonPanel author behavior coverage', () => {
  it('loads archived entities and persists normalized update/create payloads', async () => {
    const harness = createBridge();
    const renderer = await renderPanel({ bridge: harness.bridge });

    const load = controls.queryLoad;
    if (!load) throw new Error('Missing entity canon query loader.');
    await load();
    expect(harness.list).toHaveBeenCalledWith(
      { projectId, includeArchived: true },
      { mode: 'replace' },
    );

    const form = nodeWithProp(renderer.root, 'data-canon-entity-form');
    await submit(form, {
      entityType: 'character',
      name: '沈砚',
      aliases: '阿砚\n 小沈 \n',
      summary: '新的摘要',
    });
    expect(harness.update).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId,
      patch: {
        entityType: 'character',
        name: '沈砚',
        aliases: ['阿砚', '小沈'],
        summary: '新的摘要',
      },
    });
    expect(textContent(renderer.root)).toContain('设定条目已写入作品数据库。');

    await act(async () => {
      invoke(nodeWithProp(renderer.root, 'data-new-entity'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('新建设定条目');

    const newForm = nodeWithProp(renderer.root, 'data-canon-entity-form');
    await submit(newForm, {
      entityType: 'location',
      name: '听雨楼',
      aliases: '旧楼\n雨楼',
      summary: '城南旧楼',
    });
    expect(harness.createEntity).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityType: 'location',
      name: '听雨楼',
      aliases: ['旧楼', '雨楼'],
      summary: '城南旧楼',
    });
  });

  it('rejects invalid fact input before persistence and writes a valid custom fact exactly once', async () => {
    const harness = createBridge();
    const renderer = await renderPanel({ bridge: harness.bridge });
    const factForm = nodeWithProp(renderer.root, 'data-canon-fact-form');

    await submit(factForm, {
      factKey: 'custom',
      customFactKey: '   ',
      valueType: 'text',
      value: '内容',
      description: '',
    });
    expect(harness.setFact).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('请填写自定义事实名称。');

    await submit(factForm, {
      factKey: 'appearance',
      valueType: 'number',
      value: '十八岁',
      description: '',
    });
    expect(harness.setFact).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('请输入有效数字。');

    await submit(factForm, {
      factKey: 'appearance',
      valueType: 'json',
      value: '{bad json}',
      description: '',
    });
    expect(harness.setFact).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('原始JSON格式不正确');

    const result = await submit(factForm, {
      factKey: 'custom',
      customFactKey: '是否知情',
      valueType: 'boolean',
      value: '是',
      description: '作者确认',
    });
    expect(harness.setFact).toHaveBeenCalledOnce();
    expect(harness.setFact).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId,
      factKey: '是否知情',
      value: true,
      description: '作者确认',
      sourceType: 'author',
      sourceId: null,
    });
    expect(result.reset).toHaveBeenCalledOnce();
    expect(textContent(renderer.root)).toContain('旧值保留为历史记录');
  });

  it('archives only after explicit confirmation', async () => {
    const harness = createBridge();
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal('window', { confirm, prompt: vi.fn() });
    const renderer = await renderPanel({ bridge: harness.bridge });
    const archive = nodeWithProp(renderer.root, 'data-archive-entity');

    await act(async () => {
      invoke(archive, 'onClick');
      await flushPromises();
    });
    expect(harness.archive).not.toHaveBeenCalled();

    await act(async () => {
      invoke(archive, 'onClick');
      await flushPromises();
    });
    expect(harness.archive).toHaveBeenCalledOnce();
    expect(harness.archive).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId,
    });
    expect(textContent(renderer.root)).toContain('永久删除仍需通过引用预览与名称确认');
  });

  it('permanently deletes only after archived state, clear reference preview and exact name confirmation', async () => {
    const activeHarness = createBridge();
    vi.stubGlobal('window', { confirm: vi.fn(), prompt: vi.fn() });
    const activeRenderer = await renderPanel({ bridge: activeHarness.bridge });
    const activeDelete = nodeWithProp(activeRenderer.root, 'data-delete-entity');
    expect(activeDelete.props.disabled).toBe(true);
    await act(async () => {
      invoke(activeDelete, 'onClick');
      await flushPromises();
    });
    expect(activeHarness.previewDelete).not.toHaveBeenCalled();

    const archived = entity({ status: 'archived', archivedAt: '2026-08-16T09:00:00.000Z' });
    const harness = createBridge(catalog(archived));
    const prompt = vi.fn().mockReturnValueOnce('沈砚 ').mockReturnValueOnce('沈砚');
    vi.stubGlobal('window', { confirm: vi.fn(), prompt });
    const renderer = await renderPanel({ bridge: harness.bridge, entities: [archived] });
    const remove = nodeWithProp(renderer.root, 'data-delete-entity');
    expect(remove.props.disabled).toBe(false);

    harness.previewDelete.mockResolvedValueOnce({
      state: 'success',
      data: {
        projectId,
        entityId,
        entityName: '沈砚',
        archived: true,
        sceneBeatReferenceCount: 2,
        canonFactCount: 0,
        canDelete: false,
        blockers: ['仍被两个场景引用'],
      },
    });
    await act(async () => {
      invoke(remove, 'onClick');
      await flushPromises();
    });
    expect(prompt).not.toHaveBeenCalled();
    expect(harness.deleteEntity).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('禁止删除：仍被两个场景引用');

    await act(async () => {
      invoke(remove, 'onClick');
      await flushPromises();
    });
    expect(prompt).toHaveBeenCalledOnce();
    expect(harness.deleteEntity).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('名称确认不匹配');

    await act(async () => {
      invoke(remove, 'onClick');
      await flushPromises();
    });
    expect(harness.previewDelete).toHaveBeenCalledTimes(3);
    expect(harness.deleteEntity).toHaveBeenCalledOnce();
    expect(harness.deleteEntity).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId,
      confirmName: '沈砚',
    });
    expect(textContent(renderer.root)).toContain('设定条目已永久删除。');
  });

  it('selects an explicitly requested entity while read-only mode exposes no enabled write control', async () => {
    const harness = createBridge();
    const other = entity({
      id: otherEntityId,
      name: '顾明川',
      entityType: 'faction',
      aliases: [],
      summary: '另一条设定',
    });
    const renderer = await renderPanel({
      bridge: harness.bridge,
      entities: [entity(), other],
      readOnly: true,
      selectedEntityId: otherEntityId,
    });

    expect(textContent(renderer.root)).toContain('编辑：顾明川');
    expect(nodeWithProp(renderer.root, 'data-new-entity').props.disabled).toBe(true);
    for (const control of renderer.root.findAll((node) => 'data-canon-write' in node.props)) {
      expect(control.props.disabled).toBe(true);
    }
    expect(nodeWithProp(renderer.root, 'data-archive-entity').props.disabled).toBe(true);
    expect(nodeWithProp(renderer.root, 'data-delete-entity').props.disabled).toBe(true);
    expect(harness.createEntity).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
    expect(harness.archive).not.toHaveBeenCalled();
    expect(harness.setFact).not.toHaveBeenCalled();
    expect(harness.previewDelete).not.toHaveBeenCalled();
    expect(harness.deleteEntity).not.toHaveBeenCalled();
  });
});
