import { createRequire } from 'node:module';

import type {
  EndingSnapshotReadResult,
  GenerationRun,
  ProjectStructure,
  StateProposalCatalog,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StateProposalPanel } from '../../apps/desktop/renderer/src/features/canon/state-proposal-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  queryLoad: null as null | (() => Promise<unknown>),
  resource: {
    state: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
    data: null as unknown,
    error: null as unknown,
    refresh: vi.fn(),
  },
  command: {
    pending: false,
    error: null as unknown,
    run: vi.fn(),
  },
  pollOptions: null as null | Record<string, unknown>,
  stopPolling: vi.fn(),
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: (_key: string, load: () => Promise<unknown>) => {
    controls.queryLoad = load;
    return controls.resource;
  },
  useBridgeCommand: () => controls.command,
}));
vi.mock('../../apps/desktop/renderer/src/runtime/single-flight-polling.js', () => ({
  startSingleFlightPolling: (options: Record<string, unknown>) => {
    controls.pollOptions = options;
    return controls.stopPolling;
  },
}));

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
const otherChapterId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const runId = '55555555-5555-4555-8555-555555555555';
const active: TestRenderer[] = [];

function structure(withFinal = true): ProjectStructure {
  return contractInput<ProjectStructure>({
    projectId,
    volumes: [
      {
        id: 'volume-1',
        title: '第一卷',
        chapters: [
          { id: chapterId, title: '定稿章', finalVersionId: withFinal ? versionId : null },
          { id: otherChapterId, title: '未定稿章', finalVersionId: null },
        ],
      },
    ],
  });
}

function emptyCatalog(): StateProposalCatalog {
  return contractInput<StateProposalCatalog>({
    projectId,
    batches: [],
    proposals: [],
    snapshots: [],
    invalidations: [],
  });
}

function reviewCatalog(): StateProposalCatalog {
  const batchId = '77777777-7777-4777-8777-777777777777';
  const entityId = '88888888-8888-4888-8888-888888888888';
  const createdAt = '2026-08-17T00:00:00.000Z';
  const base = {
    batchId,
    generationRunId: null,
    projectId,
    chapterId,
    sourceVersionId: versionId,
    source: 'provider_stub' as const,
    target: { targetType: 'entity_state' as const, entityId, stateKey: 'health' },
    previousValue: { value: '健康', semanticKind: 'health', validUntilChapterId: null },
    proposedValue: { value: '受伤', semanticKind: 'health', validUntilChapterId: null },
    evidence: [{ kind: 'logicalBlock' as const, targetId: 'block-1', note: '正文证据' }],
    confidence: 0.7,
    freshness: 'current' as const,
    actionability: 'accept' as const,
    resolvedValue: null,
    createdAt,
    resolvedAt: null,
  };
  return contractInput<StateProposalCatalog>({
    projectId,
    batches: [
      {
        batchId,
        projectId,
        chapterId,
        sourceVersionId: versionId,
        generationRunId: null,
        source: 'provider_stub',
        proposalCount: 2,
        status: 'mixed',
        createdAt,
      },
    ],
    proposals: [
      {
        ...base,
        id: '99999999-9999-4999-8999-999999999999',
        proposalType: 'entity_state',
        status: 'pending',
      },
      {
        ...base,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        proposalType: 'entity_state',
        status: 'accepted',
        resolvedValue: { value: '受伤', semanticKind: 'health', validUntilChapterId: null },
        resolvedAt: '2026-08-17T00:01:00.000Z',
      },
    ],
    snapshots: [],
    invalidations: [],
  });
}

function snapshot(saved: boolean): EndingSnapshotReadResult {
  return contractInput<EndingSnapshotReadResult>({
    projectId,
    chapterId,
    snapshotSource: saved ? 'snapshot' : 'fallback_live_query',
    snapshot: saved ? { status: 'confirmed' } : null,
    content: {
      entityStates: [{}],
      knowledgeStates: [{}],
      relationships: [],
      foreshadowings: [{}],
      arcMilestones: [{}],
    },
  });
}

function run(status: GenerationRun['status'], stage: GenerationRun['stage']): GenerationRun {
  return contractInput<GenerationRun>({ runId, projectId, status, stage });
}

function createBridge(
  options: {
    structureOutcome?: unknown;
    providerOutcome?: unknown;
    startOutcome?: unknown;
    listOutcome?: unknown;
    snapshotOutcome?: unknown;
  } = {},
) {
  const planningListStructure = vi
    .fn()
    .mockResolvedValue(options.structureOutcome ?? { state: 'success', data: structure() });
  const providersList = vi.fn().mockResolvedValue(
    options.providerOutcome ?? {
      state: 'success',
      data: {
        providers: [
          { id: 'provider-a', name: '连接 A' },
          { id: 'provider-b', name: '连接 B' },
        ],
      },
    },
  );
  const stateList = vi
    .fn()
    .mockResolvedValue(options.listOutcome ?? { state: 'success', data: emptyCatalog() });
  const readSnapshot = vi
    .fn()
    .mockResolvedValue(options.snapshotOutcome ?? { state: 'success', data: snapshot(true) });
  const generationStart = vi
    .fn()
    .mockResolvedValue(
      options.startOutcome ?? { state: 'success', data: { run: run('running', 'queued') } },
    );
  const generationGetRun = vi.fn().mockResolvedValue({
    state: 'success',
    data: run('running', 'streaming'),
  });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      planning: { listStructure: planningListStructure },
      providers: { list: providersList },
      stateProposal: {
        list: stateList,
        readSnapshot,
        resolve: vi.fn(async () => ({ state: 'success', data: emptyCatalog() })),
      },
      generation: { start: generationStart, getRun: generationGetRun },
    }),
    planningListStructure,
    providersList,
    stateList,
    readSnapshot,
    generationStart,
    generationGetRun,
  };
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function nodeWithProp(root: TestInstance, prop: string): TestInstance {
  const node = root.findAll((candidate) => prop in candidate.props)[0];
  if (!node) throw new Error(`Missing ${prop}`);
  return node;
}

function button(root: TestInstance, label: string): TestInstance {
  const node = root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate) === label,
  )[0];
  if (!node) throw new Error(`Missing button: ${label}`);
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

async function render(bridge: RendererBridgeAdapter, readOnly = false): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(StateProposalPanel, {
        bridge,
        projectId,
        projectName: '边界作品',
        readOnly,
      }),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  active.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  controls.queryLoad = null;
  controls.resource.state = 'success';
  controls.resource.data = { catalog: emptyCatalog(), snapshot: null };
  controls.resource.error = null;
  controls.resource.refresh.mockReset();
  controls.resource.refresh.mockResolvedValue(undefined);
  controls.command.pending = false;
  controls.command.error = null;
  controls.command.run.mockReset();
  controls.command.run.mockImplementation(async (operation: () => Promise<unknown>) => {
    const result = contractInput<{ state?: string; data?: unknown }>(await operation());
    return result.state === 'success' ? result.data : null;
  });
  controls.pollOptions = null;
  controls.stopPolling.mockReset();
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of active.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StateProposalPanel edge coverage', () => {
  it('covers query failures, no-chapter load, snapshot failure, filters and refresh reselection', async () => {
    const harness = createBridge();
    const renderer = await render(harness.bridge);
    const chapterSelect = nodeWithProp(renderer.root, 'data-state-proposal-chapter');
    const statusSelect = nodeWithProp(renderer.root, 'data-ai-review-status-filter');
    const typeSelect = nodeWithProp(renderer.root, 'data-ai-review-type-filter');

    await invoke(button(renderer.root, '刷新'), 'onClick');
    expect(chapterSelect.props.value).toBe(chapterId);
    await invoke(statusSelect, 'onChange', { target: { value: 'resolved' } });
    await invoke(typeSelect, 'onChange', { target: { value: 'entity_state' } });
    await invoke(chapterSelect, 'onChange', { target: { value: '' } });
    const noChapterLoad = controls.queryLoad;
    if (!noChapterLoad) throw new Error('Missing query load.');
    const withoutChapter = await noChapterLoad();
    expect(withoutChapter).toMatchObject({ state: 'success', data: { snapshot: null } });

    harness.stateList.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'DB_READ_FAILED_003', message: 'read failed', retryable: true },
    });
    await expect(noChapterLoad()).resolves.toMatchObject({ state: 'failure' });

    await invoke(chapterSelect, 'onChange', { target: { value: chapterId } });
    harness.readSnapshot.mockResolvedValueOnce({
      state: 'failure',
      error: { code: 'DB_READ_FAILED_003', message: 'snapshot failed', retryable: true },
    });
    const snapshotLoad = controls.queryLoad;
    if (!snapshotLoad) throw new Error('Missing chapter query load.');
    await expect(snapshotLoad()).resolves.toMatchObject({ state: 'failure' });

    harness.planningListStructure
      .mockResolvedValueOnce({ state: 'failure', error: { code: 'X' } })
      .mockResolvedValueOnce({ state: 'success', data: structure() })
      .mockResolvedValueOnce({ state: 'success', data: structure(false) });
    await invoke(button(renderer.root, '刷新'), 'onClick');
    await invoke(chapterSelect, 'onChange', { target: { value: otherChapterId } });
    await invoke(button(renderer.root, '刷新'), 'onClick');
    await invoke(button(renderer.root, '刷新'), 'onClick');
    expect(controls.resource.refresh).toHaveBeenCalledTimes(4);
  });

  it('covers initialization failures and ignores initialization after unmount', async () => {
    const failed = createBridge({
      structureOutcome: { state: 'failure', error: { code: 'X' } },
      providerOutcome: { state: 'failure', error: { code: 'Y' } },
    });
    const failedRenderer = await render(failed.bridge);
    expect(button(failedRenderer.root, '分析定稿').props.disabled).toBe(true);

    let resolveStructure!: (value: unknown) => void;
    let resolveProviders!: (value: unknown) => void;
    const pendingStructure = new Promise((resolve) => {
      resolveStructure = resolve;
    });
    const pendingProviders = new Promise((resolve) => {
      resolveProviders = resolve;
    });
    const deferred = createBridge();
    deferred.planningListStructure.mockReturnValueOnce(pendingStructure);
    deferred.providersList.mockReturnValueOnce(pendingProviders);
    const renderer = await render(deferred.bridge);
    await act(async () => renderer.unmount());
    active.splice(active.indexOf(renderer), 1);
    resolveStructure({ state: 'success', data: structure() });
    resolveProviders({ state: 'success', data: { providers: [{ id: 'late', name: 'Late' }] } });
    await act(async () => {
      await pendingStructure;
      await pendingProviders;
      await Promise.resolve();
    });

    const emptyInitialization = createBridge({
      structureOutcome: { state: 'success', data: structure(false) },
      providerOutcome: { state: 'success', data: { providers: [] } },
    });
    const emptyRenderer = await render(emptyInitialization.bridge);
    expect(nodeWithProp(emptyRenderer.root, 'data-state-proposal-chapter').props.value).toBe('');
    expect(button(emptyRenderer.root, '分析定稿').props.disabled).toBe(true);
  });

  it('covers extraction failure/cancellation, polling non-success/running stages and provider selection', async () => {
    const failure = createBridge({
      startOutcome: {
        state: 'failure',
        error: { code: 'COMMON_INTERNAL_999', message: '模型失败', retryable: true },
      },
    });
    const failureRenderer = await render(failure.bridge);
    await invoke(button(failureRenderer.root, '分析定稿'), 'onClick');
    expect(textContent(failureRenderer.root)).toContain('本地服务遇到异常');

    const cancelled = createBridge({ startOutcome: { state: 'cancelled' } });
    const cancelledRenderer = await render(cancelled.bridge);
    const providerSelect = cancelledRenderer.root.findAll(
      (node) =>
        node.type === 'select' &&
        !('data-state-proposal-chapter' in node.props) &&
        !('data-ai-review-status-filter' in node.props) &&
        !('data-ai-review-type-filter' in node.props),
    )[0];
    if (!providerSelect) throw new Error('Missing provider select.');
    await invoke(providerSelect, 'onChange', { target: { value: 'provider-b' } });
    await invoke(button(cancelledRenderer.root, '分析定稿'), 'onClick');
    expect(cancelled.generationStart).toHaveBeenLastCalledWith(
      expect.objectContaining({ providerId: 'provider-b' }),
    );
    expect(textContent(cancelledRenderer.root)).toContain('请求已取消。');

    const success = createBridge();
    const successRenderer = await render(success.bridge);
    await invoke(button(successRenderer.root, '分析定稿'), 'onClick');
    const polling = controls.pollOptions;
    if (!polling) throw new Error('Missing polling options.');
    const onResult = contractInput<(outcome: unknown) => boolean>(polling.onResult);
    expect(onResult({ state: 'failure' })).toBe(true);
    for (const stage of ['calling_model', 'streaming', 'validating', 'persisting', 'mystery']) {
      await act(async () => {
        expect(onResult({ state: 'success', data: run('running', contractInput(stage)) })).toBe(
          true,
        );
        await Promise.resolve();
      });
    }
    expect(textContent(successRenderer.root)).toContain('处理中');
  });

  it('covers resolved proposals, absent generation task ids, live snapshots and empty command results', async () => {
    const harness = createBridge();
    controls.resource.data = { catalog: reviewCatalog(), snapshot: snapshot(false) };
    controls.command.run.mockResolvedValueOnce(null);
    const renderer = await render(harness.bridge);

    expect(textContent(renderer.root)).toContain('测试分析');
    expect(textContent(renderer.root)).not.toContain('智能任务标识');
    expect(textContent(renderer.root)).toContain('当前已确认状态');
    expect(textContent(renderer.root)).toContain('即时读取');

    const accept = nodeWithProp(renderer.root, 'data-accept-state-proposal');
    await invoke(accept, 'onClick');
    expect(textContent(renderer.root)).not.toContain('作者决定已保存');

    const statusSelect = nodeWithProp(renderer.root, 'data-ai-review-status-filter');
    await invoke(statusSelect, 'onChange', { target: { value: 'all' } });
    expect(renderer.root.findAll((node) => 'data-state-proposal' in node.props)).toHaveLength(2);
  });

  it('covers summary/error/empty filters and saved snapshot rendering branches', async () => {
    const harness = createBridge();
    controls.resource.state = 'loading';
    controls.resource.data = null;
    controls.resource.error = {
      code: 'COMMON_INTERNAL_999',
      message: '读取失败',
      retryable: true,
    };
    let renderer = await render(harness.bridge);
    expect(textContent(renderer.root)).toContain('审阅汇总读取中');
    expect(textContent(renderer.root)).toContain('读取失败');

    controls.command.error = {
      code: 'COMMON_INTERNAL_999',
      message: '处理失败',
      retryable: true,
    };
    await act(async () => renderer.unmount());
    active.splice(active.indexOf(renderer), 1);
    renderer = await render(harness.bridge);
    expect(textContent(renderer.root)).toContain('处理失败');

    controls.command.error = null;
    controls.resource.state = 'success';
    controls.resource.error = null;
    controls.resource.data = { catalog: emptyCatalog(), snapshot: snapshot(true) };
    await act(async () => renderer.unmount());
    active.splice(active.indexOf(renderer), 1);
    renderer = await render(harness.bridge);
    expect(textContent(renderer.root)).toContain('当前没有智能审阅建议。');
    expect(textContent(renderer.root)).toContain('已保存的章节状态');
    expect(textContent(renderer.root)).toContain('状态未知');
    expect(textContent(renderer.root)).toContain('人物与世界状态 1');
  });
});
