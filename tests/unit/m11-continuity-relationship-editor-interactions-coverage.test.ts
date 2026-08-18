import { createRequire } from 'node:module';

import type { ContinuityCatalog } from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type * as CanonAuthorFields from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

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
  unmount(): void;
}

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const characterId = '44444444-4444-4444-8444-444444444444';
const secondCharacterId = '55555555-5555-4555-8555-555555555555';
const locationId = '66666666-6666-4666-8666-666666666666';
const eventId = '77777777-7777-4777-8777-777777777777';
const dependencyId = '88888888-8888-4888-8888-888888888888';

const references = {
  state: 'ready' as const,
  entities: [
    { id: characterId, entityType: 'character', name: '赵二' },
    { id: secondCharacterId, entityType: 'character', name: '少东家' },
    { id: locationId, entityType: 'location', name: '清河' },
  ],
  chapters: [{ id: chapterId, label: '第一卷 / 第一章', finalVersionId: versionId }],
  versions: [{ id: versionId, chapterId, label: '第一卷 / 第一章 · 定稿' }],
};

const catalog = contractInput<ContinuityCatalog>({
  projectId,
  entityStates: [
    {
      id: '99999999-9999-4999-8999-999999999999',
      evidence: [
        { kind: 'version', targetId: versionId, note: '第一处' },
        { kind: 'version', targetId: versionId, note: '第二处' },
      ],
    },
  ],
  relationships: [],
  timelineEvents: [
    {
      id: eventId,
      title: '夜渡清河',
      status: 'active',
      startValue: '三更',
      endValue: null,
      precision: 'approximate',
      chapterId,
      locationId,
      description: '避开追兵',
      participantIds: [characterId],
      witnessIds: [secondCharacterId],
      subjectIds: [characterId],
      dependencyIds: [dependencyId],
    },
    {
      id: dependencyId,
      title: '取得暗号',
      status: 'active',
      startValue: '二更',
      endValue: null,
      precision: 'exact',
      chapterId,
      locationId: null,
      description: '',
      participantIds: [],
      witnessIds: [],
      subjectIds: [],
      dependencyIds: [],
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: '旧事件',
      status: 'archived',
      participantIds: [],
      witnessIds: [],
      subjectIds: [],
      dependencyIds: [],
    },
  ],
  knowledgeStates: [],
});

class StubFormData {
  static values: Record<string, unknown> = {};
  static lists: Record<string, unknown[]> = {};

  constructor(_form?: unknown) {}

  get(name: string): unknown {
    return Object.hasOwn(StubFormData.values, name) ? StubFormData.values[name] : null;
  }

  getAll(name: string): unknown[] {
    return StubFormData.lists[name] ?? [];
  }
}

let resourceData: ContinuityCatalog | null = catalog;
let resourceError: { code: string; message: string } | null = null;
let commandError: { code: string; message: string } | null = null;
let commandPending = false;
const refresh = vi.fn(async () => undefined);
const commandRun = vi.fn();

function textContent(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textContent).join('');
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const result = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!result) throw new Error(`Missing ${type} control.`);
  return result;
}

async function invoke(
  node: TestInstance,
  prop: 'onChange' | 'onSubmit',
  argument?: unknown,
): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function setForm(values: Record<string, unknown>, lists: Record<string, unknown[]> = {}): void {
  StubFormData.values = values;
  StubFormData.lists = lists;
}

function bridge() {
  return contractInput<RendererBridgeAdapter>({
    continuity: {
      list: vi.fn(),
      setEntityState: vi.fn(async () => ({ state: 'success' as const, data: {} })),
      saveTimelineEvent: vi.fn(async () => ({ state: 'success' as const, data: {} })),
    },
  });
}

function installMocks(): void {
  vi.doMock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
    useBridgeQuery: () => ({ data: resourceData, error: resourceError, refresh }),
    useBridgeCommand: () => ({ run: commandRun, error: commandError, pending: commandPending }),
  }));
  vi.doMock(
    '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js',
    async (importOriginal) => {
      const actual = await importOriginal<typeof CanonAuthorFields>();
      return { ...actual, useCanonAuthorReferences: () => references };
    },
  );
}

async function mount(api: RendererBridgeAdapter, readOnly = false): Promise<TestRenderer> {
  installMocks();
  const { ContinuityRelationshipEditor } =
    await import('../../apps/desktop/renderer/src/features/canon/continuity-relationship-editor.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(ContinuityRelationshipEditor, { bridge: api, projectId, readOnly }),
    );
    await Promise.resolve();
  });
  return renderer;
}

async function unmount(renderer: TestRenderer): Promise<void> {
  await act(async () => renderer.unmount());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('FormData', StubFormData);
  vi.resetModules();
  resourceData = catalog;
  resourceError = null;
  commandError = null;
  commandPending = false;
  refresh.mockClear();
  commandRun.mockReset();
  commandRun.mockImplementation(async (operation: () => Promise<unknown>) => {
    await operation();
    return true;
  });
  StubFormData.values = {};
  StubFormData.lists = {};
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M11 完整连续性关系编辑交互覆盖', () => {
  it('保存动态状态并覆盖字段缺失、清单解析与可空章节', async () => {
    const api = bridge();
    const renderer = await mount(api);
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const reset = vi.fn();

    setForm({ stateKey: '' });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(textContent(renderer.root)).toContain('请选择要记录的动态状态。');
    expect(api.continuity.setEntityState).not.toHaveBeenCalled();

    setForm({
      stateKey: 'possession',
      value: '佩剑\n密信、令牌',
      entityId: characterId,
      validFromChapterId: chapterId,
      validUntilChapterId: '   ',
      sourceVersionId: versionId,
      evidenceNote: '本章结尾明确获得',
    });
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(api.continuity.setEntityState).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      entityId: characterId,
      stateKey: 'possession',
      value: ['佩剑', '密信', '令牌'],
      validFromChapterId: chapterId,
      validUntilChapterId: null,
      sourceVersionId: versionId,
      evidence: [{ kind: 'version', targetId: versionId, note: '本章结尾明确获得' }],
    });
    expect(reset).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('动态状态已保存');
    expect(textContent(renderer.root)).toContain('状态证据 2');
    expect(textContent(renderer.root)).toContain('时间线人物关系 3');
    expect(textContent(renderer.root)).toContain('事件依赖 1');
    await unmount(renderer);
  });

  it('创建并编辑时间线事件，去重角色并排除自身依赖', async () => {
    const api = bridge();
    const renderer = await mount(api);
    const forms = () => renderer.root.findAll((node) => node.type === 'form');

    setForm(
      {
        title: '新事件',
        startValue: '四更',
        endValue: '',
        precision: 'day',
        chapterId,
        locationId: '',
        description: '追兵抵达',
      },
      {
        participantIds: [characterId, characterId, '', secondCharacterId],
        witnessIds: [secondCharacterId, secondCharacterId],
        subjectIds: ['', characterId],
        dependencyIds: [dependencyId, dependencyId, ''],
      },
    );
    await invoke(forms()[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.saveTimelineEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: null,
        participantIds: [characterId, secondCharacterId],
        witnessIds: [secondCharacterId],
        subjectIds: [characterId],
        dependencyIds: [dependencyId],
        endValue: null,
        locationId: null,
      }),
    );
    expect(textContent(renderer.root)).toContain(
      '时间线事件已创建：参与者 2、见证者 1、主体 1、依赖 1。',
    );

    const selector = control(renderer.root, 'select', (node) =>
      Boolean(node.props['data-timeline-event-editor-selector']),
    );
    const selectorText = textContent(selector);
    expect(selectorText).toContain('夜渡清河');
    expect(selectorText).toContain('取得暗号');
    expect(selectorText).not.toContain('旧事件');
    await invoke(selector, 'onChange', { currentTarget: { value: eventId } });
    expect(textContent(renderer.root)).toContain('更新完整时间线事件');

    const dependencySelect = control(
      renderer.root,
      'select',
      (node) => node.props.name === 'dependencyIds',
    );
    expect(textContent(dependencySelect)).toContain('取得暗号');
    expect(textContent(dependencySelect)).not.toContain('夜渡清河');

    setForm(
      {
        title: '夜渡清河（修订）',
        startValue: '三更',
        endValue: '五更',
        precision: 'approximate',
        chapterId,
        locationId,
        description: '更新说明',
      },
      {
        participantIds: [characterId],
        witnessIds: [],
        subjectIds: [secondCharacterId],
        dependencyIds: [dependencyId],
      },
    );
    await invoke(forms()[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: {} });
    expect(api.continuity.saveTimelineEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId, title: '夜渡清河（修订）', endValue: '五更' }),
    );
    expect(textContent(renderer.root)).toContain('时间线事件已更新');

    await invoke(selector, 'onChange', { currentTarget: { value: '' } });
    expect(textContent(renderer.root)).toContain('保存完整时间线事件');
    await unmount(renderer);
  });

  it('呈现读取/写入失败、只读和命令忙碌状态，并保持失败提交不重置', async () => {
    resourceError = { code: 'COMMON_INTERNAL_999', message: '读取坏了' };
    commandError = { code: 'COMMON_INTERNAL_999', message: '写入坏了' };
    commandPending = true;
    const api = bridge();
    const renderer = await mount(api, true);
    expect(textContent(renderer.root)).toContain('连续性读取失败');
    const submitButtons = renderer.root.findAll(
      (node) => node.type === 'button' && node.props.type === 'submit',
    );
    expect(submitButtons.every((node) => node.props.disabled === true)).toBe(true);
    await unmount(renderer);

    resourceError = null;
    commandPending = false;
    commandRun.mockResolvedValueOnce(false);
    const second = await mount(api);
    const reset = vi.fn();
    setForm({
      stateKey: 'health',
      value: '轻伤',
      entityId: characterId,
      validFromChapterId: chapterId,
      validUntilChapterId: chapterId,
      sourceVersionId: versionId,
      evidenceNote: '',
    });
    await invoke(second.root.findAll((node) => node.type === 'form')[0]!, 'onSubmit', {
      preventDefault: vi.fn(),
      currentTarget: { reset },
    });
    expect(reset).not.toHaveBeenCalled();
    expect(textContent(second.root)).toContain('写入失败');
    expect(textContent(second.root)).toContain('写入坏了');
    await unmount(second);
  });
});
