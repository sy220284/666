import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  GenerationRun,
  IdeaCard,
  IdeaConversionPreview,
  IdeaConversionTarget,
  ProjectStructure,
  ProviderSummary,
} from '@worldforge/contracts';
import type { ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { IdeaCapsulePanel } from '../../apps/desktop/renderer/src/features/planning/idea-capsule-panel.js';
import { installRendererHookDispatcher } from '../testkit/renderer-hook-dispatcher.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type Effect = () => void | (() => void);

const hooks = {
  states: [] as unknown[],
  index: 0,
  effects: [] as Effect[],
};
const ideaClient = vi.hoisted(() => ({
  run: vi.fn(),
  cancel: vi.fn(),
}));
let restoreDispatcher: (() => void) | null = null;

vi.mock('../../apps/desktop/renderer/src/bridge/idea-capsule-client.js', () => ({
  runIdeaCapsuleOperation: ideaClient.run,
  cancelIdeaCapsuleRequests: ideaClient.cancel,
}));

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const runId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const targetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const now = '2026-08-12T11:00:00.000Z';

function idea(
  id: string,
  ideaKind: IdeaCard['ideaKind'],
  status: IdeaCard['status'],
  content = '用于覆盖灵感胶囊的作者可见内容。',
): IdeaCard {
  return contractInput<IdeaCard>({
    id,
    projectId,
    ideaKind,
    title: `${ideaKind}-${status}`,
    summary: `${ideaKind} 摘要`,
    content,
    divergenceLevel: ideaKind === 'ending' ? 'wild' : 'different',
    depthLevel: ideaKind === 'new_book' ? 'deep' : 'expand',
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
  idea('10000000-0000-4000-8000-000000000001', 'new_book', 'active'),
  idea('10000000-0000-4000-8000-000000000002', 'character', 'favorite'),
  idea('10000000-0000-4000-8000-000000000003', 'worldbuilding', 'active'),
  idea('10000000-0000-4000-8000-000000000004', 'foreshadowing', 'active'),
  idea('10000000-0000-4000-8000-000000000005', 'twist', 'converted'),
  idea('10000000-0000-4000-8000-000000000006', 'ending', 'discarded', '结局'.repeat(700)),
] as const;

const projectBriefTarget: IdeaConversionTarget = {
  targetType: 'project_brief',
  draft: {
    concept: '新核心',
    readingPromise: '新的阅读承诺',
    protagonistGoal: '',
    coreConflict: '',
    endingIntent: '',
    required: [],
    forbidden: [],
  },
};

const initialPreview: IdeaConversionPreview = {
  projectId,
  ideaId: ideas[0].id,
  ideaUpdatedAt: now,
  target: projectBriefTarget,
  previewHash: 'a'.repeat(64),
  summary: '将灵感转换为作品核心。',
};

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

function configureStates(values: readonly unknown[]): void {
  restoreDispatcher?.();
  hooks.states = [...values];
  hooks.index = 0;
  hooks.effects = [];
  restoreDispatcher = installRendererHookDispatcher(hooks);
}

function richStates(overrides: Partial<Record<number, unknown>> = {}): unknown[] {
  const values: unknown[] = [
    ideas,
    { updatedAt: now, id: ideas.at(-1)!.id },
    'success',
    'all',
    providers,
    'provider-a',
    structure,
    'chapter',
    chapterId,
    'ending',
    'wild',
    'deep',
    '继续探索这条线索',
    8,
    null,
    null,
    '当前状态',
    initialPreview,
    ideas[0].id,
    '作品核心 · 目标已删除',
  ];
  for (const [index, value] of Object.entries(overrides)) values[Number(index)] = value;
  return values;
}

interface ElementProps extends Record<string, unknown> {
  readonly children?: unknown;
}

type TestElement = ReactElement<ElementProps>;

function isElement(value: unknown): value is TestElement {
  return typeof value === 'object' && value !== null && 'props' in value;
}

function descendants(node: unknown, result: TestElement[] = []): TestElement[] {
  if (Array.isArray(node)) {
    for (const item of node) descendants(item, result);
    return result;
  }
  if (!isElement(node)) return result;
  result.push(node);
  descendants(node.props.children, result);
  return result;
}

function text(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return isElement(node) ? text(node.props.children) : '';
}

function buttons(root: TestElement, label: string): TestElement[] {
  return descendants(root).filter(
    (element) => element.type === 'button' && text(element) === label,
  );
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

async function invokeAll(elements: readonly TestElement[], property: string): Promise<void> {
  for (const element of elements) {
    const handler = element.props[property];
    if (typeof handler === 'function') {
      handler();
      await flush();
    }
  }
}

function bridge(getRunState: 'success' | 'failure' | 'stale' = 'success'): RendererBridgeAdapter {
  const completedRun = contractInput<GenerationRun>({
    runId,
    projectId,
    status: 'succeeded',
    stage: 'completed',
  });
  return contractInput<RendererBridgeAdapter>({
    providers: {
      list: vi.fn(async () => ({ state: 'success', data: { providers } })),
    },
    planning: {
      listStructure: vi.fn(async () => ({ state: 'success', data: structure })),
    },
    generation: {
      start: vi.fn(async () => ({ state: 'success', data: { run: completedRun } })),
      getRun: vi.fn(async () =>
        getRunState === 'success'
          ? { state: 'success', data: completedRun }
          : getRunState === 'failure'
            ? {
                state: 'failure',
                error: { code: 'GENERATION_FAILED', message: '读取失败', retryable: true },
              }
            : { state: 'stale' },
      ),
    },
  });
}

beforeEach(() => {
  ideaClient.run.mockReset();
  ideaClient.cancel.mockReset();
  ideaClient.run.mockImplementation(async (request: unknown) => {
    const operation = contractInput<{
      operation: string;
      input: Record<string, unknown>;
    }>(request);
    const ideaId = String(operation.input.ideaId ?? ideas[0].id);
    const selected = ideas.find((item) => item.id === ideaId) ?? ideas[0];
    if (operation.operation === 'idea.list') {
      return { state: 'success', data: { projectId, ideas, nextCursor: null } };
    }
    if (operation.operation === 'idea.get') {
      return {
        state: 'success',
        data: {
          idea: selected,
          conversion:
            selected.id === ideas[0].id
              ? {
                  id: '30000000-0000-4000-8000-000000000001',
                  projectId,
                  ideaId: selected.id,
                  targetType: 'project_brief',
                  targetId,
                  previewHash: 'b'.repeat(64),
                  status: 'target_missing',
                  createdAt: now,
                }
              : null,
        },
      };
    }
    if (operation.operation === 'idea.previewConversion') {
      return {
        state: 'success',
        data: {
          projectId,
          ideaId,
          ideaUpdatedAt: now,
          target: operation.input.target,
          previewHash: 'c'.repeat(64),
          summary: '转换预览',
        },
      };
    }
    if (operation.operation === 'idea.applyConversion') {
      return {
        state: 'success',
        data: {
          idea: { ...selected, status: 'converted' },
          conversion: {
            id: '30000000-0000-4000-8000-000000000002',
            projectId,
            ideaId,
            targetType: 'project_brief',
            targetId,
            previewHash: 'a'.repeat(64),
            status: 'applied',
            createdAt: now,
          },
        },
      };
    }
    return { state: 'success', data: selected };
  });
});

afterEach(() => {
  restoreDispatcher?.();
  restoreDispatcher = null;
  vi.unstubAllGlobals();
});

describe('M11-05 Idea Capsule renderer branch coverage', () => {
  it('renders populated editable state and executes every author action path', async () => {
    configureStates(richStates());
    const onNavigate = vi.fn();
    const root = IdeaCapsulePanel({
      bridge: bridge(),
      projectId,
      readOnly: false,
      onNavigate,
    }) as TestElement;

    expect(text(root)).toContain('灵感胶囊');
    expect(text(root)).toContain('加载更多');
    expect(text(root)).toContain('确认转换');
    expect(descendants(root).filter((element) => element.type === 'article')).toHaveLength(
      ideas.length,
    );

    for (const element of descendants(root)) {
      const onChange = element.props.onChange;
      if (typeof onChange !== 'function') continue;
      const current = element.props.value;
      const value =
        element.type === 'input'
          ? '99'
          : element.type === 'textarea'
            ? '新的探索方向'
            : current === 'chapter'
              ? 'project'
              : current === 'all'
                ? 'favorite'
                : String(current ?? 'active');
      onChange({ target: { value } });
    }

    await invokeAll(buttons(root, '开始探索'), 'onClick');
    await invokeAll(buttons(root, '刷新灵感'), 'onClick');
    await invokeAll(buttons(root, '详情'), 'onClick');
    await invokeAll(buttons(root, '收藏'), 'onClick');
    await invokeAll(buttons(root, '取消收藏'), 'onClick');
    await invokeAll(buttons(root, '继续探索'), 'onClick');
    await invokeAll(buttons(root, '转换'), 'onClick');
    await invokeAll(buttons(root, '丢弃'), 'onClick');
    await invokeAll(buttons(root, '加载更多'), 'onClick');
    await invokeAll(buttons(root, '确认转换'), 'onClick');
    await invokeAll(buttons(root, '取消'), 'onClick');

    for (const effect of hooks.effects.slice(0, 2)) effect();
    await flush();

    expect(ideaClient.run).toHaveBeenCalled();
    expect(onNavigate).toHaveBeenCalledWith({
      type: 'project-brief',
      projectId,
      briefId: targetId,
    });
  });

  it('covers read-only, failure, empty-source and terminal polling states', async () => {
    const activeRun = contractInput<GenerationRun>({
      runId,
      projectId,
      status: 'running',
      stage: 'generating',
    });
    configureStates(
      richStates({
        0: [],
        1: null,
        2: 'failure',
        4: [],
        5: '',
        6: null,
        7: 'project',
        8: '',
        12: '',
        14: activeRun,
        15: 'busy',
        17: null,
        18: null,
        19: null,
      }),
    );
    const timers: Array<() => void> = [];
    vi.stubGlobal('window', {
      setTimeout: vi.fn((callback: () => void) => {
        timers.push(callback);
        return timers.length;
      }),
      clearTimeout: vi.fn(),
    });
    const root = IdeaCapsulePanel({
      bridge: bridge(),
      projectId,
      readOnly: true,
      onNavigate: vi.fn(),
    }) as TestElement;

    expect(text(root)).toContain('探索进行中');
    expect(text(root)).toContain('重新读取');
    await invokeAll(buttons(root, '重新读取'), 'onClick');
    await invokeAll(buttons(root, '开始探索'), 'onClick');

    const effects = [...hooks.effects];
    for (const effect of effects) effect();
    await flush();
    for (const callback of timers.splice(0)) callback();
    await flush();

    expect(ideaClient.cancel).not.toHaveBeenCalled();
  });

  it('covers stale and failed operation outcomes without accepting malformed data', async () => {
    ideaClient.run
      .mockResolvedValueOnce({ state: 'failure', error: { code: 'IDEA_INVALID', message: '失败' } })
      .mockResolvedValueOnce({ state: 'success', data: { malformed: true } })
      .mockResolvedValue({ state: 'stale' });
    configureStates(richStates({ 2: 'loading', 17: null, 18: null, 19: null }));
    const root = IdeaCapsulePanel({
      bridge: bridge('failure'),
      projectId,
      readOnly: false,
      onNavigate: vi.fn(),
    }) as TestElement;

    await invokeAll(buttons(root, '刷新灵感'), 'onClick');
    await invokeAll(buttons(root, '详情'), 'onClick');
    await invokeAll(buttons(root, '转换'), 'onClick');

    expect(ideaClient.run).toHaveBeenCalled();
  });
});
