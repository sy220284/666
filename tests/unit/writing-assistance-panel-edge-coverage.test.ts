import { createRequire } from 'node:module';

import type { createElement as createReactElement, ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { WritingAssistanceView } from '../../apps/desktop/renderer/src/features/writing/writing-assistance.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const loadWritingAssistance = vi.hoisted(() => vi.fn());

vi.mock('../../apps/desktop/renderer/src/features/writing/writing-assistance.js', () => ({
  loadWritingAssistance,
}));

import { WritingAssistancePanel } from '../../apps/desktop/renderer/src/features/writing/writing-assistance-panel.js';

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
  update(element: ReactElement): void;
  unmount(): void;
}

const bridge = contractInput<RendererBridgeAdapter>({});
const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const onNavigate = vi.fn();
const onOpenAssistant = vi.fn();

function richView(): WritingAssistanceView {
  return contractInput<WritingAssistanceView>({
    chapterId,
    chapterTitle: '雨夜重逢',
    goal: {
      title: '章纲标题',
      goal: '',
      coreConflict: '',
      expectedResult: '',
    },
    sceneBeats: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: '必须场景',
        required: true,
        wordTargetPercent: 60,
        goal: '',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: '可选场景',
        required: false,
        wordTargetPercent: 40,
        goal: '确认身份',
      },
    ],
    characters: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        name: '阿灯',
        summary: '雨夜负伤。',
        states: [{ key: '位置', value: '旧桥' }],
        knowledge: [
          { information: '铜铃是暗号', status: 'knows' },
          { information: '来者身份', status: 'mystery' },
        ],
      },
      {
        id: '66666666-6666-4666-8666-666666666666',
        name: '守灯人',
        summary: '',
        states: [],
        knowledge: [],
      },
    ],
    foreshadowings: [
      {
        id: '77777777-7777-4777-8777-777777777777',
        title: '铜铃回响',
        status: 'planted',
        attention: 'high',
        description: '需要在本章回应。',
      },
      {
        id: '88888888-8888-4888-8888-888888888888',
        title: '旧约',
        status: 'planned',
        attention: 'normal',
        description: '',
      },
    ],
    todos: [
      {
        todoId: '99999999-9999-4999-8999-999999999999',
        title: '补一处动作',
        chapterId,
        sceneBeatId: '33333333-3333-4333-8333-333333333333',
        logicalBlockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ],
    previousEnding: {
      chapterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      chapterTitle: '前章',
      text: '雨停之前，他听见了铜铃。',
      source: 'final-version',
    },
    warnings: ['上一章部分资料暂不可用'],
  });
}

function emptyView(): WritingAssistanceView {
  return contractInput<WritingAssistanceView>({
    chapterId,
    chapterTitle: '空章',
    goal: null,
    sceneBeats: [],
    characters: [],
    foreshadowings: [],
    todos: [],
    previousEnding: null,
    warnings: [],
  });
}

function panel(options: { readOnly?: boolean; savedRevision?: number | null } = {}): ReactElement {
  return createElement(WritingAssistancePanel, {
    bridge,
    projectId,
    chapterId,
    savedRevision: options.savedRevision === undefined ? 12 : options.savedRevision,
    readOnly: options.readOnly ?? false,
    onNavigate,
    onOpenAssistant,
  });
}

function textContent(node: TestInstance): string {
  return node.children
    .map((child) => (typeof child === 'string' ? child : textContent(child)))
    .join('');
}

function findButton(renderer: TestRenderer, label: string): TestInstance {
  const node = renderer.root.findAll(
    (candidate) => candidate.type === 'button' && textContent(candidate) === label,
  )[0];
  if (!node) throw new Error(`Missing button: ${label}`);
  return node;
}

async function click(node: TestInstance): Promise<void> {
  const handler = node.props.onClick;
  if (typeof handler !== 'function') throw new Error('Missing onClick callback.');
  await act(async () => {
    await handler();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
});

describe('WritingAssistancePanel edge coverage', () => {
  it('renders rich assistance data, fallbacks and navigation callbacks', async () => {
    loadWritingAssistance.mockResolvedValueOnce(richView());
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(panel());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(loadWritingAssistance).toHaveBeenCalledWith(bridge, projectId, chapterId);
    expect(textContent(renderer.root)).toContain('当前稿已保存 · 保存序号 12');
    expect(textContent(renderer.root)).toContain('章纲标题');
    expect(textContent(renderer.root)).toContain('尚未填写');
    expect(textContent(renderer.root)).toContain('必须完成');
    expect(textContent(renderer.root)).toContain('尚未填写目标');
    expect(textContent(renderer.root)).toContain('雨夜负伤。');
    expect(textContent(renderer.root)).toContain('位置：旧桥');
    expect(textContent(renderer.root)).toContain('铜铃是暗号：已经知晓');
    expect(textContent(renderer.root)).toContain('来者身份：状态未知');
    expect(textContent(renderer.root)).toContain('当前章节没有已记录的动态状态。');
    expect(textContent(renderer.root)).toContain('需要在本章回应。');
    expect(textContent(renderer.root)).toContain('修改任务：补一处动作');
    expect(textContent(renderer.root)).toContain('前章 · 定稿');
    expect(textContent(renderer.root)).toContain('上一章部分资料暂不可用');

    await click(findButton(renderer, '智能助手'));
    expect(onOpenAssistant).toHaveBeenCalledOnce();

    const sceneButtons = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '查看场景',
    );
    await click(sceneButtons[0]!);
    expect(onNavigate).toHaveBeenCalledWith({
      type: 'scene-beat',
      projectId,
      chapterId,
      sceneBeatId: '33333333-3333-4333-8333-333333333333',
    });

    const foreshadowButtons = renderer.root.findAll(
      (node) => node.type === 'button' && textContent(node) === '查看伏笔',
    );
    await click(foreshadowButtons[0]!);
    expect(onNavigate).toHaveBeenCalledWith({
      type: 'foreshadowing',
      projectId,
      foreshadowingId: '77777777-7777-4777-8777-777777777777',
      chapterId,
      query: '铜铃回响',
    });

    await click(findButton(renderer, '查看任务位置'));
    expect(onNavigate).toHaveBeenCalledWith({
      type: 'story-todo',
      projectId,
      todoId: '99999999-9999-4999-8999-999999999999',
      chapterId,
      sceneBeatId: '33333333-3333-4333-8333-333333333333',
      logicalBlockId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });

    await act(async () => renderer.unmount());
  });

  it('renders empty/read-only/current-draft branches and refreshes successfully', async () => {
    const currentDraft = {
      ...richView(),
      previousEnding: {
        chapterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        chapterTitle: '前章',
        text: '当前草稿末尾。',
        source: 'current-draft' as const,
      },
      warnings: [],
    };
    loadWritingAssistance
      .mockResolvedValueOnce(emptyView())
      .mockResolvedValueOnce(contractInput<WritingAssistanceView>(currentDraft));

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(panel({ readOnly: true, savedRevision: null }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('只读浏览 · 写作辅助来自已保存数据');
    expect(textContent(renderer.root)).toContain('尚未关联章节大纲，可继续自由写作。');
    expect(textContent(renderer.root)).toContain('当前章节尚无场景。');
    expect(textContent(renderer.root)).toContain('场景尚未关联人物。');
    expect(textContent(renderer.root)).toContain('当前没有待处理事项。');
    expect(textContent(renderer.root)).toContain('没有可用的上一章内容。');

    await click(findButton(renderer, '刷新'));
    expect(textContent(renderer.root)).toContain('前章 · 当前稿');
    expect(loadWritingAssistance).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer.update(panel({ readOnly: false, savedRevision: null }));
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('当前稿已保存 · 保存序号 0');

    await act(async () => renderer.unmount());
  });

  it('covers failed refresh and stale success/failure generations', async () => {
    const first = deferred<WritingAssistanceView>();
    const second = deferred<WritingAssistanceView>();
    const third = deferred<WritingAssistanceView>();
    loadWritingAssistance
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);

    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(panel());
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('正在汇总本章规划与前后文…');
    expect(findButton(renderer, '刷新').props.disabled).toBe(true);

    await click(findButton(renderer, '刷新'));
    await click(findButton(renderer, '刷新'));
    first.resolve(richView());
    await act(async () => {
      await first.promise;
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).not.toContain('雨夜重逢');

    second.reject(new Error('stale failure'));
    await act(async () => {
      try {
        await second.promise;
      } catch {
        // The component intentionally ignores this stale failure.
      }
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('正在汇总本章规划与前后文…');

    third.reject(new Error('current failure'));
    await act(async () => {
      try {
        await third.promise;
      } catch {
        // The component converts the current failure into UI state.
      }
      await Promise.resolve();
    });
    expect(textContent(renderer.root)).toContain('写作辅助暂时无法读取，正文编辑和保存不受影响。');

    await act(async () => renderer.unmount());
  });

  it('invalidates an in-flight request on unmount', async () => {
    const pending = deferred<WritingAssistanceView>();
    loadWritingAssistance.mockImplementationOnce(() => pending.promise);
    let renderer!: TestRenderer;
    await act(async () => {
      renderer = create(panel());
      await Promise.resolve();
    });
    await act(async () => renderer.unmount());
    pending.resolve(richView());
    await act(async () => {
      await pending.promise;
      await Promise.resolve();
    });
  });
});
