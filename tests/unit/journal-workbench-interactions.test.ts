import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JournalCatalog, JournalEntry } from '@worldforge/contracts';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { JournalWorkbench } from '../../apps/desktop/renderer/src/features/journal/journal-workbench.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const hooks = vi.hoisted(() => ({
  cursor: 0,
  values: [] as unknown[],
  effects: [] as Array<() => unknown>,
}));

vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
  useState: (initial: unknown) => {
    const index = hooks.cursor;
    hooks.cursor += 1;
    if (!(index in hooks.values)) {
      hooks.values[index] = typeof initial === 'function' ? initial() : initial;
    }
    const setValue = (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    };
    return [hooks.values[index], setValue];
  },
  useEffect: (effect: () => unknown) => {
    hooks.effects.push(effect);
  },
}));

const projectId = '11111111-1111-4111-8111-111111111111';
const entryId = '22222222-2222-4222-8222-222222222222';
const periodStart = '2026-08-11T00:00:00.000Z';
const periodEnd = '2026-08-12T00:00:00.000Z';
const updatedAt = '2026-08-12T01:00:00.000Z';
const originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');

type ElementRecord = {
  readonly type: unknown;
  readonly props: Record<string, unknown>;
};

function isElement(value: unknown): value is ElementRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = contractInput<Record<string, unknown>>(value);
  return 'type' in record && 'props' in record;
}

function textOf(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join('');
  if (!isElement(value)) return '';
  return textOf(value.props.children);
}

function visit(value: unknown, matches: ElementRecord[]): void {
  if (Array.isArray(value)) {
    value.forEach((child) => visit(child, matches));
    return;
  }
  if (!isElement(value)) return;
  matches.push(value);
  visit(value.props.children, matches);
}

function elements(tree: unknown, type: string): ElementRecord[] {
  const matches: ElementRecord[] = [];
  visit(tree, matches);
  return matches.filter((element) => element.type === type);
}

function button(tree: unknown, label: string): ElementRecord {
  const match = elements(tree, 'button').find((candidate) => textOf(candidate).includes(label));
  if (!match) throw new Error(`BUTTON_NOT_FOUND:${label}`);
  return match;
}

async function invoke(element: ElementRecord, property: string, argument?: unknown): Promise<void> {
  const handler = element.props[property];
  if (typeof handler !== 'function') throw new Error(`HANDLER_NOT_FOUND:${property}`);
  const result = handler(argument);
  if (result instanceof Promise) await result;
  await settle();
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}

async function flushEffects(): Promise<void> {
  const pending = hooks.effects.splice(0);
  pending.forEach((effect) => effect());
  await settle();
}

function render(bridge: RendererBridgeAdapter, readOnly = false, onNavigate = vi.fn()): unknown {
  hooks.cursor = 0;
  hooks.effects = [];
  return JournalWorkbench({ bridge, projectId, readOnly, onNavigate });
}

function summary(navigationReferences: JournalEntry['deterministicSummary']['navigationReferences']) {
  return {
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
  };
}

function entry(
  id: string,
  periodType: JournalEntry['periodType'],
  status: JournalEntry['status'],
  navigationReferences: JournalEntry['deterministicSummary']['navigationReferences'] = [],
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

const references = contractInput<JournalEntry['deterministicSummary']['navigationReferences']>([
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

function catalog(options: { nextCursor?: boolean; schedule?: 'off' | 'daily' | 'weekly' } = {}) {
  return contractInput<JournalCatalog>({
    projectId,
    entries: [
      entry(entryId, 'daily', 'deterministic', references),
      entry('88888888-8888-4888-8888-888888888888', 'weekly', 'ready'),
      entry('99999999-9999-4999-8999-999999999998', 'manual', 'ai_failed'),
      entry('99999999-9999-4999-8999-999999999997', 'daily', 'ai_pending'),
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

function installWindow(journal: Record<string, unknown>): void {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      worldforgeJournal: journal,
      setTimeout: (handler: unknown) => {
        if (typeof handler === 'function') queueMicrotask(() => handler());
        return 1;
      },
      clearTimeout: () => undefined,
    },
  });
}

function createBridge() {
  const providersList = vi.fn().mockResolvedValue({
    state: 'success',
    data: { providers: [{ id: 'provider-local', name: '本地模型' }] },
  });
  const generationStart = vi.fn().mockResolvedValue({
    state: 'failure',
    error: { code: 'MODEL_UNAVAILABLE', message: '本地模型暂不可用。', retryable: true },
  });
  const generationGetRun = vi.fn().mockResolvedValue({
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

beforeEach(() => {
  hooks.cursor = 0;
  hooks.values = [];
  hooks.effects = [];
  vi.restoreAllMocks();
});

afterEach(() => {
  if (originalWindowDescriptor) Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
  else Reflect.deleteProperty(globalThis, 'window');
});

describe('M12-01 JournalWorkbench interactions', () => {
  it('covers deterministic review, schedule, notes, navigation, pagination and AI failure', async () => {
    const baseCatalog = catalog({ nextCursor: true });
    const olderCatalog = contractInput<JournalCatalog>({
      ...catalog(),
      entries: [entry('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'weekly', 'deterministic')],
    });
    const generate = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: { message: '窗口生成失败。' },
      })
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
    const list = vi.fn().mockImplementation(async (input: { before: unknown }) =>
      input.before === null ? { ok: true, data: baseCatalog } : { ok: true, data: olderCatalog },
    );
    const markAiFailed = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      list,
      generate,
      updatePreferences,
      updateNote,
      markAiFailed,
    };
    installWindow(journal);
    const { bridge, generationStart } = createBridge();
    const onNavigate = vi.fn();

    let tree = render(bridge, false, onNavigate);
    await flushEffects();
    tree = render(bridge, false, onNavigate);

    expect(textOf(tree)).toContain('创作日志');
    expect(textOf(tree)).toContain('智能复盘已生成');
    expect(textOf(tree)).toContain('智能复盘暂不可用');
    expect(textOf(tree)).toContain('智能复盘生成中');
    expect(textOf(tree)).toContain('确定性复盘');

    await invoke(button(tree, '今日复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('复盘生成失败：窗口生成失败。');

    await invoke(button(tree, '本周复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(textOf(tree)).toContain('复盘已按真实项目记录生成。');

    const selects = elements(tree, 'select');
    await invoke(selects[0]!, 'onChange', { target: { value: 'daily' } });
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('定时复盘设置已保存。');

    await invoke(elements(tree, 'select')[0]!, 'onChange', { target: { value: 'off' } });
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('定时复盘已关闭。');

    await invoke(button(tree, '指定范围复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('请先选择复盘起止日期。');

    let dateInputs = elements(tree, 'input');
    await invoke(dateInputs[0]!, 'onChange', { target: { value: '2026-08-16' } });
    tree = render(bridge, false, onNavigate);
    dateInputs = elements(tree, 'input');
    await invoke(dateInputs[1]!, 'onChange', { target: { value: '2026-08-14' } });
    tree = render(bridge, false, onNavigate);
    await invoke(button(tree, '指定范围复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('复盘结束日期必须晚于开始日期。');

    dateInputs = elements(tree, 'input');
    await invoke(dateInputs[0]!, 'onChange', { target: { value: '2026-08-10' } });
    tree = render(bridge, false, onNavigate);
    dateInputs = elements(tree, 'input');
    await invoke(dateInputs[1]!, 'onChange', { target: { value: '2026-08-12' } });
    tree = render(bridge, false, onNavigate);
    await invoke(button(tree, '指定范围复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(generate).toHaveBeenCalledTimes(3);

    await invoke(button(tree, '每日 ·'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('关系变化 1');
    for (const reference of ['第一章', '第一章定稿', '主角', '雨夜灵感', '连续性检查']) {
      await invoke(button(tree, reference), 'onClick');
    }
    expect(onNavigate).toHaveBeenCalledTimes(5);
    expect(onNavigate.mock.calls.map((call) => call[0]?.type)).toEqual([
      'research-link-target',
      'version',
      'entity',
      'research-link-target',
      'validation-issue',
    ]);

    const textarea = elements(tree, 'textarea')[0]!;
    await invoke(textarea, 'onChange', { target: { value: '  新备注  ' } });
    tree = render(bridge, false, onNavigate);
    await invoke(button(tree, '保存备注'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ entryId, authorNote: '新备注', expectedUpdatedAt: updatedAt }),
    );
    expect(list).toHaveBeenCalledWith({ projectId, limit: 30, before: null });

    await invoke(button(tree, '保存备注'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('作者备注已保存。');

    await invoke(button(tree, '生成智能复盘'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(generationStart).toHaveBeenCalledOnce();
    expect(markAiFailed).toHaveBeenCalledWith({ projectId, entryId, generationRunId: null });
    expect(textOf(tree)).toContain('智能复盘未启动');

    await invoke(button(tree, '加载更早日志'), 'onClick');
    tree = render(bridge, false, onNavigate);
    expect(textOf(tree)).toContain('每周');
    expect(list).toHaveBeenCalledWith({
      projectId,
      limit: 30,
      before: baseCatalog.nextCursor,
    });
  });

  it('covers catch-up fallback, read-only guards and successful AI polling', async () => {
    const baseCatalog = catalog();
    const list = vi.fn().mockResolvedValue({ ok: true, data: baseCatalog });
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list,
      generate: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updatePreferences: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      updateNote: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
      markAiFailed: vi.fn().mockResolvedValue({ ok: true, data: baseCatalog }),
    };
    installWindow(journal);
    const { bridge, generationStart, generationGetRun, providersList } = createBridge();
    generationStart.mockResolvedValue({
      state: 'success',
      data: {
        run: {
          runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          projectId,
          status: 'running',
        },
      },
    });

    let tree = render(bridge);
    await flushEffects();
    await settle();
    tree = render(bridge);
    expect(list).toHaveBeenCalled();
    expect(providersList).toHaveBeenCalled();

    await invoke(button(tree, '每日 ·'), 'onClick');
    tree = render(bridge);
    await invoke(button(tree, '生成智能复盘'), 'onClick');
    tree = render(bridge);
    await flushEffects();
    await settle();
    tree = render(bridge);
    expect(generationGetRun).toHaveBeenCalledWith(
      projectId,
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      { mode: 'share' },
    );
    expect(textOf(tree)).toContain('智能复盘已生成。');

    tree = render(bridge, true);
    await invoke(button(tree, '今日复盘'), 'onClick');
    await invoke(elements(tree, 'select')[0]!, 'onChange', { target: { value: 'weekly' } });
    expect(journal.generate).not.toHaveBeenCalled();
    expect(journal.updatePreferences).not.toHaveBeenCalled();
  });

  it('surfaces journal list exceptions without corrupting the workbench', async () => {
    const journal = {
      catchUp: vi.fn().mockResolvedValue({ ok: false, error: { message: '补偿失败。' } }),
      list: vi.fn().mockRejectedValue(new Error('日志数据库暂不可读。')),
      generate: vi.fn(),
      updatePreferences: vi.fn(),
      updateNote: vi.fn(),
      markAiFailed: vi.fn(),
    };
    installWindow(journal);
    const { bridge } = createBridge();

    let tree = render(bridge);
    await flushEffects();
    await settle();
    tree = render(bridge);
    expect(textOf(tree)).toContain('日志数据库暂不可读。');
  });
});
