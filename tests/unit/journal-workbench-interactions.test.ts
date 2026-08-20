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
const periodStart = '2026-08-11T00:00:00.000Z';
const periodEnd = '2026-08-12T00:00:00.000Z';
const updatedAt = '2026-08-12T01:00:00.000Z';

type NavigationReferences = JournalEntry['deterministicSummary']['navigationReferences'];

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

function summary(navigationReferences: NavigationReferences = []) {
  return contractInput<JournalEntry['deterministicSummary']>({
    periodStart,
    periodEnd,
    writing: { sessions: 2, netCharacters: 1_280, activeSeconds: 780, touchedChapters: 2 },
    versions: { created: 2, finalized: 1 },
    generation: {
      started: 3,
      succeeded: 2,
      failed: 1,
      cancelled: 0,
      acceptedCandidates: 1,
    },
    review: {
      stateProposalsResolved: 1,
      validationIssuesCreated: 2,
      validationIssuesResolved: 1,
      todosCreated: 1,
      todosCompleted: 1,
      commentsCreated: 1,
      commentsResolved: 1,
    },
    ideas: { created: 2, converted: 1 },
    knowledge: {
      relationshipChanges: 1,
      timelineChanges: 1,
      foreshadowingChanges: 1,
      arcChanges: 1,
    },
    recovery: { backupsCreated: 1 },
    navigationReferences,
    digestReferences: [],
  });
}

function entry(
  id: string,
  periodType: JournalEntry['periodType'],
  status: JournalEntry['status'],
  navigationReferences: NavigationReferences = [],
): JournalEntry {
  return contractInput<JournalEntry>({
    id,
    projectId,
    periodType,
    periodStart,
    periodEnd,
    sourceRevision: 4,
    sourceHash: 'a'.repeat(64),
    deterministicSummary: summary(navigationReferences),
    aiSummary: status === 'ready' ? '本周节奏稳定，第一章已定稿。' : null,
    authorNote: id === entryId ? '旧备注' : null,
    generationRunId: status === 'ai_pending' ? '99999999-9999-4999-8999-999999999999' : null,
    status,
    createdAt: periodEnd,
    updatedAt,
  });
}

const references = contractInput<NavigationReferences>([
  {
    targetType: 'chapter',
    targetId: '33333333-3333-4333-8333-333333333333',
    label: '第一章',
  },
  {
    targetType: 'version',
    targetId: '44444444-4444-4444-8444-444444444444',
    chapterId: '33333333-3333-4333-8333-333333333333',
    label: '第一章定稿',
  },
  {
    targetType: 'entity',
    targetId: '55555555-5555-4555-8555-555555555555',
    label: '主角',
  },
  {
    targetType: 'idea',
    targetId: '66666666-6666-4666-8666-666666666666',
    label: '雨夜灵感',
  },
  {
    targetType: 'validation',
    targetId: '77777777-7777-4777-8777-777777777777',
    chapterId: '33333333-3333-4333-8333-333333333333',
    versionId: null,
    logicalBlockId: null,
    label: '连续性检查',
  },
]);

function catalog(
  options: {
    nextCursor?: boolean;
    schedule?: 'off' | 'daily' | 'weekly';
    includePending?: boolean;
  } = {},
) {
  return contractInput<JournalCatalog>({
    projectId,
    entries: [
      entry(entryId, 'daily', 'deterministic', references),
      entry('88888888-8888-4888-8888-888888888888', 'weekly', 'ready'),
      entry('99999999-9999-4999-8999-999999999998', 'manual', 'ai_failed'),
      ...(options.includePending
        ? [entry('99999999-9999-4999-8999-999999999997', 'daily', 'ai_pending')]
        : []),
    ],
    preferences: {
      projectId,
      schedule: options.schedule ?? 'off',
      updatedAt,
    },
    nextCursor: options.nextCursor
      ? { periodEnd: periodStart, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
      : null,
  });
}

function installWindow(journal: Record<string, unknown>, timers: Array<() => void> = []): void {
  vi.stubGlobal('window', {
    worldforgeJournal: journal,
    setTimeout: (callback: () => void) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout: () => undefined,
  });
}

function createBridge(
  options: {
    start?: ReturnType<typeof vi.fn>;
    getRun?: ReturnType<typeof vi.fn>;
    providerResult?: unknown;
  } = {},
) {
  const providersList = vi.fn().mockResolvedValue(
    options.providerResult ?? {
      state: 'success',
      data: { providers: [{ id: 'provider-local', name: '本地模型' }] },
    },
  );
  const generationStart =
    options.start ??
    vi.fn().mockResolvedValue({
      state: 'failure',
      error: { code: 'MODEL_UNAVAILABLE', message: '本地模型暂不可用。', retryable: true },
    });
  const generationGetRun =
    options.getRun ??
    vi.fn().mockResolvedValue({
      state: 'success',
      data: {
        runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId,
        status: 'succeeded',
      },
    });
  return {
    bridge: contractInput<RendererBridgeAdapter>({
      providers: { list: providersList },
      generation: { start: generationStart, getRun: generationGetRun },
    }),
    providersList,
    generationStart,
    generationGetRun,
  };
}

async function renderWorkbench(
  bridge: RendererBridgeAdapter,
  readOnly = false,
  onNavigate = vi.fn(),
): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(createElement(JournalWorkbench, { bridge, projectId, readOnly, onNavigate }));
    await flushPromises();
  });
  return renderer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('M12-01 JournalWorkbench interaction coverage', () => {
  it('covers deterministic generation, schedule, notes, navigation, pagination and AI failure', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog({ nextCursor: true });
    const olderCatalog = contractInput<JournalCatalog>({
      ...catalog(),
      entries: [entry('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'weekly', 'deterministic')],
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: '窗口生成失败。' } })
      .mockResolvedValue({ ok: true, data: baseCatalog });
    const updatePreferences = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, data: catalog({ schedule: 'daily', nextCursor: true }) })
      .mockResolvedValueOnce({ ok: true, data: catalog({ schedule: 'off', nextCursor: true }) })
      .mockResolvedValue({ ok: false, error: { message: '设置保存失败。' } });
    const updateNote = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: '备注冲突。' } })
      .mockResolvedValue({ ok: true, data: baseCatalog });
    const list = vi
      .fn()
      .mockImplementation(async (input: { before: unknown }) =>
        input.before === null ? { ok: true, data: baseCatalog } : { ok: true, data: olderCatalog },
      );
    const markAiFailed = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      list,
      generate,
      updatePreferences,
      updateNote,
      markAiFailed,
    });
    const { bridge, generationStart } = createBridge();
    const onNavigate = vi.fn();
    const renderer = await renderWorkbench(bridge, false, onNavigate);

    expect(textContent(renderer.root)).toContain('创作日志');
    expect(textContent(renderer.root)).toContain('智能复盘已生成');
    expect(textContent(renderer.root)).toContain('智能复盘暂不可用');
    expect(textContent(renderer.root)).toContain('确定性复盘');

    await act(async () => {
      invoke(buttonContaining(renderer.root, '今日复盘'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('复盘生成失败：窗口生成失败。');

    await act(async () => {
      invoke(buttonContaining(renderer.root, '本周复盘'), 'onClick');
      await flushPromises();
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(textContent(renderer.root)).toContain('复盘已按真实项目记录生成。');

    await act(async () => {
      invoke(controlByLabel(renderer.root, '定时复盘'), 'onChange', { target: { value: 'daily' } });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('定时复盘设置已保存。');

    await act(async () => {
      invoke(controlByLabel(renderer.root, '定时复盘'), 'onChange', { target: { value: 'off' } });
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('定时复盘已关闭。');

    await act(async () => {
      invoke(buttonContaining(renderer.root, '指定范围复盘'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('请先选择复盘起止日期。');

    await act(async () => {
      invoke(controlByLabel(renderer.root, '起始日期'), 'onChange', {
        target: { value: '2026-08-16' },
      });
      invoke(controlByLabel(renderer.root, '结束日期'), 'onChange', {
        target: { value: '2026-08-14' },
      });
    });
    await act(async () => {
      invoke(buttonContaining(renderer.root, '指定范围复盘'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('复盘结束日期必须晚于或等于开始日期。');

    await act(async () => {
      invoke(controlByLabel(renderer.root, '起始日期'), 'onChange', {
        target: { value: '2026-08-10' },
      });
      invoke(controlByLabel(renderer.root, '结束日期'), 'onChange', {
        target: { value: '2026-08-12' },
      });
    });
    await act(async () => {
      invoke(buttonContaining(renderer.root, '指定范围复盘'), 'onClick');
      await flushPromises();
    });
    expect(generate).toHaveBeenCalledTimes(3);

    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    expect(textContent(renderer.root)).toContain('关系变化 1');
    for (const reference of ['第一章', '第一章定稿', '主角', '雨夜灵感', '连续性检查']) {
      await act(async () => invoke(buttonContaining(renderer.root, reference), 'onClick'));
    }
    expect(onNavigate.mock.calls.map((call) => call[0]?.type)).toEqual([
      'research-link-target',
      'version',
      'entity',
      'research-link-target',
      'validation-issue',
    ]);

    await act(async () => {
      invoke(controlByLabel(renderer.root, '作者备注'), 'onChange', {
        target: { value: '  新备注  ' },
      });
    });
    await act(async () => {
      invoke(buttonContaining(renderer.root, '保存备注'), 'onClick');
      await flushPromises();
    });
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ entryId, authorNote: '新备注', expectedUpdatedAt: updatedAt }),
    );
    expect(textContent(renderer.root)).toContain('备注保存失败：备注冲突。');
    expect(list).toHaveBeenCalledWith({ projectId, limit: 30, before: null });

    await act(async () => {
      invoke(buttonContaining(renderer.root, '保存备注'), 'onClick');
      await flushPromises();
    });
    expect(textContent(renderer.root)).toContain('作者备注已保存。');

    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(generationStart).toHaveBeenCalledOnce();
    expect(markAiFailed).toHaveBeenCalledWith({ projectId, entryId, generationRunId: null });
    expect(textContent(renderer.root)).toContain('智能复盘未启动');

    await act(async () => {
      invoke(buttonContaining(renderer.root, '加载更早日志'), 'onClick');
      await flushPromises();
    });
    expect(list).toHaveBeenCalledWith({ projectId, limit: 30, before: baseCatalog.nextCursor });
    expect(textContent(renderer.root)).toContain('每周');

    await act(async () => renderer.unmount());
  });

  it('covers catch-up fallback, successful AI polling and read-only guards', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog();
    const timers: Array<() => void> = [];
    const list = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    };
    installWindow(journal, timers);
    const start = vi.fn().mockResolvedValue({
      state: 'success',
      data: {
        run: {
          runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          projectId,
          status: 'running',
        },
      },
    });
    const getRun = vi.fn().mockResolvedValue({
      state: 'success',
      data: {
        runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        projectId,
        status: 'succeeded',
      },
    });
    const { bridge } = createBridge({ start, getRun });
    const renderer = await renderWorkbench(bridge);

    expect(list).toHaveBeenCalledWith({ projectId, limit: 30, before: null });
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '生成智能复盘'), 'onClick');
      await flushPromises();
    });
    expect(start).toHaveBeenCalledOnce();
    expect(textContent(renderer.root)).toContain('智能复盘已启动');
    expect(timers.length).toBeGreaterThan(0);

    await act(async () => {
      timers.shift()?.();
      await flushPromises();
    });
    expect(getRun).toHaveBeenCalledWith(projectId, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', {
      mode: 'share',
    });
    expect(textContent(renderer.root)).toContain('智能复盘已生成。');
    await act(async () => renderer.unmount());

    installWindow(journal);
    const readOnlyRenderer = await renderWorkbench(bridge, true);
    expect(buttonContaining(readOnlyRenderer.root, '今日复盘').props.disabled).toBe(true);
    expect(controlByLabel(readOnlyRenderer.root, '定时复盘').props.disabled).toBe(true);
    await act(async () => {
      invoke(buttonContaining(readOnlyRenderer.root, '今日复盘'), 'onClick');
      invoke(controlByLabel(readOnlyRenderer.root, '定时复盘'), 'onChange', {
        target: { value: 'weekly' },
      });
      await flushPromises();
    });
    expect(journal.generate).not.toHaveBeenCalled();
    expect(journal.updatePreferences).not.toHaveBeenCalled();
    await act(async () => readOnlyRenderer.unmount());
  });

  it('surfaces read exceptions and empty catalogs without corrupting the workbench', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockRejectedValue(new Error('日志数据库暂不可读。')),
    });
    const { bridge } = createBridge({
      providerResult: { state: 'failure', error: { message: '模型列表失败。' } },
    });
    const failedRenderer = await renderWorkbench(bridge);
    expect(textContent(failedRenderer.root)).toContain('日志数据库暂不可读。');
    await act(async () => failedRenderer.unmount());

    const emptyCatalog = contractInput<JournalCatalog>({
      projectId,
      entries: [],
      preferences: { projectId, schedule: 'off', updatedAt },
      nextCursor: null,
    });
    installWindow({
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: emptyCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: emptyCatalog }),
    });
    const emptyRenderer = await renderWorkbench(createBridge().bridge);
    expect(textContent(emptyRenderer.root)).toContain('还没有日志。');
    await act(async () => emptyRenderer.unmount());
  });

  it('preserves an unsaved author note while another journal operation refreshes the catalog', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const baseCatalog = catalog();
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      generate: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    };
    installWindow(journal);
    const { bridge } = createBridge();
    const renderer = await renderWorkbench(bridge);
    await act(async () => invoke(buttonContaining(renderer.root, '确定性复盘'), 'onClick'));
    const note = controlByLabel(renderer.root, '作者备注');
    await act(async () => invoke(note, 'onChange', { target: { value: '尚未保存的现场判断' } }));
    await act(async () => {
      invoke(buttonContaining(renderer.root, '今日复盘'), 'onClick');
      await flushPromises();
    });
    expect(controlByLabel(renderer.root, '作者备注').props.value).toBe('尚未保存的现场判断');
    await act(async () => renderer.unmount());
  });

  it('reattaches a persisted Journal AI run and blocks a duplicate model start', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const pendingCatalog = catalog({ includePending: true });
    const timers: Array<() => void> = [];
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
      list: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
      generate: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: pendingCatalog }),
    };
    installWindow(journal, timers);
    const start = vi.fn();
    const getRun = vi.fn().mockResolvedValue({
      state: 'success',
      data: {
        runId: '99999999-9999-4999-8999-999999999999',
        projectId,
        status: 'running',
      },
    });
    const { bridge } = createBridge({ start, getRun });
    const renderer = await renderWorkbench(bridge);
    expect(getRun).toHaveBeenCalledWith(projectId, '99999999-9999-4999-8999-999999999999', {
      mode: 'share',
    });
    expect(textContent(renderer.root)).toContain('已重新接管正在进行的智能复盘');
    await act(async () => invoke(buttonContaining(renderer.root, '智能复盘生成中'), 'onClick'));
    const button = buttonContaining(renderer.root, '生成智能复盘');
    expect(button.props.disabled).toBe(true);
    await act(async () => {
      invoke(button, 'onClick');
      await flushPromises();
    });
    expect(start).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });
});
