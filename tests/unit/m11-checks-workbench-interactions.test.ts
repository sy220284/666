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

vi.mock('../../apps/desktop/renderer/src/runtime/author-dialog.js', () => ({
  authorPrompt: async ({ title, initialValue }: { title: string; initialValue?: string }) =>
    window.prompt(title, initialValue),
  authorSelect: async ({ title, initialValue }: { title: string; initialValue?: string }) =>
    window.prompt(title, initialValue),
}));

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
      useRef: <T>(initial: T): { current: T } => ({ current: initial }),
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
  name: '本地智能模型',
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
  it('keeps four author sections mounted while switching the visible work area', async () => {
    const bridge = contractInput<RendererBridgeAdapter>({});
    resetHooks([
      structure,
      catalog,
      [provider],
      provider.id,
      chapterId,
      true,
      false,
      null,
      '检查已就绪。',
      'open',
      'validation',
      '伏笔',
      'timeline',
      '主角',
      new Set([catalog.comments[0]!.commentId]),
      'checks',
    ]);

    const tree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: vi.fn() });
    const sectionButtons = elements(tree, 'button').filter(
      (button) => button.props['data-checks-section'] !== undefined,
    );
    expect(sectionButtons.map((button) => button.props['data-checks-section'])).toEqual([
      'checks',
      'search',
      'rhythm',
      'review',
    ]);

    const sectionPanels = [...elements(tree, 'section'), ...elements(tree, 'div')].filter(
      (panel) => panel.props['data-checks-section-panel'] !== undefined,
    );
    expect(
      sectionPanels.map((panel) => ({
        section: panel.props['data-checks-section-panel'],
        hidden: panel.props.hidden,
      })),
    ).toEqual([
      { section: 'search', hidden: true },
      { section: 'rhythm', hidden: true },
      { section: 'review', hidden: true },
      { section: 'checks', hidden: false },
    ]);

    for (const button of sectionButtons) await invoke(button);
    expect(hookHarness.setters[15]?.mock.calls).toEqual([
      ['checks'],
      ['search'],
      ['rhythm'],
      ['review'],
    ]);
    expect(hookHarness.stateValues.slice(9, 15)).toEqual([
      'open',
      'validation',
      '伏笔',
      'timeline',
      '主角',
      new Set([catalog.comments[0]!.commentId]),
    ]);
  });

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
    await invoke(buttons(tree, '运行智能语义检查')[0]!);
    for (const label of [
      '标记已处理',
      '忽略本项',
      '静音本条问题',
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

  it('覆盖加载失败、只读保护与无原文定位分支', async () => {
    const failure = {
      state: 'failure' as const,
      error: { code: 'MODEL_UNAVAILABLE' as const, message: '连接失败', retryable: true },
    };
    const runRules = vi.fn(async () => failure);
    const start = vi.fn(async () => failure);
    const updateIssue = vi.fn(async () => failure);
    const createTodoFromIssue = vi.fn(async () => failure);
    const rememberException = vi.fn(async () => failure);
    const addComment = vi.fn(async () => failure);
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: { listStructure: vi.fn(async () => failure) },
      providers: { list: vi.fn(async () => failure) },
      generation: { start, getRun: vi.fn(async () => ({ state: 'cancelled' as const })) },
      validation: {
        list: vi.fn(async () => failure),
        runRules,
        updateIssue,
        createTodoFromIssue,
        rememberException,
        addComment,
        saveTodo: vi.fn(async () => failure),
        resolveComment: vi.fn(async () => failure),
        disableException: vi.fn(async () => failure),
      },
    });
    const navigate = vi.fn<(target: AuthorNavigationTarget) => void>();
    const prompt = vi.fn();
    const scheduled: Array<() => void> = [];
    vi.stubGlobal('window', {
      prompt,
      setTimeout: vi.fn((handler: () => void) => {
        scheduled.push(handler);
        return scheduled.length;
      }),
      clearTimeout: vi.fn(),
    });

    resetHooks([
      structure,
      catalog,
      [provider],
      provider.id,
      chapterId,
      false,
      false,
      runningRun,
      '检查已就绪。',
    ]);
    const readOnlyTree = ChecksWorkbench({
      bridge,
      projectId,
      readOnly: true,
      onNavigate: navigate,
    });
    const cleanups = hookHarness.effects.map((effect) => effect()).filter(Boolean);
    await Promise.resolve();
    await Promise.resolve();

    await invoke(buttons(readOnlyTree, '运行规则检查')[0]!);
    await invoke(buttons(readOnlyTree, '运行智能语义检查')[0]!);
    await invoke(buttons(readOnlyTree, '标记已处理')[0]!);
    await invoke(buttons(readOnlyTree, '转为修改任务')[0]!);
    await invoke(buttons(readOnlyTree, '记住这个例外')[0]!);
    await invoke(buttons(readOnlyTree, '添加批注')[0]!);
    expect(runRules).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(updateIssue).not.toHaveBeenCalled();
    expect(createTodoFromIssue).not.toHaveBeenCalled();
    expect(rememberException).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
    expect(prompt).not.toHaveBeenCalled();

    expect(hookHarness.setters[8]).toHaveBeenCalledWith(expect.stringContaining('章节读取失败'));
    expect(scheduled).not.toHaveLength(0);
    scheduled[0]?.();
    await Promise.resolve();
    await Promise.resolve();
    expect(hookHarness.setters[6]).toHaveBeenCalledWith(false);
    expect(hookHarness.setters[8]).toHaveBeenCalledWith('智能语义检查状态读取已取消。');

    for (const cleanup of cleanups) (cleanup as () => void)();

    const missingAnchorCatalog = contractInput<ValidationCatalog>({
      ...catalog,
      issues: [
        {
          ...catalog.issues[0]!,
          issueType: 'future_rule',
          source: 'ai',
          currentEvidenceIds: [],
          conflictEvidenceIds: [],
          suggestion: null,
          anchor: {
            ...catalog.issues[0]!.anchor,
            chapterId: null,
            versionId: null,
            logicalBlockId: null,
            textQuote: null,
            state: 'stale',
          },
        },
      ],
      todos: [{ ...catalog.todos[0]!, chapterId: null, logicalBlockId: null, status: 'done' }],
      comments: [
        { ...catalog.comments[0]!, chapterId: null, logicalBlockId: null, status: 'done' },
      ],
      exceptions: [
        { ...catalog.exceptions[0]!, exceptionType: 'future_exception', active: false, notes: '' },
      ],
    });
    resetHooks([structure, missingAnchorCatalog, [], '', '', false, false, null, '检查已就绪。']);
    const edgeTree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: navigate });
    for (const jump of buttons(edgeTree, '前往原文')) await invoke(jump);
    expect(navigate).not.toHaveBeenCalled();
    expect(hookHarness.setters[8]).toHaveBeenCalledWith(
      expect.stringContaining('无法进行精准跳转'),
    );
    expect(textContent(edgeTree)).toContain('future rule');
    expect(textContent(edgeTree)).toContain('future_exception');
    expect(textContent(edgeTree)).toContain('已完成');
    expect(textContent(edgeTree)).toContain('已处理');
    expect(textContent(edgeTree)).toContain('已停用');
  });

  it('覆盖规则/智能检查和作者处置的失败、取消与输入边界', async () => {
    const failure = {
      state: 'failure' as const,
      error: { code: 'MODEL_UNAVAILABLE' as const, message: '连接失败', retryable: true },
    };
    const start = vi
      .fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({ state: 'cancelled' as const });
    const bridge = contractInput<RendererBridgeAdapter>({
      planning: {
        listStructure: vi.fn(async () => ({ state: 'success' as const, data: structure })),
      },
      providers: {
        list: vi.fn(async () => ({ state: 'success' as const, data: { providers: [provider] } })),
      },
      generation: { start, getRun: vi.fn() },
      validation: {
        list: vi.fn(async () => failure),
        runRules: vi.fn(async () => failure),
        updateIssue: vi.fn(async () => failure),
        createTodoFromIssue: vi.fn(async () => failure),
        rememberException: vi.fn(async () => failure),
        addComment: vi.fn(async () => failure),
        saveTodo: vi.fn(async () => failure),
        resolveComment: vi.fn(async () => failure),
        disableException: vi.fn(async () => failure),
      },
    });
    const prompt = vi.fn();
    vi.stubGlobal('window', { prompt, setTimeout: vi.fn(), clearTimeout: vi.fn() });
    resetHooks([
      structure,
      catalog,
      [provider],
      provider.id,
      chapterId,
      true,
      false,
      null,
      '检查已就绪。',
    ]);
    const tree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: vi.fn() });

    await invoke(buttons(tree, '运行规则检查')[0]!);
    await invoke(buttons(tree, '运行智能语义检查')[0]!);
    await invoke(buttons(tree, '运行智能语义检查')[0]!);
    await invoke(buttons(tree, '标记已处理')[0]!);
    await invoke(buttons(tree, '转为修改任务')[0]!);
    expect(hookHarness.setters[8]).toHaveBeenCalled();
    expect(hookHarness.setters[6]).toHaveBeenCalledWith(false);

    prompt.mockReturnValueOnce(null);
    await invoke(buttons(tree, '记住这个例外')[0]!);
    prompt.mockReturnValueOnce('完全无法识别的类型');
    await invoke(buttons(tree, '记住这个例外')[0]!);
    expect(hookHarness.setters[8]).toHaveBeenCalledWith('例外类型无法识别，未保存。');
    prompt.mockReturnValueOnce('梦境').mockReturnValueOnce(null);
    await invoke(buttons(tree, '记住这个例外')[0]!);
    expect(bridge.validation.rememberException).toHaveBeenCalledWith(
      expect.objectContaining({ exceptionType: 'dream', notes: '' }),
    );

    prompt.mockReturnValueOnce('   ');
    await invoke(buttons(tree, '添加批注')[0]!);
    const addCallsBefore = vi.mocked(bridge.validation.addComment).mock.calls.length;
    prompt.mockReturnValueOnce('  有效批注  ');
    await invoke(buttons(tree, '添加批注')[0]!);
    expect(vi.mocked(bridge.validation.addComment).mock.calls.length).toBe(addCallsBefore + 1);
    expect(bridge.validation.addComment).toHaveBeenLastCalledWith(
      expect.objectContaining({ body: '有效批注' }),
    );

    await invoke(buttons(tree, '标记完成')[0]!);
    await invoke(buttons(tree, '标记批注已处理')[0]!);
    await invoke(buttons(tree, '停用此例外')[0]!);
    expect(hookHarness.setters[8]).toHaveBeenCalledWith(expect.stringContaining('操作未完成'));
  });

  it('同步拦截同一检查操作的双击，避免累计执行两次', async () => {
    let release!: (value: { state: 'success'; data: ValidationCatalog }) => void;
    const updateIssue = vi.fn(
      () =>
        new Promise<{ state: 'success'; data: ValidationCatalog }>((resolve) => {
          release = resolve;
        }),
    );
    const bridge = contractInput<RendererBridgeAdapter>({
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
        updateIssue,
        createTodoFromIssue: vi.fn(),
        rememberException: vi.fn(),
        addComment: vi.fn(),
        saveTodo: vi.fn(),
        resolveComment: vi.fn(),
        disableException: vi.fn(),
      },
    });
    vi.stubGlobal('window', { prompt: vi.fn(), setTimeout: vi.fn(), clearTimeout: vi.fn() });
    resetHooks([
      structure,
      catalog,
      [provider],
      provider.id,
      chapterId,
      true,
      false,
      null,
      '检查已就绪。',
    ]);
    const tree = ChecksWorkbench({ bridge, projectId, readOnly: false, onNavigate: vi.fn() });
    const downgrade = buttons(tree, '降低重要程度')[0]!;
    const handler = downgrade.props.onClick as () => void;
    handler();
    handler();
    expect(updateIssue).toHaveBeenCalledTimes(1);
    release({ state: 'success', data: catalog });
    await Promise.resolve();
    await Promise.resolve();
  });
});
