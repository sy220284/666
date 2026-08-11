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
import type { AuthorNavigationTarget } from '../../apps/desktop/renderer/src/shell/navigation-target.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const hookHarness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  stateIndex: 0,
  stateValues: [] as unknown[],
  setters: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock(
  '../../apps/desktop/renderer/src/features/checks/react-hooks.js',
  async (importOriginal) => {
    const actual = await importOriginal<typeof ChecksReactHooks>();
    return {
      ...actual,
      useCallback: <T>(callback: T): T => callback,
      useEffect: (effect: () => void | (() => void)): void => {
        hookHarness.effects.push(effect);
      },
      useMemo: <T>(factory: () => T): T => factory(),
      useState: (): readonly [unknown, ReturnType<typeof vi.fn>] => {
        const index = hookHarness.stateIndex++;
        const setter = vi.fn();
        hookHarness.setters.push(setter);
        return [hookHarness.stateValues[index], setter] as const;
      },
    };
  },
);

import { ChecksWorkbench } from '../../apps/desktop/renderer/src/features/checks/checks-workbench.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const volumeId = '22222222-2222-4222-8222-222222222222';
const chapterId = '33333333-3333-4333-8333-333333333333';
const versionId = '44444444-4444-4444-8444-444444444444';
const issueId = '55555555-5555-4555-8555-555555555555';
const blockId = '66666666-6666-4666-8666-666666666666';
const structure = contractInput<ProjectStructure>({
  projectId,
  volumes: [
    {
      id: volumeId,
      projectId,
      title: '第一卷',
      orderKey: '1',
      status: 'writing',
      deletedAt: null,
      chapters: [
        {
          id: chapterId,
          volumeId,
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

const provider = contractInput<ProviderSummary>({
  id: 'provider-1',
  name: '本地AI',
});

const catalog = contractInput<ValidationCatalog>({
  projectId,
  batches: [
    {
      batchId: '77777777-7777-4777-8777-777777777777',
      semanticFreshness: 'current',
    },
  ],
  issues: [
    {
      issueId,
      batchId: '77777777-7777-4777-8777-777777777777',
      issueType: 'timeline',
      source: 'rule',
      severity: 'high',
      rationale: '同一人物同时出现在两地。',
      evidenceIds: ['event:1', 'event:2'],
      currentEvidenceIds: ['event:1'],
      conflictEvidenceIds: ['event:2'],
      suggestion: '调整其中一个事件的时间。',
      status: 'open',
      anchor: {
        chapterId,
        versionId,
        logicalBlockId: blockId,
        textQuote: '他同时出现在城南与城北。',
        state: 'current',
      },
    },
  ],
  todos: [
    {
      todoId: '88888888-8888-4888-8888-888888888888',
      chapterId,
      sceneBeatId: null,
      logicalBlockId: blockId,
      title: '修正人物位置',
      status: 'open',
    },
  ],
  comments: [
    {
      commentId: '99999999-9999-4999-8999-999999999999',
      chapterId,
      logicalBlockId: blockId,
      body: '检查倒叙标识。',
      status: 'open',
    },
  ],
  exceptions: [
    {
      exceptionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      exceptionType: 'flashback',
      notes: '本章采用倒叙。',
      active: true,
    },
  ],
});

const runningRun = contractInput<GenerationRun>({
  runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  status: 'running',
  stage: 'calling_model',
});
const succeededRun = contractInput<GenerationRun>({
  ...runningRun,
  status: 'succeeded',
  stage: 'persisting',
});

function resetHooks(values: readonly unknown[]): void {
  hookHarness.effects = [];
  hookHarness.stateIndex = 0;
  hookHarness.stateValues = [...values];
  hookHarness.setters = [];
}

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  if (Array.isArray(node)) return node.map(textContent).join('');
  const element = node as ReactElement<{ readonly children?: ReactNode }>;
  return textContent(element.props?.children);
}

function elements(root: ReactNode, type: string): ReactElement<Record<string, unknown>>[] {
  const matches: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.type === type) matches.push(element);
    visit(element.props.children as ReactNode);
  };
  visit(root);
  return matches;
}

function buttons(root: ReactNode, label: string): ReactElement<Record<string, unknown>>[] {
  return elements(root, 'button').filter((button) => textContent(button).includes(label));
}

async function invoke(
  element: ReactElement<Record<string, unknown>>,
  prop = 'onClick',
): Promise<void> {
  const handler = element.props[prop] as (() => unknown) | undefined;
  expect(handler).toBeTypeOf('function');
  await handler?.();
  await Promise.resolve();
}

describe('M11 内容检查工作台交互覆盖', () => {
  it('贯通加载、检查、问题处置、例外、待办、批注与原文跳转', async () => {
    const listStructure = vi.fn(async () => ({ state: 'success' as const, data: structure }));
    const listProviders = vi.fn(async () => ({
      state: 'success' as const,
      data: { providers: [provider] },
    }));
    const listValidation = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const runRules = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const updateIssue = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const createTodoFromIssue = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const rememberException = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const addComment = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const saveTodo = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const resolveComment = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const disableException = vi.fn(async () => ({ state: 'success' as const, data: catalog }));
    const start = vi.fn(async () => ({ state: 'success' as const, data: { run: runningRun } }));
    const getRun = vi.fn(async () => ({ state: 'success' as const, data: succeededRun }));
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: { listStructure },
      providers: { list: listProviders },
      generation: { start, getRun },
      validation: {
        list: listValidation,
        runRules,
        updateIssue,
        createTodoFromIssue,
        rememberException,
        addComment,
        saveTodo,
        resolveComment,
        disableException,
      },
    });
    const navigate = vi.fn<(target: AuthorNavigationTarget) => void>();
    const prompt = vi
      .fn()
      .mockReturnValueOnce('作者有意')
      .mockReturnValueOnce('这是作者确认的倒叙。')
      .mockReturnValueOnce('保留伏笔语气。');
    const setTimeout = vi.fn((handler: () => void) => {
      handler();
      return 1;
    });
    vi.stubGlobal('window', { clearTimeout: vi.fn(), prompt, setTimeout });

    resetHooks([
      structure,
      catalog,
      [provider],
      provider.id,
      chapterId,
      true,
      false,
      runningRun,
      '检查已就绪。',
    ]);

    const tree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: navigate });
    const cleanups = hookHarness.effects.map((effect) => effect()).filter(Boolean);
    await Promise.resolve();
    await Promise.resolve();

    await invoke(buttons(tree, '运行规则检查')[0]!);
    await invoke(buttons(tree, '运行AI语义检查')[0]!);
    for (const label of [
      '标记已处理',
      '忽略本项',
      '停用此规则',
      '降低重要程度',
      '标记为误报',
      '重新打开',
    ]) {
      await invoke(buttons(tree, label)[0]!);
    }
    await invoke(buttons(tree, '记住这个例外')[0]!);
    await invoke(buttons(tree, '转为修改任务')[0]!);
    await invoke(buttons(tree, '添加批注')[0]!);
    for (const button of buttons(tree, '前往原文')) await invoke(button);
    await invoke(buttons(tree, '标记完成')[0]!);
    await invoke(buttons(tree, '标记批注已处理')[0]!);
    await invoke(buttons(tree, '停用此例外')[0]!);

    expect(listStructure).toHaveBeenCalledWith(projectId, { mode: 'replace' });
    expect(listProviders).toHaveBeenCalled();
    expect(listValidation).toHaveBeenCalled();
    expect(getRun).toHaveBeenCalledWith(projectId, runningRun.runId, { mode: 'share' });
    expect(runRules).toHaveBeenCalledWith({ projectId, sourceVersionId: versionId });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ providerId: provider.id }));
    expect(updateIssue).toHaveBeenCalledTimes(6);
    expect(rememberException).toHaveBeenCalledWith(
      expect.objectContaining({ exceptionType: 'intentional_exception', scopeType: 'issue' }),
    );
    expect(createTodoFromIssue).toHaveBeenCalledWith({ projectId, issueId });
    expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ body: '保留伏笔语气。' }));
    expect(saveTodo).toHaveBeenCalled();
    expect(resolveComment).toHaveBeenCalled();
    expect(disableException).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledTimes(3);

    for (const cleanup of cleanups) (cleanup as () => void)();
  });
});
