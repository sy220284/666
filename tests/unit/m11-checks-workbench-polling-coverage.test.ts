import { describe, expect, it, vi } from 'vitest';

import type {
  GenerationRun,
  ProjectStructure,
  ProviderSummary,
  ValidationCatalog,
} from '@worldforge/contracts';
import type { ReactElement, ReactNode } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type * as ChecksReactHooks from '../../apps/desktop/renderer/src/features/checks/react-hooks.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const hooks = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  index: 0,
  values: [] as unknown[],
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock(
  '../../apps/desktop/renderer/src/features/checks/react-hooks.js',
  async (importOriginal) => {
    const actual = await importOriginal<typeof ChecksReactHooks>();
    return {
      ...actual,
      useCallback: <T>(callback: T): T => callback,
      useEffect: (effect: () => void | (() => void)): void => hooks.effects.push(effect),
      useMemo: <T>(factory: () => T): T => factory(),
      useState: (): readonly [unknown, ReturnType<typeof vi.fn>] => {
        const setter = vi.fn();
        hooks.setters.push(setter);
        return [hooks.values[hooks.index++], setter] as const;
      },
    };
  },
);

import { ChecksWorkbench } from '../../apps/desktop/renderer/src/features/checks/checks-workbench.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const structure = contractInput<ProjectStructure>({
  projectId,
  volumes: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      projectId,
      title: '第一卷',
      orderKey: '1',
      status: 'writing',
      deletedAt: null,
      chapters: [
        {
          id: chapterId,
          volumeId: '44444444-4444-4444-8444-444444444444',
          title: '第一章',
          orderKey: '1',
          status: 'finalized',
          targetWordMin: null,
          targetWordMax: null,
          activeDraftId: null,
          finalVersionId: versionId,
          deletedAt: null,
        },
      ],
    },
  ],
});
const provider = contractInput<ProviderSummary>({ id: 'provider-1', name: '本地模型' });
const catalog = contractInput<ValidationCatalog>({
  projectId,
  batches: [],
  issues: [],
  todos: [],
  comments: [],
  exceptions: [],
});
const runningRun = contractInput<GenerationRun>({
  runId: '55555555-5555-4555-8555-555555555555',
  status: 'running',
  stage: 'calling_model',
});

function reset(values: readonly unknown[]): void {
  hooks.effects = [];
  hooks.index = 0;
  hooks.values = [...values];
  hooks.setters = [];
}

function elements(root: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  const result: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.type === type) result.push(element);
    visit(element.props.children as ReactNode);
  };
  visit(root);
  return result;
}

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return text((node as ReactElement<{ children?: ReactNode }>).props.children);
}

function button(root: ReactNode, label: string): ReactElement<Record<string, unknown>> {
  return elements(root, 'button').find((item) => text(item).includes(label))!;
}

async function click(element: ReactElement<Record<string, unknown>>): Promise<void> {
  await (element.props.onClick as (() => unknown))();
  await Promise.resolve();
}

function baseBridge(overrides: Partial<RendererBridgeAdapter> = {}): RendererBridgeAdapter {
  return contractInput<RendererBridgeAdapter>({
    planning: {
      listStructure: vi.fn(async () => ({ state: 'success' as const, data: structure })),
    },
    providers: {
      list: vi.fn(async () => ({ state: 'success' as const, data: { providers: [provider] } })),
    },
    generation: { start: vi.fn(), getRun: vi.fn() },
    validation: {
      list: vi.fn(async () => ({ state: 'success' as const, data: catalog })),
      runRules: vi.fn(),
      updateIssue: vi.fn(),
      createTodoFromIssue: vi.fn(),
      rememberException: vi.fn(),
      addComment: vi.fn(),
      saveTodo: vi.fn(),
      resolveComment: vi.fn(),
      disableException: vi.fn(),
    },
    ...overrides,
  });
}

function activeValues(): readonly unknown[] {
  return [
    structure,
    catalog,
    [provider],
    provider.id,
    chapterId,
    true,
    false,
    runningRun,
    '检查已就绪。',
  ];
}

async function runQueuedTimers(timers: Array<() => void>, count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    const timer = timers.shift();
    expect(timer).toBeTypeOf('function');
    timer?.();
    await Promise.resolve();
    await Promise.resolve();
  }
}

describe('M11 内容检查轮询边界覆盖', () => {
  it('覆盖轮询失败/异常、筛选变更、阶段文案和卸载竞态', async () => {
    const failure = {
      state: 'failure' as const,
      error: { code: 'MODEL_UNAVAILABLE' as const, message: '轮询失败', retryable: true },
    };
    const timers: Array<() => void> = [];
    vi.stubGlobal('window', {
      prompt: vi.fn(),
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((handler: () => void) => {
        timers.push(handler);
        return timers.length;
      }),
    });
    const getRun = vi.fn(async () => failure);
    const start = vi.fn();
    for (const stage of ['queued', 'streaming', 'validating', 'unexpected-stage']) {
      start.mockResolvedValueOnce({
        state: 'success' as const,
        data: { run: contractInput<GenerationRun>({ ...runningRun, stage }) },
      });
    }
    const bridge = baseBridge({ generation: { start, getRun } });
    reset(activeValues());
    const tree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: vi.fn() });

    const selects = elements(tree, 'select');
    const checkbox = elements(tree, 'input').find((item) => item.props.type === 'checkbox')!;
    (selects[0]!.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: '' },
    });
    (selects[1]!.props.onChange as (event: { target: { value: string } }) => void)({
      target: { value: 'provider-2' },
    });
    (checkbox.props.onChange as (event: { target: { checked: boolean } }) => void)({
      target: { checked: false },
    });
    expect(hooks.setters[4]).toHaveBeenCalledWith('');
    expect(hooks.setters[3]).toHaveBeenCalledWith('provider-2');
    expect(hooks.setters[5]).toHaveBeenCalledWith(false);

    const cleanup = hooks.effects[2]?.();
    await runQueuedTimers(timers, 5);
    expect(getRun).toHaveBeenCalledTimes(5);
    expect(hooks.setters[7]).toHaveBeenCalledWith(null);
    expect(hooks.setters[6]).toHaveBeenCalledWith(false);
    expect(hooks.setters[8]).toHaveBeenCalledWith(expect.stringContaining('自动重试已停止'));
    (cleanup as (() => void) | undefined)?.();

    for (const expected of ['等待开始', '正在接收内容', '正在检查结果', '处理中']) {
      await click(button(tree, '运行智能语义检查'));
      expect(hooks.setters[8]).toHaveBeenLastCalledWith(expect.stringContaining(expected));
    }

    const rejectedTimers: Array<() => void> = [];
    vi.stubGlobal('window', {
      prompt: vi.fn(),
      clearTimeout: vi.fn(),
      setTimeout: vi.fn((handler: () => void) => {
        rejectedTimers.push(handler);
        return rejectedTimers.length;
      }),
    });
    const rejectedBridge = baseBridge({
      generation: {
        start: vi.fn(),
        getRun: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
    });
    reset(activeValues());
    ChecksWorkbench({ bridge: rejectedBridge, projectId, readOnly: false, onNavigate: vi.fn() });
    const rejectedCleanup = hooks.effects[2]?.();
    await runQueuedTimers(rejectedTimers, 5);
    expect(hooks.setters[8]).toHaveBeenCalledWith(
      '智能语义检查状态暂时无法读取，将自动重试。',
    );
    expect(hooks.setters[8]).toHaveBeenCalledWith(
      '智能语义检查状态连续无法读取。自动重试已停止，请重新运行。',
    );
    (rejectedCleanup as (() => void) | undefined)?.();

    let resolveStructure!: (value: { state: 'success'; data: ProjectStructure }) => void;
    const delayedStructure = new Promise<{ state: 'success'; data: ProjectStructure }>((resolve) => {
      resolveStructure = resolve;
    });
    const delayedBridge = baseBridge({
      planning: { listStructure: vi.fn(() => delayedStructure) },
    });
    reset([null, null, [], '', '', true, false, null, '检查已就绪。']);
    ChecksWorkbench({ bridge: delayedBridge, projectId, readOnly: false, onNavigate: vi.fn() });
    const loadCleanup = hooks.effects[0]?.();
    (loadCleanup as (() => void) | undefined)?.();
    resolveStructure({ state: 'success', data: structure });
    await Promise.resolve();
    await Promise.resolve();
    expect(hooks.setters[0]).not.toHaveBeenCalledWith(structure);
  });
});
