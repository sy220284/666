import { createRequire } from 'node:module';

import type { ContinuityCatalog, NarrativePlanningCatalog } from '@worldforge/contracts';
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
const chapterA = '22222222-2222-4222-8222-222222222222';
const chapterB = '33333333-3333-4333-8333-333333333333';
const foreshadowA = '44444444-4444-4444-8444-444444444444';
const foreshadowB = '55555555-5555-4555-8555-555555555555';
const arcId = '66666666-6666-4666-8666-666666666666';
const milestoneA = '77777777-7777-4777-8777-777777777777';
const milestoneB = '88888888-8888-4888-8888-888888888888';
const timelineEvent = '99999999-9999-4999-8999-999999999999';

const references = {
  state: 'ready' as const,
  entities: [],
  chapters: [
    { id: chapterA, label: '第一卷 / 第一章', finalVersionId: null },
    { id: chapterB, label: '第一卷 / 第二章', finalVersionId: null },
  ],
  versions: [],
};

const narrative = contractInput<NarrativePlanningCatalog>({
  projectId,
  foreshadowings: [
    {
      id: foreshadowA,
      title: '暗号伏笔',
      status: 'open',
      chapterLinks: [
        { chapterId: chapterA, role: 'plant' },
        { chapterId: chapterB, role: 'reveal' },
      ],
      relations: [{ targetForeshadowingId: foreshadowB, kind: 'depends_on' }],
    },
    {
      id: foreshadowB,
      title: '密信伏笔',
      status: 'open',
      chapterLinks: [],
      relations: [],
    },
  ],
  characterArcs: [
    {
      id: arcId,
      title: '信任弧光',
      status: 'active',
      milestones: [
        {
          id: milestoneA,
          title: '第一次合作',
          dependencyMilestoneIds: [],
          dependencyTimelineEventIds: [],
        },
        {
          id: milestoneB,
          title: '最终选择',
          dependencyMilestoneIds: [milestoneA],
          dependencyTimelineEventIds: [timelineEvent],
        },
      ],
    },
  ],
});

const continuity = contractInput<ContinuityCatalog>({
  projectId,
  entityStates: [],
  relationships: [],
  knowledgeStates: [],
  timelineEvents: [{ id: timelineEvent, title: '夜渡清河', status: 'active' }],
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

let narrativeData: NarrativePlanningCatalog | null = narrative;
let continuityData: ContinuityCatalog | null = continuity;
let narrativeError: { code: string; message: string } | null = null;
let commandError: { code: string; message: string } | null = null;
let commandPending = false;
const refresh = vi.fn(async () => undefined);
const commandRun = vi.fn();

function textContent(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textContent).join('');
}

async function invoke(node: TestInstance, prop: 'onSubmit', argument: unknown): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value: unknown) => unknown)(argument);
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
    narrativePlanning: {
      list: vi.fn(async () => ({ state: 'success' as const, data: narrative })),
      saveForeshadowing: vi.fn(async () => ({ state: 'success' as const, data: narrative })),
      saveArcMilestone: vi.fn(async () => ({ state: 'success' as const, data: narrative })),
    },
    continuity: {
      list: vi.fn(async () => ({ state: 'success' as const, data: continuity })),
    },
  });
}

function installMocks(): void {
  vi.doMock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
    useBridgeQuery: (key: string, load: () => unknown) => {
      void load();
      return key.startsWith('narrative-relations:')
        ? { data: narrativeData, error: narrativeError, refresh }
        : { data: continuityData, error: null, refresh: vi.fn() };
    },
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
  const { NarrativeRelationshipEditor } =
    await import('../../apps/desktop/renderer/src/features/canon/narrative-relationship-editor.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(NarrativeRelationshipEditor, { bridge: api, projectId, readOnly }),
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
  narrativeData = narrative;
  continuityData = continuity;
  narrativeError = null;
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

describe('M11 完整伏笔与弧光关系编辑交互覆盖', () => {
  it('保存伏笔章节锚点与依赖/互斥关系，并去重选择', async () => {
    const api = bridge();
    const renderer = await mount(api);
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const reset = vi.fn();

    setForm(
      {
        title: '渡口暗号',
        description: '前两章反复出现，第三章回收',
        revealFromChapterId: '   ',
        revealByChapterId: chapterB,
      },
      {
        plantChapterIds: [chapterA, chapterA, '', chapterB],
        reinforceChapterIds: [chapterB, chapterB],
        revealChapterIds: [chapterB],
        dependencyForeshadowingIds: [foreshadowA, foreshadowA, ''],
        exclusiveForeshadowingIds: [foreshadowB],
      },
    );
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });

    expect(api.narrativePlanning.saveForeshadowing).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      foreshadowingId: null,
      title: '渡口暗号',
      description: '前两章反复出现，第三章回收',
      revealFromChapterId: null,
      revealByChapterId: chapterB,
      chapterLinks: [
        { chapterId: chapterA, role: 'plant' },
        { chapterId: chapterB, role: 'plant' },
        { chapterId: chapterB, role: 'reinforce' },
        { chapterId: chapterB, role: 'reveal' },
      ],
      relations: [
        { targetForeshadowingId: foreshadowA, kind: 'depends_on' },
        { targetForeshadowingId: foreshadowB, kind: 'mutually_exclusive' },
      ],
    });
    expect(reset).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('伏笔已保存：章节锚点 4、关系 2。');
    expect(textContent(renderer.root)).toContain('伏笔章节锚点 2');
    expect(textContent(renderer.root)).toContain('伏笔关系 1');
    expect(textContent(renderer.root)).toContain('弧光节点依赖 2');
    expect(textContent(renderer.root)).toContain('暗号伏笔');
    expect(textContent(renderer.root)).toContain('密信伏笔');
    await unmount(renderer);
  });

  it('保存弧光节点，按已有弧光计算排序并去重两类依赖', async () => {
    const api = bridge();
    const renderer = await mount(api);
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const reset = vi.fn();

    setForm(
      {
        arcId,
        title: '背叛后的选择',
        description: '完成信任弧光',
        plannedChapterId: '',
      },
      {
        dependencyMilestoneIds: [milestoneA, milestoneA, '', milestoneB],
        dependencyTimelineEventIds: [timelineEvent, timelineEvent, ''],
      },
    );
    await invoke(forms[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });

    expect(api.narrativePlanning.saveArcMilestone).toHaveBeenCalledWith({
      projectId,
      authority: 'author',
      milestoneId: null,
      arcId,
      title: '背叛后的选择',
      description: '完成信任弧光',
      sortIndex: 2,
      plannedChapterId: null,
      dependencyMilestoneIds: [milestoneA, milestoneB],
      dependencyTimelineEventIds: [timelineEvent],
    });
    expect(reset).toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('弧光节点已保存：节点依赖 2、时间线依赖 1。');
    expect(textContent(renderer.root)).toContain('信任弧光 / 第一次合作');
    expect(textContent(renderer.root)).toContain('夜渡清河');
    await unmount(renderer);
  });

  it('未知弧光使用零排序，失败提交不重置，并覆盖读取/写入错误与只读忙碌态', async () => {
    const api = bridge();
    commandRun.mockResolvedValueOnce(false);
    const renderer = await mount(api);
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const reset = vi.fn();
    setForm({
      arcId: 'missing-arc',
      title: '孤立节点',
      description: '',
      plannedChapterId: chapterA,
    });
    await invoke(forms[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(reset).not.toHaveBeenCalled();

    commandRun.mockImplementationOnce(async (operation: () => Promise<unknown>) => {
      await operation();
      return true;
    });
    await invoke(forms[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(api.narrativePlanning.saveArcMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({ arcId: 'missing-arc', sortIndex: 0, plannedChapterId: chapterA }),
    );
    await unmount(renderer);

    narrativeData = null;
    narrativeError = { code: 'COMMON_INTERNAL_999', message: '读取失败' };
    commandError = { code: 'COMMON_INTERNAL_999', message: '写入失败' };
    commandPending = true;
    continuityData = null;
    const errorRenderer = await mount(api, true);
    expect(textContent(errorRenderer.root)).toContain('叙事规划读取失败');
    const submitButtons = errorRenderer.root.findAll(
      (node) => node.type === 'button' && node.props.type === 'submit',
    );
    expect(submitButtons.every((node) => node.props.disabled === true)).toBe(true);
    expect(textContent(errorRenderer.root)).toContain('弧光节点依赖 0');
    await unmount(errorRenderer);

    narrativeError = null;
    const commandRenderer = await mount(api);
    expect(textContent(commandRenderer.root)).toContain('写入失败');
    expect(textContent(commandRenderer.root)).toContain('写入失败');
    await unmount(commandRenderer);
  });

  it('覆盖空表单值与空目录数据的兜底分支', async () => {
    const api = bridge();
    narrativeData = null;
    continuityData = null;
    const renderer = await mount(api);
    const forms = renderer.root.findAll((node) => node.type === 'form');
    const reset = vi.fn();

    setForm({});
    await invoke(forms[0]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(api.narrativePlanning.saveForeshadowing).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '',
        description: '',
        revealFromChapterId: null,
        revealByChapterId: null,
        chapterLinks: [],
        relations: [],
      }),
    );

    setForm({});
    await invoke(forms[1]!, 'onSubmit', { preventDefault: vi.fn(), currentTarget: { reset } });
    expect(api.narrativePlanning.saveArcMilestone).toHaveBeenCalledWith(
      expect.objectContaining({
        arcId: '',
        title: '',
        description: '',
        sortIndex: 0,
        plannedChapterId: null,
        dependencyMilestoneIds: [],
        dependencyTimelineEventIds: [],
      }),
    );
    expect(textContent(renderer.root)).toContain('伏笔章节锚点 0');
    expect(textContent(renderer.root)).toContain('伏笔关系 0');
    expect(textContent(renderer.root)).toContain('弧光节点依赖 0');
    await unmount(renderer);
  });
});
