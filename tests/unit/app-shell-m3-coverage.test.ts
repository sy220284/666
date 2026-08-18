import { createRequire } from 'node:module';

import type { createElement as createReactElement, ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RendererApplicationController } from '../../apps/desktop/renderer/src/app/renderer-application-controller.js';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const shell = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    route: 'home',
    globalStatus: null as null | { id: string },
    layout: vi.fn(),
    pages: vi.fn(),
    palette: vi.fn(),
    settingsArgs: null as unknown,
    projectArgs: null as unknown,
    navigationArgs: null as unknown,
    actionsArgs: null as unknown,
    startupArgs: null as unknown,
    dispatch: fn(),
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
    settingsController: {
      flushSettings: vi.fn().mockResolvedValue(true),
      applySettings: fn(),
      applyAppearance: fn(),
      applyProviders: fn(),
      providers: [] as unknown[],
      verifiedProviderIds: new Set<string>(),
      settings: { defaultMode: 'professional', creativePath: 'director' },
      appearance: {},
      aiReadiness: { ready: false },
      saveSettings: fn(),
      resetSettings: fn(),
      saveAppearance: fn(),
      verifyProvider: fn(),
      invalidateProvider: fn(),
    },
    projectController: {
      createProject: fn(),
      moveProject: fn(),
      closeProject: fn(),
      openRecent: fn(),
      openSelected: fn(),
      relocateRecent: fn(),
      removeRecent: fn(),
    },
    runtime: {
      hydrated: true,
      coreStatus: 'ready',
      setCoreStatus: fn(),
      tasks: [] as unknown[],
      setTasks: fn(),
      startupResources: [],
      workspaceAttention: null,
      setStartupResourceState: fn(),
      setHydrated: fn(),
      refreshTasks: vi.fn().mockResolvedValue(undefined),
    },
    navigation: {
      navigation: [],
      selection: null,
      navigationQuery: null,
      navigationGenerationMode: null,
      foregroundTaskId: null,
      navOpen: false,
      setNavOpen: fn(),
      navToggle: { current: null },
      settingsTrigger: { current: null },
      mainContent: { current: null },
      settingsReturnRoute: { current: 'home' },
      navigate: fn(),
      transitionToRoute: vi.fn().mockResolvedValue(true),
      navigateToAuthorTarget: fn(),
      returnToAuthorSource: fn(),
    },
    actions: {
      openOnboarding: fn(),
      cancelTask: fn(),
      createFromOnboarding: fn(),
      restartCore: fn(),
    },
  };
});

vi.mock('../../apps/desktop/renderer/src/state/ui-store.js', () => ({
  useRendererUiStore: (selector: (state: unknown) => unknown) =>
    selector({ route: shell.route, dispatch: shell.dispatch }),
}));
vi.mock('../../apps/desktop/renderer/src/runtime/capability-matrix.js', () => ({
  deriveCapabilityMatrix: () => ({ navigation: {} }),
}));
vi.mock('../../apps/desktop/renderer/src/shell/app-shell-model.js', () => ({
  restoreAppShellRoute: () => 'home',
}));
vi.mock('../../apps/desktop/renderer/src/app/app-shell-status.js', () => ({
  buildGlobalStatus: () => shell.globalStatus,
  buildHomeHealthSignals: () => [],
}));
vi.mock('../../apps/desktop/renderer/src/app/use-app-settings-persistence.js', () => ({
  useAppSettingsPersistence: (args: unknown) => {
    shell.settingsArgs = args;
    return shell.settingsController;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/use-project-session-controller.js', () => ({
  useProjectSessionController: (args: unknown) => {
    shell.projectArgs = args;
    return shell.projectController;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/use-workspace-runtime.js', () => ({
  useWorkspaceRuntime: () => shell.runtime,
}));
vi.mock('../../apps/desktop/renderer/src/app/use-workspace-startup.js', () => ({
  useWorkspaceStartup: (args: unknown) => {
    shell.startupArgs = args;
    return shell.refreshWorkspace;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/use-app-shell-navigation.js', () => ({
  useAppShellNavigation: (args: unknown) => {
    shell.navigationArgs = args;
    return shell.navigation;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/use-app-shell-actions.js', () => ({
  useAppShellActions: (args: unknown) => {
    shell.actionsArgs = args;
    return shell.actions;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/app-shell-layout.js', () => ({
  AppShellLayout: (props: Record<string, unknown>) => {
    shell.layout(props);
    return props.children ?? null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/app/app-shell-pages.js', () => ({
  AppShellPages: (props: Record<string, unknown>) => {
    shell.pages(props);
    return null;
  },
}));
vi.mock('../../apps/desktop/renderer/src/features/command-palette/command-palette.js', () => ({
  CommandPalette: (props: Record<string, unknown>) => {
    shell.palette(props);
    return null;
  },
}));

import { AppShell } from '../../apps/desktop/renderer/src/app/app-shell-m3.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { act, create } = rendererRequire('react-test-renderer') as {
  readonly act: (callback: () => void | Promise<void>) => Promise<void>;
  readonly create: (element: ReactElement) => { unmount(): void };
};

const projectId = '11111111-1111-4111-8111-111111111111';

function lastProps(spy: ReturnType<typeof vi.fn>): Record<string, unknown> {
  const call = spy.mock.calls.at(-1);
  if (!call) throw new Error('Missing captured props');
  return contractInput<Record<string, unknown>>(call[0]);
}

function callback<T extends (...args: never[]) => unknown>(
  props: Record<string, unknown>,
  key: string,
): T {
  const value = props[key];
  if (typeof value !== 'function') throw new Error(`Missing callback ${key}`);
  return contractInput<T>(value);
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function activeProject(mode: 'read-write' | 'read-only' = 'read-write') {
  return contractInput({
    projectId,
    name: '测试作品',
    databaseMode: mode,
    workspacePath: '/tmp/worldforge',
  });
}

let keydown: ((event: Record<string, unknown>) => void) | null = null;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  keydown = null;
  shell.route = 'home';
  shell.globalStatus = null;
  shell.layout.mockClear();
  shell.pages.mockClear();
  shell.palette.mockClear();
  shell.dispatch.mockClear();
  shell.refreshWorkspace.mockClear();
  shell.navigation.navigate.mockClear();
  shell.navigation.transitionToRoute.mockClear();
  shell.navigation.transitionToRoute.mockResolvedValue(true);
  shell.settingsController.providers = [];
  shell.settingsController.verifiedProviderIds = new Set();
  const fakeWindow = {
    worldforgeJournal: { catchUp: vi.fn().mockResolvedValue(undefined) },
    addEventListener: vi.fn((name: string, handler: (event: Record<string, unknown>) => void) => {
      if (name === 'keydown') keydown = handler;
    }),
    removeEventListener: vi.fn(),
    requestAnimationFrame: vi.fn((run: () => void) => {
      run();
      return 1;
    }),
  };
  vi.stubGlobal('window', fakeWindow);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function renderShell() {
  const bridge = contractInput<RendererBridgeAdapter>({});
  const applicationController = contractInput<RendererApplicationController>({
    flushPendingDraft: vi.fn().mockResolvedValue(true),
  });
  let renderer!: { unmount(): void };
  await act(async () => {
    renderer = create(createElement(AppShell, { bridge, applicationController }));
    await flush();
  });
  return renderer;
}

describe('AppShell M3 orchestration coverage', () => {
  it.each([
    ['writing', 'editor'],
    ['versions', 'versions'],
    ['candidates', 'candidates'],
  ] as const)('selects the %s writing route panel', async (route, panel) => {
    shell.route = route;
    const renderer = await renderShell();
    expect(lastProps(shell.pages).writingPanel).toBe(panel);
    await act(async () => renderer.unmount());
  });

  it('covers project activation, journal catch-up, section callbacks and restored refresh', async () => {
    const renderer = await renderShell();
    const projectArgs = contractInput<Record<string, unknown>>(shell.projectArgs);
    const setActiveProject = callback<(value: unknown) => void>(projectArgs, 'setActiveProject');
    await act(async () => {
      setActiveProject(activeProject());
      await flush();
    });
    const journal = contractInput<{ catchUp: ReturnType<typeof vi.fn> }>(
      contractInput<Record<string, unknown>>(globalThis.window).worldforgeJournal,
    );
    expect(journal.catchUp).toHaveBeenCalledWith({ projectId });

    const layout = lastProps(shell.layout);
    await act(async () =>
      callback<(value: string) => void>(layout, 'onOpenCanonSection')('proposals'),
    );
    expect(shell.navigation.transitionToRoute).toHaveBeenCalledWith('canon');
    expect(lastProps(shell.pages).canonSection).toBe('proposals');

    await act(async () =>
      callback<(value: string) => void>(layout, 'onOpenDataToolsSection')('import-export'),
    );
    expect(shell.navigation.transitionToRoute).toHaveBeenCalledWith('recovery');
    expect(lastProps(shell.pages).dataToolsSection).toBe('import-export');

    await act(async () => {
      await callback<() => Promise<void>>(lastProps(shell.pages), 'onProjectRestored')();
      await flush();
    });
    expect(shell.refreshWorkspace).toHaveBeenCalled();
    expect(lastProps(shell.layout).message).toContain('作品恢复完成');
    await act(async () => renderer.unmount());
  });

  it('skips journal catch-up for read-only projects and when bridge is absent', async () => {
    const fakeWindow = contractInput<Record<string, unknown>>(globalThis.window);
    const journal = contractInput<{ catchUp: ReturnType<typeof vi.fn> }>(
      fakeWindow.worldforgeJournal,
    );
    const renderer = await renderShell();
    const setActiveProject = callback<(value: unknown) => void>(
      contractInput<Record<string, unknown>>(shell.projectArgs),
      'setActiveProject',
    );
    await act(async () => {
      setActiveProject(activeProject('read-only'));
      await flush();
    });
    expect(journal.catchUp).not.toHaveBeenCalled();
    fakeWindow.worldforgeJournal = undefined;
    await act(async () => {
      setActiveProject(activeProject());
      await flush();
    });
    expect(journal.catchUp).not.toHaveBeenCalled();
    await act(async () => renderer.unmount());
  });

  it('covers command-palette keyboard open, close, composing and unrelated keys', async () => {
    const renderer = await renderShell();
    expect(keydown).not.toBeNull();
    const prevent = vi.fn();
    keydown?.({
      isComposing: true,
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      preventDefault: prevent,
    });
    keydown?.({
      isComposing: false,
      key: 'x',
      ctrlKey: true,
      metaKey: false,
      preventDefault: prevent,
    });
    expect(prevent).not.toHaveBeenCalled();

    keydown?.({
      isComposing: false,
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      preventDefault: prevent,
    });
    await act(flush);
    expect(prevent).toHaveBeenCalledTimes(1);
    expect(lastProps(shell.palette).open).toBe(true);

    keydown?.({
      isComposing: false,
      key: 'Escape',
      ctrlKey: false,
      metaKey: false,
      preventDefault: prevent,
    });
    await act(flush);
    expect(prevent).toHaveBeenCalledTimes(2);
    expect(lastProps(shell.palette).open).toBe(false);

    keydown?.({
      isComposing: false,
      key: 'K',
      ctrlKey: false,
      metaKey: true,
      preventDefault: prevent,
    });
    await act(flush);
    expect(lastProps(shell.palette).open).toBe(true);
    keydown?.({
      isComposing: false,
      key: 'k',
      ctrlKey: true,
      metaKey: false,
      preventDefault: prevent,
    });
    await act(flush);
    expect(lastProps(shell.palette).open).toBe(false);
    await act(async () => renderer.unmount());
  });

  it.each([
    ['startup-degraded', '重新读取', 'refresh'],
    ['read-only', '恢复与导出', 'recovery'],
    ['missing', '查看最近作品', 'home'],
    ['candidate-partial', '审阅建议稿', 'candidates'],
    ['candidate-pending', '审阅建议稿', 'candidates'],
    ['proposal-pending', '打开智能审阅', 'canon'],
    ['backup-failed', '打开恢复中心', 'recovery'],
    ['validation-open', '打开检查', 'checks'],
    ['search-failed', '打开检查', 'checks'],
    ['search-stale', '打开检查', 'checks'],
    ['ai-readiness', '检查智能连接', 'settings'],
  ] as const)('maps global status %s to its action', async (id, label, target) => {
    shell.globalStatus = { id };
    const renderer = await renderShell();
    const action = contractInput<{ label: string; run: () => void }>(
      lastProps(shell.layout).globalStatusAction,
    );
    expect(action.label).toBe(label);
    await act(async () => {
      action.run();
      await flush();
    });
    if (target === 'refresh') expect(shell.refreshWorkspace).toHaveBeenCalled();
    else if (id === 'missing' || id === 'ai-readiness')
      expect(shell.navigation.navigate).toHaveBeenCalledWith(target);
    else expect(shell.navigation.transitionToRoute).toHaveBeenCalledWith(target);
    if (id === 'proposal-pending') expect(lastProps(shell.pages).canonSection).toBe('proposals');
    await act(async () => renderer.unmount());
  });

  it('covers retryable failure action, non-action status and close-settings return route', async () => {
    shell.globalStatus = { id: 'failure' };
    const renderer = await renderShell();
    const settingsArgs = contractInput<Record<string, unknown>>(shell.settingsArgs);
    await act(async () => {
      callback<(value: unknown) => void>(settingsArgs, 'setFailure')({ retryable: true });
      await flush();
    });
    const failureAction = contractInput<{ label: string; run: () => void }>(
      lastProps(shell.layout).globalStatusAction,
    );
    expect(failureAction.label).toBe('重新读取');
    failureAction.run();
    expect(shell.refreshWorkspace).toHaveBeenCalled();

    await act(async () => {
      await callback<() => void>(lastProps(shell.pages), 'onCloseSettings')();
      await flush();
    });
    expect(shell.navigation.transitionToRoute).toHaveBeenCalledWith('home');
    await act(async () => renderer.unmount());

    shell.globalStatus = { id: 'healthy' };
    const healthy = await renderShell();
    expect(lastProps(shell.layout).globalStatusAction).toBeUndefined();
    await act(async () => healthy.unmount());
  });
});
