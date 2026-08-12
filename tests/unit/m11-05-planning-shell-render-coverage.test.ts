import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReactElement } from 'react';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  AppShellPages,
  type AppShellPagesProps,
} from '../../apps/desktop/renderer/src/app/app-shell-pages.js';
import { PlanningWorkbench } from '../../apps/desktop/renderer/src/features/planning/planning-workbench.js';
import { installRendererHookDispatcher } from '../testkit/renderer-hook-dispatcher.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

type Effect = () => void | (() => void);

const hooks = {
  states: [] as unknown[],
  index: 0,
  effects: [] as Effect[],
};
const ui = vi.hoisted(() => ({
  state: {
    selection: { chapterId: null as string | null, sceneBeatId: null as string | null },
    filters: {} as Record<string, string>,
    returnLocation: null as unknown,
  },
}));
let restoreDispatcher: (() => void) | null = null;

vi.mock('../../apps/desktop/renderer/src/state/ui-store.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    useRendererUiStore: (selector: (state: typeof ui.state) => unknown) => selector(ui.state),
  };
});

const projectId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const chapterId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const sceneBeatId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const plotNodeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const briefId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

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

function setPlanningState(
  target: unknown,
  planningTarget: unknown,
  options: {
    readonly selected?: boolean;
    readonly plot?: boolean;
    readonly brief?: boolean;
    readonly returnLocation?: boolean;
  } = {},
): void {
  restoreDispatcher?.();
  hooks.states = [target, planningTarget];
  hooks.index = 0;
  hooks.effects = [];
  restoreDispatcher = installRendererHookDispatcher(hooks);
  ui.state = {
    selection: {
      chapterId: options.selected ? chapterId : null,
      sceneBeatId: options.selected ? sceneBeatId : null,
    },
    filters: {
      ...(options.plot ? { 'navigation.plotNodeId': plotNodeId } : {}),
      ...(options.brief ? { 'navigation.projectBriefId': briefId } : {}),
    },
    returnLocation: options.returnLocation ? { route: 'home' } : null,
  };
}

function planningBridge(): RendererBridgeAdapter {
  return contractInput<RendererBridgeAdapter>({
    cancelAll: vi.fn(),
    planning: {
      listSceneBeats: vi.fn(async () => ({
        state: 'success',
        data: {
          beats: [
            {
              id: sceneBeatId,
              title: '目标场景',
              goal: '推进目标',
              coreConflict: '核心冲突',
              expectedResult: '预期结果',
            },
          ],
        },
      })),
      listPlotNodes: vi.fn(async () => ({
        state: 'success',
        data: {
          nodes: [
            {
              id: plotNodeId,
              title: '转换后节点',
              goal: '节点目标',
              coreConflict: '',
              expectedResult: '',
            },
          ],
        },
      })),
      getBrief: vi.fn(async () => ({
        state: 'success',
        data: {
          id: briefId,
          concept: '作品核心',
          readingPromise: '阅读承诺',
          protagonistGoal: '主角目标',
        },
      })),
    },
  });
}

function renderPlanning(
  target: unknown,
  planningTarget: unknown,
  options: Parameters<typeof setPlanningState>[2],
): TestElement {
  setPlanningState(target, planningTarget, options);
  return PlanningWorkbench({
    bridge: planningBridge(),
    projectId,
    readOnly: false,
    disclosureMode: 'beginner',
    onDisclosureModeChange: vi.fn(),
    onNavigate: vi.fn(),
    onClose: vi.fn(),
    onReturn: vi.fn(),
  }) as TestElement;
}

function callbackProps() {
  return {
    onCreateFromOnboarding: vi.fn(async () => true),
    onCloseProject: vi.fn(async () => undefined),
    onMoveProject: vi.fn(async () => undefined),
    onOpenRecent: vi.fn(async () => undefined),
    onOpenSelected: vi.fn(async () => undefined),
    onRelocateRecent: vi.fn(async () => undefined),
    onRemoveRecent: vi.fn(async () => undefined),
    onNavigate: vi.fn(),
    onNavigateToAuthorTarget: vi.fn(),
    onTransitionToRoute: vi.fn(async () => true),
    onCloseSettings: vi.fn(),
    onReturnToAuthorSource: vi.fn(async () => undefined),
    onSaveSettings: vi.fn(async () => true),
    onResetSettings: vi.fn(async () => undefined),
    onSaveAppearance: vi.fn(async () => true),
    onRestartCore: vi.fn(async () => undefined),
    onProvidersChanged: vi.fn(),
    onProviderConnectionVerified: vi.fn(),
    onProviderInvalidated: vi.fn(),
    onOpenOnboarding: vi.fn(),
    onCanonSectionChange: vi.fn(),
    onDataToolsSectionChange: vi.fn(),
    onProjectRestored: vi.fn(async () => undefined),
    onWritingStatus: vi.fn(),
  };
}

function shellProps(
  route: AppShellPagesProps['route'],
  active = true,
  callbacks = callbackProps(),
  recentProjects: AppShellPagesProps['recentProjects'] = contractInput<
    AppShellPagesProps['recentProjects']
  >([
    {
      projectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      missingSince: null,
      lastOpenedAt: '2026-08-12T10:00:00.000Z',
    },
  ]),
): AppShellPagesProps {
  return contractInput<AppShellPagesProps>({
    bridge: planningBridge(),
    route,
    activeProject: active
      ? {
          projectId,
          name: '覆盖测试作品',
          databaseMode: route === 'checks' ? 'read-only' : 'read-write',
        }
      : null,
    continuation: null,
    recentProjects,
    tasks: [{ taskId: '11111111-2222-4333-8444-555555555555' }],
    healthSignals: [],
    capabilities: { project: {} },
    disclosureMode: 'beginner',
    aiReadiness: { status: 'ready' },
    settings: {},
    appearance: {},
    coreStatus: null,
    message: null,
    onboardingRequest: 0,
    pendingKey: null,
    canonSection: 'entities',
    dataToolsSection: 'recovery',
    writingPanel: 'editor',
    selection: {
      chapterId,
      entityId: null,
      logicalBlockId: null,
      versionId: null,
    },
    navigationQuery: null,
    ...callbacks,
  });
}

function activeChild(root: TestElement): TestElement {
  const child = descendants(root).find((element) => element !== root);
  if (!child) throw new Error('EXPECTED_ACTIVE_SHELL_CHILD');
  return child;
}

function invoke(element: TestElement, name: string, ...args: unknown[]): void {
  const handler = element.props[name];
  if (typeof handler === 'function') handler(...args);
}

afterEach(() => {
  restoreDispatcher?.();
  restoreDispatcher = null;
});

describe('M11-05 planning renderer coverage', () => {
  it('renders ready targets, return source, and populated conversion targets', () => {
    const root = renderPlanning(
      {
        status: 'ready',
        beat: {
          title: '目标场景',
          goal: '推进目标',
          coreConflict: '核心冲突',
          expectedResult: '预期结果',
        },
      },
      {
        status: 'plot-node',
        node: {
          title: '转换后节点',
          goal: '节点目标',
          coreConflict: '',
          expectedResult: '',
        },
      },
      { selected: true, plot: true, returnLocation: true },
    );

    expect(text(root)).toContain('返回来源页面');
    expect(text(root)).toContain('转换后节点');
    expect(text(root)).toContain('目标场景');
    const returnButton = descendants(root).find(
      (element) => element.type === 'button' && text(element) === '返回来源页面',
    );
    expect(returnButton).toBeDefined();
    invoke(returnButton!, 'onClick');
  });

  it('renders every navigation status branch', () => {
    const failed = renderPlanning(
      { status: 'failed', message: '场景读取失败' },
      { status: 'failed', label: '大纲节点', message: '节点读取失败' },
      { selected: true, plot: true },
    );
    expect(text(failed)).toContain('场景读取失败');
    expect(text(failed)).toContain('节点读取失败');

    const missing = renderPlanning(
      { status: 'missing' },
      { status: 'missing', label: '作品核心' },
      { selected: true, brief: true },
    );
    expect(text(missing)).toContain('目标场景已经变化或被删除');
    expect(text(missing)).toContain('作品核心已经删除或发生变化');

    const brief = renderPlanning(
      { status: 'loading' },
      {
        status: 'project-brief',
        brief: { concept: '', readingPromise: '', protagonistGoal: '' },
      },
      { selected: true, brief: true },
    );
    expect(text(brief)).toContain('正在读取目标场景');
    expect(text(brief)).toContain('作品核心');
    expect(text(brief)).toContain('尚未填写');

    const idle = renderPlanning({ status: 'idle' }, { status: 'idle' }, {});
    expect(text(idle)).not.toContain('转换后的目标');
    expect(text(idle)).not.toContain('目标场景');
  });
});

describe('M11-05 AppShell route coverage', () => {
  it('covers home continuation with active, recent and unavailable projects', () => {
    const activeCallbacks = callbackProps();
    const active = activeChild(
      AppShellPages(shellProps('home', true, activeCallbacks)) as TestElement,
    );
    invoke(active, 'onContinue');
    invoke(active, 'onCloseProject', projectId);
    invoke(active, 'onMoveProject', projectId);
    invoke(active, 'onOpenRecent', projectId);
    invoke(active, 'onOpenRecovery');
    invoke(active, 'onOpenSelected', false);
    invoke(active, 'onRelocateRecent', projectId);
    invoke(active, 'onRemoveRecent', projectId);
    expect(activeCallbacks.onTransitionToRoute).toHaveBeenCalled();

    const recentCallbacks = callbackProps();
    const recent = activeChild(
      AppShellPages(shellProps('project', false, recentCallbacks)) as TestElement,
    );
    invoke(recent, 'onContinue');
    expect(recentCallbacks.onOpenRecent).toHaveBeenCalledWith(
      'ffffffff-ffff-4fff-8fff-ffffffffffff',
    );

    const unavailable = contractInput<AppShellPagesProps['recentProjects']>([
      {
        projectId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        missingSince: '2026-08-12T09:00:00.000Z',
        lastOpenedAt: '2026-08-12T10:00:00.000Z',
      },
    ]);
    const none = activeChild(
      AppShellPages(shellProps('home', false, callbackProps(), unavailable)) as TestElement,
    );
    invoke(none, 'onContinue');
  });

  it('covers settings, planning, canon and recovery route callbacks', () => {
    const settingsCallbacks = callbackProps();
    const settings = activeChild(
      AppShellPages(shellProps('settings', true, settingsCallbacks)) as TestElement,
    );
    invoke(settings, 'onResetSettings');
    invoke(settings, 'onRestartCore');
    expect(settingsCallbacks.onResetSettings).toHaveBeenCalled();

    const planningCallbacks = callbackProps();
    const planning = activeChild(
      AppShellPages(shellProps('planning', true, planningCallbacks)) as TestElement,
    );
    invoke(planning, 'onDisclosureModeChange', 'professional');
    invoke(planning, 'onClose');
    invoke(planning, 'onReturn');
    expect(planningCallbacks.onSaveSettings).toHaveBeenCalledWith({ defaultMode: 'professional' });

    const canonCallbacks = callbackProps();
    const canon = activeChild(
      AppShellPages(shellProps('canon', true, canonCallbacks)) as TestElement,
    );
    invoke(canon, 'onReturn');
    expect(canonCallbacks.onReturnToAuthorSource).toHaveBeenCalled();

    const recoveryCallbacks = callbackProps();
    const recovery = activeChild(
      AppShellPages(shellProps('recovery', true, recoveryCallbacks)) as TestElement,
    );
    const renderDataTools = recovery.props.children;
    expect(typeof renderDataTools).toBe('function');
    const dataTools = (renderDataTools as (bridge: RendererBridgeAdapter) => TestElement)(
      planningBridge(),
    );
    invoke(dataTools, 'onClose');
    expect(recoveryCallbacks.onTransitionToRoute).toHaveBeenCalledWith('writing');
  });

  it('covers writing panel transitions, checks and inactive project guards', () => {
    const writingCallbacks = callbackProps();
    const writing = activeChild(
      AppShellPages(shellProps('writing', true, writingCallbacks)) as TestElement,
    );
    invoke(writing, 'onPanelChange', 'versions');
    invoke(writing, 'onPanelChange', 'candidates');
    invoke(writing, 'onPanelChange', 'editor');
    invoke(writing, 'onReturn');
    expect(writingCallbacks.onTransitionToRoute).toHaveBeenCalledWith('versions');
    expect(writingCallbacks.onTransitionToRoute).toHaveBeenCalledWith('candidates');
    expect(writingCallbacks.onTransitionToRoute).toHaveBeenCalledWith('writing');

    const checks = AppShellPages(shellProps('checks', true, callbackProps())) as TestElement;
    expect(activeChild(checks)).toBeDefined();

    for (const route of ['planning', 'canon', 'recovery', 'writing', 'checks'] as const) {
      const root = AppShellPages(shellProps(route, false, callbackProps())) as TestElement;
      expect(descendants(root)).toHaveLength(1);
    }
  });
});
