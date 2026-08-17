import { createRequire } from 'node:module';

import type {
  AppSettings,
  CoreStatus,
  ProjectWorkspaceSummary,
  TaskSnapshot,
} from '@worldforge/contracts';
import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CapabilityMatrix } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';
import type { RendererStatus } from '../../apps/desktop/renderer/src/runtime/status-arbitrator.js';
import type { PrimaryNavigationItem } from '../../apps/desktop/renderer/src/shell/app-shell-model.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const capture = vi.hoisted(() => ({
  banner: vi.fn(),
  help: vi.fn(),
  tasks: vi.fn(),
}));
vi.mock('../../apps/desktop/renderer/src/components/safety-banner.js', () => ({
  SafetyBanner: (props: Record<string, unknown>) => {
    capture.banner(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/components/context-help.js', () => ({
  ContextHelp: (props: Record<string, unknown>) => {
    capture.help(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/components/task-bar.js', () => ({
  TaskBar: (props: Record<string, unknown>) => {
    capture.tasks(props);
    return null;
  },
}));

import { AppShellLayout } from '../../apps/desktop/renderer/src/app/app-shell-layout.js';

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

const projectId = '11111111-1111-4111-8111-111111111111';
const writableProject = contractInput<ProjectWorkspaceSummary>({
  projectId,
  name: '作者项目',
  workspacePath: '/tmp/author-project',
  databaseMode: 'read-write',
  readOnlyReason: null,
});
const readonlyProject = contractInput<ProjectWorkspaceSummary>({
  ...writableProject,
  databaseMode: 'read-only',
  readOnlyReason: null,
});
const settings = contractInput<AppSettings>({ onboardingTipsSeen: ['tip-a'] });
const fullCapabilities = contractInput<CapabilityMatrix>({
  project: {
    canonReadable: true,
    restoreAvailable: true,
    exportAvailable: true,
    moveAvailable: true,
  },
});
const blockedCapabilities = contractInput<CapabilityMatrix>({
  project: {
    canonReadable: false,
    restoreAvailable: false,
    exportAvailable: false,
    moveAvailable: false,
  },
});
const navigation = [
  contractInput<PrimaryNavigationItem>({
    id: 'home',
    label: '首页',
    description: '入口',
    current: true,
    disabled: false,
    disabledReason: null,
  }),
  contractInput<PrimaryNavigationItem>({
    id: 'canon',
    label: '设定',
    description: '设定库',
    current: false,
    disabled: true,
    disabledReason: '恢复中',
  }),
  contractInput<PrimaryNavigationItem>({
    id: 'planning',
    label: '规划',
    description: '大纲',
    current: false,
    disabled: false,
    disabledReason: null,
  }),
];
const task = contractInput<TaskSnapshot>({
  taskId: '22222222-2222-4222-8222-222222222222',
  projectId,
  status: 'running',
});
const core = contractInput<CoreStatus>({ status: 'healthy' });
const focus = vi.fn();
const ref = { current: null };
const helpRef = { current: { focus } };
const actions = {
  nav: vi.fn(),
  help: vi.fn(),
  palette: vi.fn(),
  navigate: vi.fn(),
  canon: vi.fn(),
  tools: vi.fn(),
  move: vi.fn(async () => undefined),
  close: vi.fn(async () => undefined),
  save: vi.fn(async () => true),
  onboarding: vi.fn(),
  cancel: vi.fn(async () => undefined),
};
const active: TestRenderer[] = [];

function element(
  options: {
    project?: ProjectWorkspaceSummary | null;
    capabilities?: CapabilityMatrix;
    coreStatus?: CoreStatus | null;
    tasks?: readonly TaskSnapshot[];
    pendingKey?: string | null;
    message?: string | null;
    globalStatus?: RendererStatus | null;
    globalAction?: { label: string; run: () => void };
    failure?: { title: string; diagnosticId: string | null } | null;
    navOpen?: boolean;
    helpOpen?: boolean;
    paletteOpen?: boolean;
  } = {},
): ReactElement {
  return createElement(AppShellLayout, {
    children: createElement('p', null, '正文'),
    activeProject: options.project === undefined ? writableProject : options.project,
    capabilities: options.capabilities ?? fullCapabilities,
    coreStatus: options.coreStatus === undefined ? core : options.coreStatus,
    tasks: options.tasks ?? [task],
    pendingKey: options.pendingKey ?? null,
    message: options.message === undefined ? '已保存' : options.message,
    navigation,
    disclosureMode: 'professional',
    route: 'home',
    settings,
    failure: options.failure ?? null,
    globalStatus: options.globalStatus ?? null,
    globalStatusAction: options.globalAction,
    foregroundTaskId: task.taskId,
    navOpen: options.navOpen ?? false,
    helpOpen: options.helpOpen ?? false,
    commandPaletteOpen: options.paletteOpen ?? false,
    navToggle: ref,
    settingsTrigger: ref,
    helpTrigger: helpRef,
    commandPaletteTrigger: ref,
    mainContent: ref,
    onNavOpenChange: actions.nav,
    onHelpOpenChange: actions.help,
    onCommandPaletteOpenChange: actions.palette,
    onNavigate: actions.navigate,
    onTransitionToRoute: async () => true,
    onOpenCanonSection: actions.canon,
    onOpenDataToolsSection: actions.tools,
    onMoveProject: actions.move,
    onCloseProject: actions.close,
    onSaveSettings: actions.save,
    onOpenOnboarding: actions.onboarding,
    onCancelTask: actions.cancel,
  });
}
async function render(options: Parameters<typeof element>[0] = {}): Promise<TestRenderer> {
  let renderer!: TestRenderer;
  await act(async () => {
    renderer = create(element(options));
    await Promise.resolve();
  });
  active.push(renderer);
  return renderer;
}
function byProp(root: TestInstance, prop: string): TestInstance {
  const n = root.findAll((x) => x.props[prop] !== undefined)[0];
  if (!n) throw new Error(`Missing ${prop}`);
  return n;
}
function byNav(root: TestInstance, id: string): TestInstance {
  const n = root.findAll((x) => x.props['data-primary-navigation'] === id)[0];
  if (!n) throw new Error(`Missing nav ${id}`);
  return n;
}
async function invoke(node: TestInstance, prop = 'onClick', arg?: unknown) {
  const fn = node.props[prop];
  if (typeof fn !== 'function') throw new Error(`Missing ${prop}`);
  await act(async () => {
    fn(arg);
    await Promise.resolve();
    await Promise.resolve();
  });
}
function last(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = mock.mock.calls.at(-1);
  if (!call) throw new Error('Missing props');
  return contractInput<Record<string, unknown>>(call[0]);
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  vi.stubGlobal('window', {
    requestAnimationFrame: (fn: () => void) => {
      fn();
      return 1;
    },
  });
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(async () => {
    for (const r of active.splice(0)) r.unmount();
  });
  vi.unstubAllGlobals();
});

describe('AppShellLayout interaction edge coverage', () => {
  it('drives top bar, navigation, scrim and task cancellation callbacks', async () => {
    const renderer = await render({ navOpen: true, paletteOpen: true });
    await invoke(byProp(renderer.root, 'aria-label'));
    expect(actions.nav).toHaveBeenCalledWith(false);
    const brand = renderer.root.findAll(
      (n) => n.type === 'button' && n.props.className === 'react-brand',
    )[0]!;
    await invoke(brand);
    expect(actions.navigate).toHaveBeenCalledWith('home');
    await invoke(byProp(renderer.root, 'data-open-command-palette'));
    expect(actions.palette).toHaveBeenCalledWith(true);
    await invoke(byProp(renderer.root, 'data-open-context-help'));
    expect(actions.help).toHaveBeenCalledWith(true);
    await invoke(byProp(renderer.root, 'data-open-settings'));
    expect(actions.navigate).toHaveBeenCalledWith('settings');
    await invoke(byNav(renderer.root, 'planning'));
    expect(actions.navigate).toHaveBeenCalledWith('planning');
    expect(byNav(renderer.root, 'home').props['aria-current']).toBe('page');
    expect(byNav(renderer.root, 'canon').props.title).toBe('恢复中');
    const scrim = renderer.root.findAll((n) => n.props.className === 'react-nav-scrim')[0]!;
    await invoke(scrim);
    expect(actions.nav).toHaveBeenCalledWith(false);
    const taskProps = last(capture.tasks);
    const cancel = contractInput<(id: string, pid: string | null) => void>(taskProps.onCancel);
    cancel(task.taskId, projectId);
    expect(actions.cancel).toHaveBeenCalledWith(task.taskId, projectId);

    vi.stubGlobal('navigator', undefined);
    await act(async () => renderer.update(element({ navOpen: true, paletteOpen: true })));
    expect(byProp(renderer.root, 'data-open-command-palette')).toBeDefined();
  });

  it('covers writable/read-only/absent project context and all project actions', async () => {
    const renderer = await render();
    await invoke(byProp(renderer.root, 'data-open-continuity'));
    await invoke(byProp(renderer.root, 'data-open-narrative-planning'));
    await invoke(byProp(renderer.root, 'data-open-state-proposals'));
    expect(actions.canon.mock.calls.map((c) => c[0])).toEqual([
      'continuity',
      'narrative',
      'proposals',
    ]);
    await invoke(byProp(renderer.root, 'data-open-recovery'));
    await invoke(byProp(renderer.root, 'data-open-text-io'));
    expect(actions.tools.mock.calls.map((c) => c[0])).toEqual(['recovery', 'import-export']);
    await invoke(byProp(renderer.root, 'data-move-project'));
    await invoke(byProp(renderer.root, 'data-close-project'));
    expect(actions.move).toHaveBeenCalledWith(projectId);
    expect(actions.close).toHaveBeenCalledWith(projectId);
    expect(byProp(renderer.root, 'data-active-project-mode').children).toContain(
      '可写 · 本地数据库',
    );

    await act(async () =>
      renderer.update(
        element({
          project: readonlyProject,
          capabilities: blockedCapabilities,
          pendingKey: 'busy',
          message: null,
        }),
      ),
    );
    expect(byProp(renderer.root, 'data-active-project-mode').children).toContain('只读兼容模式');
    expect(byProp(renderer.root, 'data-active-project-readonly').children).toContain('兼容性保护');
    expect(byProp(renderer.root, 'data-open-continuity').props.disabled).toBe(true);
    expect(byProp(renderer.root, 'data-open-continuity').props.title).toContain('连续性账本');
    expect(byProp(renderer.root, 'data-open-recovery').props.disabled).toBe(true);
    expect(byProp(renderer.root, 'data-open-text-io').props.title).toContain('无法安全导入或导出');
    expect(byProp(renderer.root, 'data-move-project').props.disabled).toBe(true);
    expect(byProp(renderer.root, 'data-close-project').props.disabled).toBe(true);
    expect(renderer.root.findAll((n) => 'data-project-operation-status' in n.props)).toHaveLength(
      0,
    );

    await act(async () => renderer.update(element({ project: null, coreStatus: null, tasks: [] })));
    expect(renderer.root.findAll((n) => 'data-active-project' in n.props)).toHaveLength(0);
    expect(renderer.root.findAll((n) => n.props['data-status'] === 'starting')).toHaveLength(1);
  });

  it('covers global status banner kind/title/diagnostic branches', async () => {
    const failure = contractInput<RendererStatus>({
      id: 'failure',
      priority: 'P1',
      message: '失败',
    });
    const coreStatus = contractInput<RendererStatus>({
      id: 'core',
      priority: 'P1',
      message: '核心断开',
    });
    const p0 = contractInput<RendererStatus>({ id: 'project', priority: 'P0', message: '保护' });
    const p2 = contractInput<RendererStatus>({ id: 'project', priority: 'P2', message: '警告' });
    const info = contractInput<RendererStatus>({ id: 'project', priority: 'P3', message: '提示' });
    const renderer = await render({
      globalStatus: failure,
      failure: { title: '写入失败', diagnosticId: 'diag-1' },
    });
    expect(last(capture.banner)).toMatchObject({
      kind: 'danger',
      title: '写入失败',
      diagnosticId: 'diag-1',
    });
    await act(async () => renderer.update(element({ globalStatus: failure, failure: null })));
    expect(last(capture.banner)).toMatchObject({ title: '操作失败', diagnosticId: null });
    await act(async () => renderer.update(element({ globalStatus: coreStatus })));
    expect(last(capture.banner)).toMatchObject({ kind: 'danger', title: '工作区状态' });
    await act(async () => renderer.update(element({ globalStatus: p0 })));
    expect(last(capture.banner)).toMatchObject({ kind: 'warning', title: '保护状态' });
    await act(async () => renderer.update(element({ globalStatus: p2 })));
    expect(last(capture.banner).kind).toBe('warning');
    await act(async () =>
      renderer.update(
        element({ globalStatus: info, globalAction: { label: '重试', run: vi.fn() } }),
      ),
    );
    expect(last(capture.banner)).toMatchObject({ kind: 'info', title: '工作区状态' });
  });

  it('covers context help close/focus, tip de-duplication and onboarding callback', async () => {
    const renderer = await render({ helpOpen: true });
    const help = last(capture.help);
    helpRef.current = { focus };
    const close = contractInput<() => void>(help.onClose);
    close();
    expect(actions.help).toHaveBeenCalledWith(false);
    expect(focus).toHaveBeenCalledOnce();
    const dismiss = contractInput<(tip: string) => void>(help.onDismissTip);
    dismiss('tip-a');
    dismiss('tip-b');
    await Promise.resolve();
    expect(actions.save).toHaveBeenNthCalledWith(1, { onboardingTipsSeen: ['tip-a'] });
    expect(actions.save).toHaveBeenNthCalledWith(2, { onboardingTipsSeen: ['tip-a', 'tip-b'] });
    const onboarding = contractInput<() => void>(help.onOpenOnboarding);
    onboarding();
    expect(actions.onboarding).toHaveBeenCalledOnce();
    await act(async () => renderer.update(element({ helpOpen: false })));
    expect(capture.help).toHaveBeenCalledTimes(1);
  });
});
