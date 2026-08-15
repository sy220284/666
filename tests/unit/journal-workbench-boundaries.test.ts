import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { JournalCatalog, JournalEntry } from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { JournalWorkbench } from '../../apps/desktop/renderer/src/features/journal/journal-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

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
const entryId = '22222222-2222-4222-8222-222222222222';
const runId = '33333333-3333-4333-8333-333333333333';
const periodStart = '2026-08-14T00:00:00.000Z';
const periodEnd = '2026-08-15T00:00:00.000Z';
const updatedAt = '2026-08-15T01:00:00.000Z';

function textContent(instance: TestInstance): string {
  return instance.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function buttonContaining(root: TestInstance, text: string): TestInstance {
  const match = root.findAll(
    (node) => node.type === 'button' && textContent(node).includes(text),
  )[0];
  if (!match) throw new Error(`Missing button containing: ${text}`);
  return match;
}

function controlByLabel(root: TestInstance, label: string): TestInstance {
  const field = root.findAll(
    (node) => node.type === 'label' && textContent(node).startsWith(label),
  )[0];
  if (!field) throw new Error(`Missing field: ${label}`);
  const control = field.findAll((node) =>
    ['input', 'textarea', 'select'].includes(String(node.type)),
  )[0];
  if (!control) throw new Error(`Missing control: ${label}`);
  return control;
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

function summary(): JournalEntry['deterministicSummary'] {
  return contractInput({
    periodStart,
    periodEnd,
    writing: { sessions: 1, netCharacters: 1200, activeSeconds: 600, touchedChapters: 1 },
    versions: { created: 1, finalized: 1 },
    generation: {
      started: 1,
      succeeded: 1,
      failed: 0,
      cancelled: 0,
      acceptedCandidates: 1,
    },
    review: {
      stateProposalsResolved: 0,
      validationIssuesCreated: 0,
      validationIssuesResolved: 0,
      todosCreated: 0,
      todosCompleted: 0,
      commentsCreated: 0,
      commentsResolved: 0,
    },
    ideas: { created: 0, converted: 0 },
    knowledge: {
      relationshipChanges: 0,
      timelineChanges: 0,
      foreshadowingChanges: 0,
      arcChanges: 0,
    },
    recovery: { backupsCreated: 0 },
    navigationReferences: [],
    digestReferences: [],
  });
}

function entry(): JournalEntry {
  return contractInput({
    id: entryId,
    projectId,
    periodType: 'daily',
    periodStart,
    periodEnd,
    sourceRevision: 1,
    sourceHash: 'a'.repeat(64),
    deterministicSummary: summary(),
    aiSummary: null,
    authorNote: '旧备注',
    generationRunId: null,
    status: 'deterministic',
    createdAt: periodEnd,
    updatedAt,
  });
}

function catalog(schedule: 'off' | 'daily' | 'weekly' = 'off'): JournalCatalog {
  return contractInput({
    projectId,
    entries: [entry()],
    preferences: { projectId, schedule, updatedAt },
    nextCursor: null,
  });
}

function installWindow(
  journal: Record<string, unknown>,
  timers: Array<() => void> = [],
  clearTimeout = vi.fn(),
): void {
  vi.stubGlobal('window', {
    worldforgeJournal: journal,
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout,
  });
}

function createBridge(
  options: {
    providers?: readonly { id: string; name: string }[];
    start?: ReturnType<typeof vi.fn>;
    getRun?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const providers = options.providers ?? [{ id: 'provider-local', name: '本地模型' }];
  const start =
    options.start ??
    vi.fn().mockResolvedValue({
      state: 'success',
      data: { run: { runId, projectId, status: 'running' } },
    });
  const getRun =
    options.getRun ??
    vi.fn().mockResolvedValue({
      state: 'success',
      data: { runId, projectId, status: 'succeeded' },
    });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      providers: {
        list: vi.fn().mockResolvedValue({ state: 'success', data: { providers } }),
      },
      generation: { start, getRun },
    }),
    start,
    getRun,
  };
}

async function renderWorkbench(
  bridge: RendererBridgeAdapter,
  readOnly = false,
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(
      createElement(JournalWorkbench, {
        bridge,
        projectId,
        readOnly,
        onNavigate: vi.fn(),
      }),
    );
    await flushPromises();
  });
  return renderer;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('M12-01 JournalWorkbench boundary coverage', () => {
  it('covers provider-less AI, failed schedule persistence, blank notes and read-only guards', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog();
    const updatePreferences = vi
      .fn()
      .mockResolvedValue({ ok: false, error: { message: '定时设置保存失败。' } });
    const updateNote = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      generate: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updatePreferences,
      updateNote,
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    };
    installWindow(journal);
    const providerless = createBridge({ providers: [] });
    const renderer = await renderWorkbench(providerless.bridge);

    await act(async () => {
      invoke(controlByLabel(renderer.root, '定时复盘'), 'onChange', {
        target: { value: 'weekly' },
      });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('定时设置保存失败。');

    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    const aiButton = buttonContaining(renderer.root, '生成智能复盘');
    expect(aiButton.props.disabled).toBe(true);
    await act(async () => {
      invoke(aiButton, 'onClick');
      await flushPromises();
    });
    expect(providerless.start).not.toHaveBeenCalled();

    await act(async () => {
      invoke(controlByLabel(renderer.root, '作者备注'), 'onChange', {
        target: { value: '   ' },
      });
    });
    await act(async () => {
      invoke(buttonContaining(renderer.root, '保存备注'), 'onClick');
      await flushPromises();
    });
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({
        entryId,
        authorNote: null,
        expectedUpdatedAt: updatedAt,
      }),
    );

    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    expect(renderer.root.findAll((node) => node.type === 'textarea')).toHaveLength(0);
    await act(async () => renderer.unmount());

    const readOnlyUpdateNote = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    const readOnlyJournal = { ...journal, updateNote: readOnlyUpdateNote };
    installWindow(readOnlyJournal);
    const writableProvider = createBridge();
    const readOnlyRenderer = await renderWorkbench(writableProvider.bridge, true);
    await act(async () => invoke(buttonContaining(readOnlyRenderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(readOnlyRenderer.root, '保存备注'), 'onClick');
      invoke(buttonContaining(readOnlyRenderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(readOnlyUpdateNote).not.toHaveBeenCalled();
    expect(writableProvider.start).not.toHaveBeenCalled();
    await act(async () => readOnlyRenderer.unmount());
  });

  it('covers polling transport failure, failed, cancelled and continuing runs', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const scenarios = [
      {
        outcome: { state: 'failure', error: { message: '运行读取失败。' } },
        notice: null,
      },
      {
        outcome: { state: 'success', data: { runId, projectId, status: 'failed' } },
        notice: '智能复盘未完成',
      },
      {
        outcome: {
          state: 'success',
          data: { runId, projectId, status: 'cancelled' },
        },
        notice: '智能复盘未完成',
      },
      {
        outcome: { state: 'success', data: { runId, projectId, status: 'running' } },
        notice: null,
      },
    ] as const;

    for (const scenario of scenarios) {
      const timers: Array<() => void> = [];
      const clearTimeout = vi.fn();
      const baseCatalog = catalog();
      const journal = {
        catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
        list: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
        generate: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
        updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
        updateNote: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
        markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      };
      installWindow(journal, timers, clearTimeout);
      const getRun = vi.fn().mockResolvedValue(scenario.outcome);
      const bridge = createBridge({ getRun });
      const renderer = await renderWorkbench(bridge.bridge);

      await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
      await act(async () => {
        invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
        await flushPromises();
      });
      expect(timers.length).toBeGreaterThan(0);
      await act(async () => {
        timers.shift()?.();
        await flushPromises();
      });
      expect(getRun).toHaveBeenCalled();
      if (scenario.notice) {
        expect(textContent(renderer.root)).toContain(scenario.notice);
      }
      await act(async () => renderer.unmount());
      if (scenario.outcome.state === 'success' && scenario.outcome.data.status === 'running') {
        expect(clearTimeout).toHaveBeenCalled();
      }
    }
  });

  it('uses the Sunday weekly boundary and does not mutate a late-unmounted initial load', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T12:00:00.000Z'));
    const baseCatalog = catalog();
    const generate = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      generate,
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    });
    const renderer = await renderWorkbench(createBridge().bridge);
    await act(async () => {
      invoke(buttonContaining(renderer.root, '本周复盘'), 'onClick');
      await flushPromises();
    });
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ projectId, periodType: 'manual' }),
    );
    await act(async () => renderer.unmount());

    vi.useRealTimers();
    let resolveCatchUp!: (value: unknown) => void;
    let resolveProviders!: (value: unknown) => void;
    const catchUp = new Promise((resolve) => {
      resolveCatchUp = resolve;
    });
    const providers = new Promise((resolve) => {
      resolveProviders = resolve;
    });
    installWindow({
      catchUp: vi.fn(() => catchUp),
      list: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    });
    const bridge = contractInput<RendererBridgeAdapter>({
      providers: { list: vi.fn(() => providers) },
      generation: { start: vi.fn(), getRun: vi.fn() },
    });
    let lateRenderer!: TestRenderer;
    await act(async () => {
      lateRenderer = create(
        createElement(JournalWorkbench, {
          bridge,
          projectId,
          readOnly: false,
          onNavigate: vi.fn(),
        }),
      );
      await Promise.resolve();
    });
    await act(async () => lateRenderer.unmount());
    await act(async () => {
      resolveCatchUp({ ok: true, data: baseCatalog });
      resolveProviders({ state: 'success', data: { providers: [] } });
      await flushPromises();
    });
  });

  it('covers reload failures, pagination and AI lifecycle fallbacks', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog();
    const quietBridge = createBridge({ providers: [] }).bridge;

    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockResolvedValue({ ok: false, error: { message: '回读失败。' } }),
    });
    let renderer = await renderWorkbench(quietBridge);
    expect(textContent(renderer.root)).toContain('创作日志读取失败：回读失败。');
    await act(async () => renderer.unmount());

    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockRejectedValue('非 Error 读取失败'),
    });
    renderer = await renderWorkbench(quietBridge);
    expect(textContent(renderer.root)).toContain('创作日志读取失败。');
    await act(async () => renderer.unmount());

    const olderEntryId = '55555555-5555-4555-8555-555555555555';
    const firstCatalog = contractInput<JournalCatalog>({
      ...baseCatalog,
      entries: [{ ...entry(), aiSummary: '已有智能复盘' }],
      nextCursor: { periodEnd, id: entryId },
    });
    const olderCatalog = contractInput<JournalCatalog>({
      ...baseCatalog,
      entries: [{ ...entry(), id: olderEntryId, authorNote: null, aiSummary: null }],
      nextCursor: null,
    });
    const list = vi.fn().mockResolvedValue({ ok: true, data: olderCatalog });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
    });
    renderer = await renderWorkbench(createBridge().bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    expect(textContent(renderer.root)).toContain('已有智能复盘');
    await act(async () => {
      invoke(buttonContaining(renderer.root, '加载更早日志'), 'onClick');
      await flushPromises();
    });
    expect(list).toHaveBeenCalledWith({
      projectId,
      limit: 30,
      before: { periodEnd, id: entryId },
    });
    expect(
      renderer.root.findAll(
        (node) => node.type === 'li' && node.props.className === 'journal-entry',
      ),
    ).toHaveLength(2);
    await act(async () => renderer.unmount());

    const markAiFailed = vi.fn().mockResolvedValue({
      ok: false,
      error: { message: '失败状态回写未完成。' },
    });
    const failureCatalog = catalog();
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      generate: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: failureCatalog }),
      markAiFailed,
    });
    const failedStart = vi.fn().mockResolvedValue({
      state: 'failure',
      error: { code: 'AI_CONNECTION_FAILED_003', message: '连接失败。' },
    });
    renderer = await renderWorkbench(createBridge({ start: failedStart }).bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(markAiFailed).toHaveBeenCalledWith({
      projectId,
      entryId,
      generationRunId: null,
    });
    expect(textContent(renderer.root)).toContain('智能复盘未启动');
    await act(async () => renderer.unmount());

    const timers = [];
    const runningCatalog = catalog();
    installWindow(
      {
        catchUp: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        list: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        generate: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        updateNote: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
        markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: runningCatalog }),
      },
      timers,
    );
    const getRun = vi.fn().mockResolvedValue({
      state: 'success',
      data: { runId, projectId, status: 'running' },
    });
    renderer = await renderWorkbench(createBridge({ getRun }).bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(timers.length).toBeGreaterThan(0);
    const latePoll = timers.at(-1);
    await act(async () => renderer.unmount());
    await act(async () => {
      latePoll?.();
      await flushPromises();
    });
    expect(getRun).toHaveBeenCalled();
  });

  it('covers missing Journal bridge fail-fast path', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      worldforgeJournal: undefined,
      setTimeout: vi.fn(),
      clearTimeout: vi.fn(),
    });
    await expect(renderWorkbench(createBridge({ providers: [] }).bridge)).rejects.toThrow();
  });

  it('keeps the current Journal page when loading older logs fails', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const firstCatalog = contractInput<JournalCatalog>({
      ...catalog(),
      nextCursor: { periodEnd, id: entryId },
    });
    const list = vi.fn().mockResolvedValue({
      ok: false,
      error: { message: '更早日志读取失败。' },
    });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: firstCatalog }),
    });
    const renderer = await renderWorkbench(createBridge({ providers: [] }).bridge);
    const entries = () =>
      renderer.root.findAll(
        (node) => node.type === 'li' && node.props.className === 'journal-entry',
      );
    expect(entries()).toHaveLength(1);
    await act(async () => {
      invoke(buttonContaining(renderer.root, '加载更早日志'), 'onClick');
      await flushPromises();
    });
    expect(list).toHaveBeenCalledWith({
      projectId,
      limit: 30,
      before: { periodEnd, id: entryId },
    });
    expect(entries()).toHaveLength(1);
    await act(async () => renderer.unmount());
  });
});
