import { createRequire } from 'node:module';

import type {
  GenerationRun,
  IdeaCard,
  IdeaConversionTarget,
  ProjectStructure,
  ProviderSummary,
} from '@worldforge/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
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

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const runId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const targetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const entityId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const now = '2026-08-17T00:00:00.000Z';

function idea(
  id: string,
  ideaKind: IdeaCard['ideaKind'],
  status: IdeaCard['status'] = 'active',
): IdeaCard {
  return contractInput<IdeaCard>({
    id,
    projectId,
    ideaKind,
    title: `${ideaKind} 灵感`,
    summary: `${ideaKind} 摘要`,
    content: `${ideaKind} 正文内容`,
    divergenceLevel: 'different',
    depthLevel: 'expand',
    sourceContext: {
      scopeType: ideaKind === 'foreshadowing' ? 'chapter' : 'project',
      scopeId: ideaKind === 'foreshadowing' ? chapterId : projectId,
      chapterId: ideaKind === 'foreshadowing' ? chapterId : null,
    },
    generationRunId: null,
    status,
    createdAt: now,
    updatedAt: now,
  });
}

const ideas = [
  idea('10000000-0000-4000-8000-000000000001', 'new_book'),
  idea('10000000-0000-4000-8000-000000000002', 'character', 'favorite'),
  idea('10000000-0000-4000-8000-000000000003', 'foreshadowing'),
  idea('10000000-0000-4000-8000-000000000004', 'plot'),
  idea('10000000-0000-4000-8000-000000000005', 'twist'),
  idea('10000000-0000-4000-8000-000000000006', 'ending'),
] as const;

const providers = contractInput<readonly ProviderSummary[]>([
  { id: 'provider-a', name: '本地连接', model: 'model-a' },
]);
const structure = contractInput<ProjectStructure>({
  projectId,
  volumes: [
    {
      id: '20000000-0000-4000-8000-000000000001',
      title: '第一卷',
      chapters: [{ id: chapterId, title: '第一章' }],
    },
  ],
});

const operationQueues = new Map<string, unknown[]>();
const ideaClient = {
  run: vi.fn(),
  cancel: vi.fn(),
};

function queueOperation(operation: string, ...outcomes: unknown[]): void {
  operationQueues.set(operation, [...outcomes]);
}

function success<T>(data: T) {
  return { state: 'success' as const, data };
}

function failure(message: string) {
  return {
    state: 'failure' as const,
    error: { code: 'COMMON_INTERNAL_999' as const, message, retryable: false },
  };
}

function conversionTarget(type: 'canon_fact' | 'timeline_event'): IdeaConversionTarget {
  if (type === 'canon_fact') {
    return {
      targetType: 'canon_fact',
      draft: {
        entityId,
        factKey: 'secret',
        value: '暗号',
        description: '作者确认事实',
      },
    };
  }
  return {
    targetType: 'timeline_event',
    draft: {
      title: '夜渡清河',
      startValue: '三更',
      endValue: null,
      precision: 'approximate',
      chapterId,
      locationId: null,
      description: '',
      participantIds: [],
      witnessIds: [],
      subjectIds: [],
      dependencyIds: [],
    },
  };
}

function previewFor(ideaValue: IdeaCard, target: IdeaConversionTarget) {
  return {
    projectId,
    ideaId: ideaValue.id,
    ideaUpdatedAt: now,
    target,
    previewHash: 'a'.repeat(64),
    summary: '转换预览',
  };
}

function conversionFor(ideaValue: IdeaCard, targetType: string) {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    projectId,
    ideaId: ideaValue.id,
    targetType,
    targetId,
    previewHash: 'a'.repeat(64),
    status: 'applied' as const,
    createdAt: now,
  };
}

function defaultOperation(request: unknown): unknown {
  const operation = request as { operation: string; input: Record<string, unknown> };
  const queued = operationQueues.get(operation.operation);
  if (queued?.length) return queued.shift();
  if (operation.operation === 'idea.list') {
    const cursor = operation.input.cursor;
    return success({
      projectId,
      ideas: cursor ? [idea('10000000-0000-4000-8000-000000000007', 'relationship')] : ideas,
      nextCursor: cursor ? null : { updatedAt: now, id: ideas.at(-1)!.id },
    });
  }
  const ideaId = String(operation.input.ideaId ?? ideas[0].id);
  const selected = ideas.find((item) => item.id === ideaId) ?? ideas[0];
  if (operation.operation === 'idea.setStatus') return success(selected);
  if (operation.operation === 'idea.get') {
    return success({ idea: selected, conversion: null });
  }
  if (operation.operation === 'idea.previewConversion') {
    return success(previewFor(selected, operation.input.target as IdeaConversionTarget));
  }
  if (operation.operation === 'idea.applyConversion') {
    const target = operation.input.target as IdeaConversionTarget;
    return success({
      idea: { ...selected, status: 'converted' },
      conversion: conversionFor(selected, target.targetType),
    });
  }
  return { state: 'stale' as const };
}

function run(status: GenerationRun['status'], stage = 'completed'): GenerationRun {
  return contractInput<GenerationRun>({
    runId,
    projectId,
    status,
    stage,
  });
}

const generationStart = vi.fn();
const generationGetRun = vi.fn();

function bridge(
  providerOutcome: unknown = success({ providers }),
  structureOutcome: unknown = success(structure),
) {
  return contractInput<RendererBridgeAdapter>({
    providers: { list: vi.fn(async () => providerOutcome) },
    planning: { listStructure: vi.fn(async () => structureOutcome) },
    generation: {
      start: generationStart,
      getRun: generationGetRun,
    },
  });
}

function textContent(node: TestInstance | string): string {
  if (typeof node === 'string') return node;
  return node.children.map(textContent).join('');
}

function buttons(root: TestInstance, label: string): TestInstance[] {
  return root.findAll((node) => node.type === 'button' && textContent(node) === label);
}

function button(root: TestInstance, label: string, index = 0): TestInstance {
  const result = buttons(root, label)[index];
  if (!result) throw new Error(`Missing button ${label}#${index}.`);
  return result;
}

function control(root: TestInstance, type: string, predicate: (node: TestInstance) => boolean) {
  const result = root.findAll((node) => node.type === type && predicate(node))[0];
  if (!result) throw new Error(`Missing ${type} control.`);
  return result;
}

function ideaCard(root: TestInstance, id: string): TestInstance {
  return control(root, 'article', (node) => node.props['data-idea-card'] === id);
}

async function invoke(
  node: TestInstance,
  prop: 'onClick' | 'onChange',
  argument?: unknown,
): Promise<void> {
  const handler = node.props[prop];
  if (typeof handler !== 'function') throw new Error(`Missing ${prop}.`);
  await act(async () => {
    (handler as (value?: unknown) => unknown)(argument);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

const timers: Array<() => void> = [];
async function runNextTimer(): Promise<void> {
  const callback = timers.shift();
  expect(callback).toBeTypeOf('function');
  await act(async () => {
    callback?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mount(api: RendererBridgeAdapter, readOnly = false, onNavigate = vi.fn()) {
  vi.doMock('../../apps/desktop/renderer/src/bridge/idea-capsule-client.js', () => ({
    runIdeaCapsuleOperation: ideaClient.run,
    cancelIdeaCapsuleRequests: ideaClient.cancel,
  }));
  const { IdeaCapsulePanel } =
    await import('../../apps/desktop/renderer/src/features/planning/idea-capsule-panel.js');
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(IdeaCapsulePanel, { bridge: api, projectId, readOnly, onNavigate }),
    );
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  return { renderer, onNavigate };
}

async function unmount(renderer: TestRenderer): Promise<void> {
  await act(async () => renderer.unmount());
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetModules();
  timers.length = 0;
  operationQueues.clear();
  ideaClient.run.mockReset();
  ideaClient.cancel.mockReset();
  ideaClient.run.mockImplementation(async (request: unknown) => defaultOperation(request));
  generationStart.mockReset();
  generationStart.mockResolvedValue(success({ run: run('running', 'calling_model') }));
  generationGetRun.mockReset();
  vi.stubGlobal('window', {
    setTimeout: vi.fn((callback: () => void) => {
      timers.push(callback);
      return timers.length;
    }),
    clearTimeout: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M11-05 灵感胶囊真实交互覆盖', () => {
  it('覆盖分页、筛选、空范围/空指令以及探索启动失败', async () => {
    const { renderer } = await mount(bridge());
    expect(renderer.root.findAll((node) => node.props['data-idea-card'])).toHaveLength(
      ideas.length,
    );

    await invoke(button(renderer.root, '加载更多'), 'onClick');
    expect(renderer.root.findAll((node) => node.props['data-idea-card'])).toHaveLength(
      ideas.length + 1,
    );

    const filter = control(
      renderer.root,
      'select',
      (node) => node.props['aria-label'] === '灵感筛选',
    );
    await invoke(filter, 'onChange', { target: { value: 'favorite' } });
    expect(ideaClient.run).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'idea.list',
        input: expect.objectContaining({ status: 'favorite' }),
      }),
      { mode: 'share' },
    );

    await invoke(button(renderer.root, '开始探索'), 'onClick');
    expect(textContent(renderer.root)).toContain('请先写下想探索的方向。');

    const scope = renderer.root.findAll((node) => node.type === 'select')[4]!;
    await invoke(scope, 'onChange', { target: { value: 'chapter' } });
    const chapterSelect = renderer.root.findAll((node) => node.type === 'select')[5]!;
    await invoke(chapterSelect, 'onChange', { target: { value: '' } });
    const textarea = control(renderer.root, 'textarea', () => true);
    await invoke(textarea, 'onChange', { target: { value: '继续探索' } });
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    expect(textContent(renderer.root)).toContain('请先选择一个章节范围。');

    await invoke(scope, 'onChange', { target: { value: 'project' } });
    generationStart.mockResolvedValueOnce(failure('启动失败'));
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    expect(textContent(renderer.root)).toContain('灵感探索未启动');
    await unmount(renderer);
  });

  it('覆盖探索轮询的读取失败、替代、运行中、成功、取消与失败终态', async () => {
    const { renderer } = await mount(bridge());
    const textarea = control(renderer.root, 'textarea', () => true);
    await invoke(textarea, 'onChange', { target: { value: '追踪这条线索' } });

    generationGetRun.mockResolvedValueOnce(failure('状态读取失败'));
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    await runNextTimer();
    expect(textContent(renderer.root)).toContain('探索状态读取失败');

    generationGetRun.mockResolvedValueOnce({ state: 'stale' });
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    await runNextTimer();

    generationGetRun
      .mockResolvedValueOnce(success(run('running', 'receiving_output')))
      .mockResolvedValueOnce(success(run('succeeded')));
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    await runNextTimer();
    expect(textContent(renderer.root)).toContain('探索进行中 · receiving_output');
    await runNextTimer();
    expect(textContent(renderer.root)).toContain('灵感探索完成，已收入灵感胶囊。');

    generationGetRun.mockResolvedValueOnce(success(run('cancelled')));
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    await runNextTimer();
    expect(textContent(renderer.root)).toContain('本次灵感探索已取消。');

    generationGetRun.mockResolvedValueOnce(success(run('failed')));
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    await runNextTimer();
    expect(textContent(renderer.root)).toContain('本次灵感探索失败，可调整方向后重试。');
    await unmount(renderer);
  });

  it('覆盖收藏/丢弃、详情和预览的失败、替代、格式异常与成功分支', async () => {
    const { renderer } = await mount(bridge());
    const first = ideaCard(renderer.root, ideas[0].id);

    queueOperation('idea.setStatus', failure('状态失败'));
    await invoke(button(first, '收藏'), 'onClick');
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    await invoke(button(first, '收藏'), 'onClick');
    expect(textContent(renderer.root)).toContain('已收藏。');

    const favorite = ideaCard(renderer.root, ideas[1].id);
    await invoke(button(favorite, '取消收藏'), 'onClick');
    expect(textContent(renderer.root)).toContain('已取消收藏。');
    await invoke(button(first, '丢弃'), 'onClick');
    expect(textContent(renderer.root)).toContain('灵感已丢弃。');

    queueOperation(
      'idea.get',
      failure('详情失败'),
      { state: 'stale' },
      success({ malformed: true }),
      success({ idea: ideas[0], conversion: null }),
      success({
        idea: ideas[0],
        conversion: { ...conversionFor(ideas[0], 'project_brief'), status: 'target_missing' },
      }),
    );
    for (const expected of [
      '本地服务遇到异常',
      '详情请求已被新请求替代。',
      '灵感详情格式异常。',
      '尚未转换',
      '作品核心 · 目标已删除',
    ]) {
      await invoke(button(first, '详情'), 'onClick');
      expect(textContent(renderer.root)).toContain(expected);
    }

    queueOperation(
      'idea.previewConversion',
      failure('预览失败'),
      { state: 'stale' },
      success({ malformed: true }),
    );
    await invoke(button(first, '转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    await invoke(button(first, '转换'), 'onClick');
    await invoke(button(first, '转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('转换预览格式异常，已阻止写入。');
    await invoke(button(first, '转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('转换预览已生成');
    await unmount(renderer);
  });

  it('覆盖全部转换摘要、跳转类型、结果异常和无安全跳转分支', async () => {
    const { renderer, onNavigate } = await mount(bridge(), false, vi.fn());

    const convertible = [ideas[0], ideas[1], ideas[2], ideas[3]] as const;
    const expectedNavigationTypes = ['project-brief', 'entity', 'foreshadowing', 'plot-node'];
    for (let index = 0; index < convertible.length; index += 1) {
      const current = convertible[index]!;
      await invoke(button(ideaCard(renderer.root, current.id), '转换'), 'onClick');
      await invoke(button(renderer.root, '确认转换'), 'onClick');
      expect(onNavigate).toHaveBeenLastCalledWith(
        expect.objectContaining({ type: expectedNavigationTypes[index] }),
      );
    }

    const first = ideas[0];
    queueOperation(
      'idea.previewConversion',
      success(previewFor(first, conversionTarget('canon_fact'))),
    );
    await invoke(button(ideaCard(renderer.root, first.id), '转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('将写入设定事实“secret”');
    await invoke(button(renderer.root, '取消'), 'onClick');

    queueOperation(
      'idea.previewConversion',
      success(previewFor(first, conversionTarget('timeline_event'))),
    );
    await invoke(button(ideaCard(renderer.root, first.id), '转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('将创建时间线事件“夜渡清河”');

    queueOperation(
      'idea.applyConversion',
      failure('转换失败'),
      { state: 'stale' },
      success({ malformed: true }),
      success({
        idea: { ...first, status: 'converted' },
        conversion: conversionFor(first, 'entity'),
      }),
      success({
        idea: { ...first, status: 'converted' },
        conversion: conversionFor(first, 'timeline_event'),
      }),
    );
    await invoke(button(renderer.root, '确认转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('本地服务遇到异常');
    await invoke(button(renderer.root, '确认转换'), 'onClick');
    await invoke(button(renderer.root, '确认转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('转换结果格式异常');
    await invoke(button(renderer.root, '确认转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('没有可用的安全跳转入口');

    queueOperation(
      'idea.previewConversion',
      success(previewFor(first, conversionTarget('timeline_event'))),
    );
    await invoke(button(ideaCard(renderer.root, first.id), '转换'), 'onClick');
    await invoke(button(renderer.root, '确认转换'), 'onClick');
    expect(textContent(renderer.root)).toContain('没有可用的安全跳转入口');
    await unmount(renderer);
  });

  it('覆盖初始化失败、只读早退和卸载取消请求', async () => {
    const failedProviders = failure('连接失败');
    const failedStructure = failure('章节失败');
    const { renderer } = await mount(bridge(failedProviders, failedStructure), true);
    expect(textContent(renderer.root)).toContain('章节范围读取失败');
    const startCalls = generationStart.mock.calls.length;
    await invoke(button(renderer.root, '开始探索'), 'onClick');
    expect(generationStart).toHaveBeenCalledTimes(startCalls);
    await unmount(renderer);
    expect(ideaClient.cancel).toHaveBeenCalled();
  });
});
