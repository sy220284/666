import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  EndingSnapshotReadResult,
  GenerationRun,
  ProjectStructure,
  StateProposal,
  StateProposalCatalog,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StateProposalPanel } from '../../apps/desktop/renderer/src/features/canon/state-proposal-panel.js';
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
  pollOptions: null as null | Record<string, unknown>,
  stopPolling: vi.fn(),
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
const chapterId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const proposalId = '44444444-4444-4444-8444-444444444444';
const batchId = '55555555-5555-4555-8555-555555555555';
const entityId = '66666666-6666-4666-8666-666666666666';
const runId = '77777777-7777-4777-8777-777777777777';
const createdAt = '2026-08-16T08:00:00.000Z';

const activeRenderers: TestRenderer[] = [];

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonContaining(root: TestInstance, text: string): TestInstance {
  const button = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
  if (!button) throw new Error(`Missing button containing: ${text}`);
  return button;
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

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function proposal(overrides: Partial<StateProposal> = {}): StateProposal {
  return contractInput<StateProposal>({
    id: proposalId,
    batchId,
    generationRunId: runId,
    projectId,
    chapterId,
    sourceVersionId: versionId,
    proposalType: 'entity_state',
    source: 'provider',
    target: { targetType: 'entity_state', entityId, stateKey: 'age' },
    previousValue: { value: 17, semanticKind: 'age', validUntilChapterId: null },
    proposedValue: { value: 18, semanticKind: 'age', validUntilChapterId: null },
    evidence: [{ kind: 'version', targetId: versionId, note: '来自定稿正文' }],
    confidence: 0.91,
    status: 'pending',
    freshness: 'current',
    actionability: 'accept',
    resolvedValue: null,
    createdAt,
    resolvedAt: null,
    ...overrides,
  });
}

function catalog(item = proposal()): StateProposalCatalog {
  return contractInput<StateProposalCatalog>({
    projectId,
    batches: [
      {
        batchId,
        projectId,
        chapterId,
        sourceVersionId: versionId,
        generationRunId: runId,
        source: 'provider',
        proposalCount: 1,
        status: 'pending',
        createdAt,
      },
    ],
    proposals: [item],
    snapshots: [],
    invalidations: [],
  });
}

function structure(): ProjectStructure {
  return contractInput<ProjectStructure>({
    projectId,
    volumes: [
      {
        id: '88888888-8888-4888-8888-888888888888',
        title: '第一卷',
        chapters: [
          {
            id: chapterId,
            title: '第一章',
            finalVersionId: versionId,
          },
        ],
      },
    ],
  });
}

function snapshot(): EndingSnapshotReadResult {
  return contractInput<EndingSnapshotReadResult>({
    projectId,
    chapterId,
    snapshotSource: 'fallback_live_query',
    snapshot: null,
    content: {
      entityStates: [],
      knowledgeStates: [],
      relationships: [],
      foreshadowings: [],
      arcMilestones: [],
    },
  });
}

function run(status: GenerationRun['status'], stage: GenerationRun['stage']): GenerationRun {
  return contractInput<GenerationRun>({ runId, projectId, status, stage });
}

function createBridge(options: { startState?: 'success' | 'failure' | 'cancelled' } = {}) {
  const planningListStructure = vi.fn().mockResolvedValue({
    state: 'success',
    data: structure(),
  });
  const providersList = vi.fn().mockResolvedValue({
    state: 'success',
    data: { providers: [{ id: 'provider-local', name: '本地模型' }] },
  });
  const stateList = vi.fn().mockResolvedValue({ state: 'success', data: catalog() });
  const readSnapshot = vi.fn().mockResolvedValue({ state: 'success', data: snapshot() });
  const resolve = vi.fn().mockResolvedValue({ state: 'success', data: catalog() });
  const startState = options.startState ?? 'success';
  const generationStart = vi.fn().mockResolvedValue(
    startState === 'success'
      ? { state: 'success', data: { run: run('running', 'queued') } }
      : startState === 'failure'
        ? {
            state: 'failure',
            error: { code: 'MODEL_UNAVAILABLE', message: '模型暂不可用。', retryable: true },
          }
        : { state: 'cancelled' },
  );
  const generationGetRun = vi
    .fn()
    .mockResolvedValue({ state: 'success', data: run('succeeded', 'completed') });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      planning: { listStructure: planningListStructure },
      providers: { list: providersList },
      stateProposal: { list: stateList, readSnapshot, resolve },
      generation: { start: generationStart, getRun: generationGetRun },
    }),
    planningListStructure,
    providersList,
    stateList,
    readSnapshot,
    resolve,
    generationStart,
    generationGetRun,
  };
}

async function renderPanel(
  bridge: RendererBridgeAdapter,
  readOnly = false,
  proposalCatalog = catalog(),
): Promise<TestRenderer> {
  controls.resource.data = { catalog: proposalCatalog, snapshot: null };
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(StateProposalPanel, {
        bridge,
        projectId,
        projectName: '测试作品',
        readOnly,
      }),
    );
    await flushPromises();
  });
  activeRenderers.push(renderer);
  return renderer;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  controls.pollOptions = null;
  controls.stopPolling.mockReset();
});

afterEach(async () => {
  await act(async () => {
    for (const renderer of activeRenderers.splice(0)) renderer.unmount();
  });
  vi.unstubAllGlobals();
});

describe('StateProposalPanel author behavior coverage', () => {
  it('loads the selected final chapter, starts extraction with exact provenance and refreshes on terminal polling', async () => {
    const harness = createBridge();
    const renderer = await renderPanel(harness.bridge);

    expect(harness.planningListStructure).toHaveBeenCalledWith(projectId, { mode: 'replace' });
    expect(harness.providersList).toHaveBeenCalledWith({ mode: 'replace' });

    const load = controls.queryLoad;
    if (!load) throw new Error('Missing state proposal query loader.');
    const loaded = await load();
    expect(harness.stateList).toHaveBeenCalledWith(
      { projectId, chapterId, includeResolved: true },
      { mode: 'replace' },
    );
    expect(harness.readSnapshot).toHaveBeenCalledWith(
      { projectId, chapterId },
      { mode: 'replace' },
    );
    expect(loaded).toMatchObject({
      state: 'success',
      data: { catalog: expect.any(Object), snapshot: expect.any(Object) },
    });

    const analyze = buttonContaining(renderer.root, '分析定稿');
    expect(analyze.props.disabled).toBe(false);
    await act(async () => {
      invoke(analyze, 'onClick');
      await flushPromises();
    });
    expect(harness.generationStart).toHaveBeenCalledWith({
      projectId,
      chapterId,
      baseDraftId: null,
      baseDraftRevision: null,
      providerId: 'provider-local',
      continuationOfRunId: null,
      intent: { runType: 'state_extract', sourceVersionId: versionId },
    });

    const polling = controls.pollOptions;
    if (!polling) throw new Error('Missing state extraction polling options.');
    const poll = polling.poll as () => Promise<unknown>;
    await poll();
    expect(harness.generationGetRun).toHaveBeenCalledWith(projectId, runId);

    const onError = polling.onError as () => boolean;
    await act(async () => {
      expect(onError()).toBe(true);
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('智能分析进度读取失败，正在重试。');

    const onResult = polling.onResult as (outcome: unknown) => boolean;
    await act(async () => {
      expect(onResult({ state: 'success', data: run('succeeded', 'completed') })).toBe(false);
      await flushPromises();
    });
    expect(controls.resource.refresh).toHaveBeenCalledOnce();
    expect(textContent(renderer.root)).toContain('智能分析');
  });

  it('persists accept, reject and edited acceptance while cancelled or invalid edits never reach the backend', async () => {
    const harness = createBridge();
    const prompt = vi.fn();
    vi.stubGlobal('window', { prompt });
    const renderer = await renderPanel(harness.bridge);

    const accept = nodeWithProp(renderer.root, 'data-accept-state-proposal', proposalId);
    await act(async () => {
      invoke(accept, 'onClick');
      await flushPromises();
    });
    expect(harness.resolve).toHaveBeenNthCalledWith(1, {
      projectId,
      authority: 'author',
      resolutions: [{ proposalId, decision: 'accept' }],
    });

    const ignore = buttonContaining(renderer.root, '忽略');
    await act(async () => {
      invoke(ignore, 'onClick');
      await flushPromises();
    });
    expect(harness.resolve).toHaveBeenNthCalledWith(2, {
      projectId,
      authority: 'author',
      resolutions: [{ proposalId, decision: 'reject' }],
    });

    const edit = nodeWithProp(renderer.root, 'data-edit-accept-state-proposal', proposalId);
    prompt.mockReturnValueOnce(null).mockReturnValueOnce('年龄十八').mockReturnValueOnce('19');

    await act(async () => {
      invoke(edit, 'onClick');
      await flushPromises();
    });
    expect(harness.resolve).toHaveBeenCalledTimes(2);

    await act(async () => {
      invoke(edit, 'onClick');
      await flushPromises();
    });
    expect(harness.resolve).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain('数字');

    await act(async () => {
      invoke(edit, 'onClick');
      await flushPromises();
    });
    expect(harness.resolve).toHaveBeenNthCalledWith(3, {
      projectId,
      authority: 'author',
      resolutions: [
        {
          proposalId,
          decision: 'edit_accept',
          editedValue: { value: 19, semanticKind: 'age', validUntilChapterId: null },
        },
      ],
    });
  });

  it('keeps read-only and stale review paths non-mutating', async () => {
    const harness = createBridge();
    const staleProposal = proposal({ freshness: 'stale', actionability: 'reject_only' });
    const renderer = await renderPanel(harness.bridge, true, catalog(staleProposal));

    const analyze = buttonContaining(renderer.root, '分析定稿');
    expect(analyze.props.disabled).toBe(true);
    await act(async () => {
      invoke(analyze, 'onClick');
      await flushPromises();
    });
    expect(harness.generationStart).not.toHaveBeenCalled();

    const accept = nodeWithProp(renderer.root, 'data-accept-state-proposal', proposalId);
    const edit = nodeWithProp(renderer.root, 'data-edit-accept-state-proposal', proposalId);
    const ignore = buttonContaining(renderer.root, '忽略');
    expect(accept.props.disabled).toBe(true);
    expect(edit.props.disabled).toBe(true);
    expect(ignore.props.disabled).toBe(true);
    expect(harness.resolve).not.toHaveBeenCalled();
    expect(textContent(renderer.root)).toContain('这条旧建议只能忽略');
  });
});
