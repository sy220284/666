import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsUpdate,
  type AppearancePreferences,
  type CoreStatus,
  type ProjectCreateInput,
  type ProjectContinuationSnapshot,
  type ProjectWorkspaceSummary,
  type RecentProject,
  type TaskSnapshot,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';
import { ContextHelp } from '../components/context-help.js';
import { SafetyBanner } from '../components/safety-banner.js';
import { TaskBar } from '../components/task-bar.js';
import { CanonWorkbench, type CanonSection } from '../features/canon/canon-workbench.js';
import { ChecksWorkbench } from '../features/checks/checks-workbench.js';
import {
  DataToolsWorkbench,
  type DataToolsSection,
} from '../features/data-tools/data-tools-workbench.js';
import { HomePage, type OnboardingProjectPlan } from '../features/home/home-page.js';
import { PlanningWorkbench } from '../features/planning/planning-workbench.js';
import { SettingsPage } from '../features/settings/settings-page.js';
import { WritingWorkbench, type WritingPanel } from '../features/writing/writing-workbench.js';
import {
  createPrimaryNavigationItems,
  resolvePrimaryNavigationIntent,
  restoreAppShellRoute,
  type AppDisclosureMode,
  type PrimaryNavigationId,
} from '../shell/app-shell-model.js';
import type { HomeHealthSignal } from '../shell/home-dashboard-model.js';
import { RendererStatusArbitrator } from '../runtime/status-arbitrator.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';
import { useRendererUiStore } from '../state/ui-store.js';

export interface AppShellProps {
  readonly bridge: RendererBridgeAdapter;
  readonly legacySurface?: unknown;
}

export function AppShell({ bridge }: AppShellProps) {
  const route = useRendererUiStore((state) => state.route);
  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [navOpen, setNavOpen] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const initialWorkspaceResolved = useRef(false);
  const settingsWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const confirmedSettings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeProject, setActiveProject] = useState<ProjectWorkspaceSummary | null>(null);
  const [continuation, setContinuation] = useState<ProjectContinuationSnapshot | null>(null);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appearance, setAppearance] = useState<AppearancePreferences>(
    DEFAULT_APPEARANCE_PREFERENCES,
  );
  const [coreStatus, setCoreStatus] = useState<CoreStatus | null>(null);
  const [tasks, setTasks] = useState<readonly TaskSnapshot[]>([]);
  const [providerAvailable, setProviderAvailable] = useState(false);
  const [onboardingRequest, setOnboardingRequest] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState<string | null>('正在读取本地工作区…');
  const [failure, setFailure] = useState<FailureView | null>(null);
  const [canonSection, setCanonSection] = useState<CanonSection>('entities');
  const [dataToolsSection, setDataToolsSection] = useState<DataToolsSection>('recovery');

  const disclosureMode: AppDisclosureMode = settings.defaultMode;
  const writingPanel: WritingPanel =
    route === 'versions' ? 'versions' : route === 'candidates' ? 'candidates' : 'editor';

  const refreshTasks = useCallback(async (): Promise<void> => {
    const outcome = await bridge.task.listActive(undefined, { mode: 'replace' });
    if (outcome.state === 'success') setTasks(outcome.data.tasks);
  }, [bridge]);

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const [core, applicationSettings, windowPreferences, project, recent, activeTasks, providers] =
      await Promise.all([
        bridge.app.getCoreStatus({ mode: 'replace' }),
        bridge.settings.get({ mode: 'replace' }),
        bridge.app.getWindowPreferences({ mode: 'replace' }),
        bridge.project.getActive({ mode: 'replace' }),
        bridge.project.listRecent({ mode: 'replace' }),
        bridge.task.listActive(undefined, { mode: 'replace' }),
        bridge.providers.list({ mode: 'replace' }),
      ]);

    let nextFailure: FailureView | null = null;
    if (core.state === 'success') setCoreStatus(core.data);
    else nextFailure = failureFromOutcome('Core状态读取失败', core);

    if (applicationSettings.state === 'success') {
      confirmedSettings.current = applicationSettings.data.settings;
      setSettings(applicationSettings.data.settings);
    } else nextFailure ??= failureFromOutcome('应用设置读取失败', applicationSettings);

    if (windowPreferences.state === 'success') {
      setAppearance({
        workspaceAlignment: windowPreferences.data.workspaceAlignment,
        uiScalePercent: windowPreferences.data.uiScalePercent,
        bodyFontSize: windowPreferences.data.bodyFontSize,
        contentWidth: windowPreferences.data.contentWidth,
      });
    } else nextFailure ??= failureFromOutcome('显示设置读取失败', windowPreferences);

    if (project.state === 'success') {
      setActiveProject(project.data);
      let nextContinuation: ProjectContinuationSnapshot | null = null;
      if (project.data) {
        const continuationOutcome = await bridge.project.getContinuation(project.data.projectId, {
          mode: 'replace',
        });
        if (continuationOutcome.state === 'success') {
          nextContinuation = continuationOutcome.data;
        }
      }
      setContinuation(nextContinuation);
      if (!initialWorkspaceResolved.current) {
        initialWorkspaceResolved.current = true;
        const restoredRoute = project.data ? continuationRoute(nextContinuation) : 'home';
        dispatch({
          type: 'navigate',
          route: restoreAppShellRoute(restoredRoute, {
            activeProjectId: project.data?.projectId ?? null,
            disclosureMode:
              applicationSettings.state === 'success'
                ? applicationSettings.data.settings.defaultMode
                : DEFAULT_APP_SETTINGS.defaultMode,
          }),
        });
      }
    } else nextFailure ??= failureFromOutcome('项目状态读取失败', project);

    if (recent.state === 'success') setRecentProjects(recent.data.projects);
    else nextFailure ??= failureFromOutcome('最近项目读取失败', recent);

    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);
    if (providers.state === 'success') setProviderAvailable(providers.data.providers.length > 0);
    setFailure(nextFailure);
    setMessage(null);
    setHydrated(true);
  }, [bridge, dispatch]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  useEffect(() => {
    if (hydrated) document.body.dataset.rendererReady = 'true';
  }, [hydrated]);

  useEffect(() => {
    const unsubscribe = bridge.task.subscribe(() => void refreshTasks());
    return unsubscribe;
  }, [bridge, refreshTasks]);

  useEffect(() => {
    document.body.dataset.theme = settings.themeId;
    document.body.dataset.visualThemeVariant = settings.themeVariant;
    document.body.dataset.motionPreference = settings.reduceMotion ? 'reduced' : 'full';
    document.body.dataset.authorMode = settings.defaultMode;
    document.body.dataset.projectState = activeProject
      ? activeProject.databaseMode === 'read-only'
        ? 'read-only'
        : 'open'
      : 'closed';
    document.documentElement.style.setProperty(
      '--ui-scale',
      String(appearance.uiScalePercent / 100),
    );
    document.documentElement.style.setProperty('--body-font-size', `${appearance.bodyFontSize}px`);
    document.documentElement.style.setProperty(
      '--content-width',
      `${contentWidthPixels(appearance.contentWidth, window.innerWidth)}px`,
    );
    document.body.dataset.workspaceAlignment = appearance.workspaceAlignment;
  }, [activeProject, appearance, settings]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && navOpen) {
        setNavOpen(false);
        navToggle.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  useEffect(() => {
    dispatch({
      type: 'select',
      selection: { projectId: activeProject?.projectId ?? null },
    });
  }, [activeProject, dispatch]);

  const availability = {
    home: true,
    planning: true,
    writing: true,
    canon: true,
    checks: true,
    settings: true,
  } as const;

  const navigation = createPrimaryNavigationItems({
    activeProjectId: activeProject?.projectId ?? null,
    currentRoute: route,
    disclosureMode,
    availability,
  });

  const flushWriting = useCallback(async (): Promise<boolean> => {
    const flush = (
      globalThis as typeof globalThis & {
        readonly worldforgeFlushDraft?: () => Promise<boolean>;
      }
    ).worldforgeFlushDraft;
    return flush ? flush() : true;
  }, []);

  const transitionToRoute = useCallback(
    async (nextRoute: RendererRouteId): Promise<boolean> => {
      if (route === nextRoute) return true;
      if (isWritingRoute(route) && !(await flushWriting())) {
        setMessage('自动保存失败，已阻止离开当前写作会话。');
        return false;
      }
      setFailure(null);
      setMessage(null);
      dispatch({ type: 'navigate', route: nextRoute });
      return true;
    },
    [dispatch, flushWriting, route],
  );

  const navigate = useCallback(
    (navigationId: PrimaryNavigationId): void => {
      const resolution = resolvePrimaryNavigationIntent(navigationId, {
        activeProjectId: activeProject?.projectId ?? null,
        currentRoute: route,
        disclosureMode,
        availability,
      });
      if (!resolution.accepted) {
        setMessage(resolution.reason);
        return;
      }
      setNavOpen(false);
      void transitionToRoute(resolution.route).then((changed) => {
        if (changed && navigationId === 'home') void refreshWorkspace();
      });
    },
    [activeProject, disclosureMode, refreshWorkspace, route, transitionToRoute],
  );

  const projectChanged = useCallback(
    async (
      project: ProjectWorkspaceSummary | null,
      resultMessage: string,
    ): Promise<ProjectContinuationSnapshot | null> => {
      setActiveProject(project);
      let nextContinuation: ProjectContinuationSnapshot | null = null;
      if (project) {
        const outcome = await bridge.project.getContinuation(project.projectId, {
          mode: 'replace',
        });
        if (outcome.state === 'success') nextContinuation = outcome.data;
      }
      setContinuation(nextContinuation);
      const recent = await bridge.project.listRecent({ mode: 'replace' });
      if (recent.state === 'success') setRecentProjects(recent.data.projects);
      setMessage(resultMessage);
      return nextContinuation;
    },
    [bridge],
  );

  const healthSignals = useMemo<readonly HomeHealthSignal[]>(() => {
    const signals: HomeHealthSignal[] = [];
    if (coreStatus && coreStatus.status !== 'healthy') {
      signals.push({
        id: 'core-health',
        severity: 'data-risk',
        title: 'Core需要处理',
        message: `当前状态：${coreStatus.status}。写入保持阻断，直到Core恢复健康。`,
        intent: 'settings',
      });
    }
    if (activeProject?.databaseMode === 'read-only') {
      signals.push({
        id: 'project-readonly',
        severity: 'data-risk',
        title: '项目处于只读保护',
        message: `原因：${activeProject.readOnlyReason ?? '兼容性保护'}。可以浏览并安全导出。`,
        intent: 'recovery',
      });
    }
    const missingCount = recentProjects.filter((project) => project.missingSince !== null).length;
    if (missingCount > 0) {
      signals.push({
        id: 'recent-missing',
        severity: 'high',
        title: `${missingCount}个最近项目路径失效`,
        message: '重新定位后即可恢复入口，项目文件不会被删除。',
        intent: 'recovery',
      });
    }
    return signals;
  }, [activeProject, coreStatus, recentProjects]);

  const globalStatus = useMemo(() => {
    const arbitrator = new RendererStatusArbitrator();
    if (failure) {
      arbitrator.publish({
        id: 'failure',
        priority: 'P0',
        message: failure.message,
        persistence: 'sticky',
        createdAt: 5,
      });
    }
    if (coreStatus && coreStatus.status !== 'healthy') {
      arbitrator.publish({
        id: 'core',
        priority: 'P0',
        message: `本地服务当前为${coreStatus.status}状态，写入保持阻断。`,
        persistence: 'sticky',
        createdAt: 4,
      });
    }
    if (activeProject?.databaseMode === 'read-only') {
      arbitrator.publish({
        id: 'read-only',
        priority: 'P0',
        message: `项目处于只读保护：${activeProject.readOnlyReason ?? '兼容性保护'}。`,
        persistence: 'sticky',
        createdAt: 3,
      });
    }
    if (tasks.length > 0) {
      arbitrator.publish({
        id: 'tasks',
        priority: 'P1',
        message: `${tasks.length}个后台任务正在运行，可在底部任务栏查看真实阶段或取消。`,
        persistence: 'transient',
        createdAt: 2,
      });
    }
    const missing = recentProjects.filter((project) => project.missingSince !== null).length;
    if (missing > 0) {
      arbitrator.publish({
        id: 'missing',
        priority: 'P2',
        message: `${missing}个最近项目路径失效，可重新定位恢复入口。`,
        persistence: 'sticky',
        createdAt: 1,
      });
    }
    if (message) {
      arbitrator.publish({
        id: 'operation',
        priority: 'P3',
        message,
        persistence: 'transient',
        createdAt: 0,
      });
    }
    return arbitrator.current();
  }, [activeProject, coreStatus, failure, message, recentProjects, tasks]);

  const createProject = async (input: ProjectCreateInput): Promise<boolean> => {
    setPendingKey('project.create');
    setMessage('请选择保存位置…');
    const outcome = await bridge.project.create(input);
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) {
      setMessage('已取消创建项目。');
      return false;
    }
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目创建失败', outcome));
      setMessage(null);
      return false;
    }
    await projectChanged(outcome.data, '项目已创建，路径和数据库完整性校验通过。');
    dispatch({ type: 'navigate', route: 'writing' });
    return true;
  };

  const openSelected = async (recover: boolean): Promise<void> => {
    setPendingKey('project.openSelected');
    setMessage('请选择项目工作区…');
    const outcome = await bridge.project.openSelected();
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) {
      setMessage('已取消打开项目。');
      return;
    }
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目打开失败', outcome));
      setMessage(null);
      return;
    }
    const nextContinuation = await projectChanged(outcome.data, '项目已安全打开。');
    dispatch({
      type: 'navigate',
      route: recover ? 'recovery' : continuationRoute(nextContinuation),
    });
  };

  const openRecent = async (projectId: string): Promise<void> => {
    setPendingKey(`project.openRecent:${projectId}`);
    const outcome = await bridge.project.openRecent(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('最近项目打开失败', outcome));
      return;
    }
    const nextContinuation = await projectChanged(outcome.data, '最近项目已安全打开。');
    dispatch({ type: 'navigate', route: continuationRoute(nextContinuation) });
  };

  const closeProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止关闭项目。');
      return;
    }
    setPendingKey(`project.close:${projectId}`);
    const outcome = await bridge.project.close(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目关闭失败', outcome));
      return;
    }
    await projectChanged(null, '项目已安全关闭。');
    dispatch({ type: 'reset-project-context' });
    dispatch({ type: 'navigate', route: 'home' });
  };

  const moveProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止移动项目。');
      return;
    }
    setPendingKey(`project.move:${projectId}`);
    setMessage('请选择新位置；Core将复制、校验后再切换。');
    const outcome = await bridge.project.move(projectId);
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) {
      setMessage('已取消移动。');
      return;
    }
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目移动失败，原项目保持可用', outcome));
      return;
    }
    await projectChanged(
      outcome.data,
      outcome.data.sourceRetained
        ? '移动已完成；原位置未能清理，请确认后手动处理。'
        : '移动已完成，哈希与数据库完整性校验通过。',
    );
  };

  const relocateRecent = async (projectId: string): Promise<void> => {
    setPendingKey(`project.relocateRecent:${projectId}`);
    const outcome = await bridge.project.relocateRecent(projectId);
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) return;
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目重新定位失败', outcome));
      return;
    }
    await refreshWorkspace();
    setMessage('项目路径已重新定位。');
  };

  const removeRecent = async (projectId: string): Promise<void> => {
    setPendingKey(`project.removeRecent:${projectId}`);
    const outcome = await bridge.project.removeRecent(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('最近项目记录移除失败', outcome));
      return;
    }
    setRecentProjects((projects) => projects.filter((project) => project.projectId !== projectId));
    setMessage('最近项目记录已移除，项目文件保持不变。');
  };

  const saveSettings = (update: AppSettingsUpdate): Promise<boolean> => {
    const write = settingsWriteQueue.current.then(async () => {
      setPendingKey('settings.set');
      try {
        const current = confirmedSettings.current;
        const outcome = await bridge.settings.set({
          language: update.language ?? current.language,
          startupBehavior: update.startupBehavior ?? current.startupBehavior,
          defaultMode: update.defaultMode ?? current.defaultMode,
          creativePath: update.creativePath ?? current.creativePath,
          onboardingCompleted: update.onboardingCompleted ?? current.onboardingCompleted,
          onboardingTipsSeen: update.onboardingTipsSeen ?? current.onboardingTipsSeen,
          onboardingScaffoldDismissed:
            update.onboardingScaffoldDismissed ?? current.onboardingScaffoldDismissed,
          themeId: update.themeId ?? current.themeId,
          themeVariant: update.themeVariant ?? current.themeVariant,
          reduceMotion: update.reduceMotion ?? current.reduceMotion,
        });
        if (outcome.state !== 'success') {
          setFailure(failureFromOutcome('设置保存失败', outcome));
          return false;
        }
        confirmedSettings.current = outcome.data.settings;
        setSettings(outcome.data.settings);
        setMessage('设置已保存到应用数据库。');
        return true;
      } finally {
        setPendingKey(null);
      }
    });
    settingsWriteQueue.current = write.then(
      () => undefined,
      () => undefined,
    );
    return write;
  };

  const createFromOnboarding = async (plan: OnboardingProjectPlan): Promise<boolean> => {
    const created = await createProject(plan.project);
    if (!created) return false;

    const settingsSaved = await saveSettings({
      creativePath: plan.creativePath,
      onboardingCompleted: true,
      onboardingScaffoldDismissed: plan.project.initialStructure === 'blank',
    });
    if (plan.destination === 'import-export') {
      setDataToolsSection('import-export');
      dispatch({ type: 'navigate', route: 'recovery' });
    } else {
      dispatch({ type: 'navigate', route: plan.destination });
    }
    if (!settingsSaved) {
      setMessage('项目已安全创建；创作路径偏好未保存，可稍后在设置中重试。');
    }
    return true;
  };

  const saveAppearance = async (next: AppearancePreferences): Promise<boolean> => {
    setPendingKey('app.setAppearancePreferences');
    const outcome = await bridge.app.setAppearancePreferences(next);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('显示设置保存失败', outcome));
      return false;
    }
    setAppearance({
      workspaceAlignment: outcome.data.workspaceAlignment,
      uiScalePercent: outcome.data.uiScalePercent,
      bodyFontSize: outcome.data.bodyFontSize,
      contentWidth: outcome.data.contentWidth,
    });
    setMessage('显示设置已保存到应用数据库。');
    return true;
  };

  const restartCore = async (): Promise<void> => {
    setPendingKey('app.restartCore');
    const outcome = await bridge.app.restartCore();
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('Core重启失败', outcome));
      return;
    }
    setCoreStatus(outcome.data.status);
    setMessage(`Core已进入${outcome.data.status.status}状态。`);
    await refreshWorkspace();
  };

  const cancelTask = async (taskId: string, projectId: string | null): Promise<void> => {
    const outcome = await bridge.task.cancel(taskId, projectId ?? undefined);
    if (outcome.state !== 'success') setFailure(failureFromOutcome('任务取消失败', outcome));
    await refreshTasks();
  };

  return (
    <div className="react-app-shell" data-react-runtime="running" data-react-shell>
      <header className="react-top-bar">
        <button
          aria-expanded={navOpen}
          aria-label="打开一级导航"
          className="icon-button react-nav-toggle"
          ref={navToggle}
          type="button"
          onClick={() => setNavOpen((open) => !open)}
        >
          ☰
        </button>
        <button className="react-brand" type="button" onClick={() => navigate('home')}>
          <strong>WorldForge</strong>
          <span>{activeProject?.name ?? '本地写作工作台'}</span>
        </button>
        <div className="react-top-bar__status" aria-live="polite">
          <span data-status={coreStatus?.status ?? 'starting'}>
            Core · {coreStatus?.status ?? '正在连接'}
          </span>
          <span>{activeProject?.databaseMode === 'read-only' ? '只读' : '本地'}</span>
          <span>任务 {tasks.length}</span>
        </div>
        <button
          aria-expanded={helpOpen}
          className="quiet-button"
          data-open-context-help
          ref={helpTrigger}
          type="button"
          onClick={() => setHelpOpen((open) => !open)}
        >
          帮助
        </button>
        <button
          className="quiet-button"
          data-open-settings
          ref={settingsTrigger}
          type="button"
          onClick={() => navigate('settings')}
        >
          设置
        </button>
      </header>

      {activeProject ? (
        <section className="react-project-context" data-active-project data-react-project-context>
          <div>
            <strong data-active-project-name>{activeProject.name}</strong>
            <span data-active-project-path title={activeProject.workspacePath}>
              {activeProject.workspacePath}
            </span>
          </div>
          <span data-active-project-mode>
            {activeProject.databaseMode === 'read-only' ? '只读兼容模式' : '可写 · 本地数据库'}
          </span>
          {activeProject.databaseMode === 'read-only' ? (
            <span data-active-project-readonly>{activeProject.readOnlyReason ?? '兼容性保护'}</span>
          ) : null}
          {message ? (
            <span data-project-operation-status role="status">
              {message}
            </span>
          ) : null}
          <div className="react-project-context__actions">
            <button
              className="quiet-button"
              data-open-continuity
              type="button"
              onClick={() => {
                setCanonSection('continuity');
                void transitionToRoute('canon');
              }}
            >
              连续性账本
            </button>
            <button
              className="quiet-button"
              data-open-narrative-planning
              type="button"
              onClick={() => {
                setCanonSection('narrative');
                void transitionToRoute('canon');
              }}
            >
              伏笔与弧光
            </button>
            <button
              className="quiet-button"
              data-open-state-proposals
              type="button"
              onClick={() => {
                setCanonSection('proposals');
                void transitionToRoute('canon');
              }}
            >
              状态提案
            </button>
            <button
              className="quiet-button"
              data-open-recovery
              type="button"
              onClick={() => {
                setDataToolsSection('recovery');
                void transitionToRoute('recovery');
              }}
            >
              恢复与导出
            </button>
            <button
              className="quiet-button"
              data-open-text-io
              type="button"
              onClick={() => {
                setDataToolsSection('import-export');
                void transitionToRoute('recovery');
              }}
            >
              导入导出
            </button>
            <button
              className="quiet-button"
              data-move-project
              disabled={activeProject.databaseMode === 'read-only' || Boolean(pendingKey)}
              type="button"
              onClick={() => void moveProject(activeProject.projectId)}
            >
              移动项目
            </button>
            <button
              className="quiet-button"
              data-close-project
              disabled={Boolean(pendingKey)}
              type="button"
              onClick={() => void closeProject(activeProject.projectId)}
            >
              关闭项目
            </button>
          </div>
        </section>
      ) : null}

      <div className="react-shell-grid" data-nav-open={navOpen}>
        <nav className="react-primary-nav" aria-label="一级导航">
          {navigation.map((item) => (
            <button
              aria-current={item.current ? 'page' : undefined}
              className="react-primary-nav__item"
              data-current={item.current}
              data-open-canon={item.id === 'canon' ? '' : undefined}
              data-open-planning={item.id === 'planning' ? '' : undefined}
              data-primary-navigation={item.id}
              disabled={item.disabled}
              key={item.id}
              title={item.disabledReason ?? undefined}
              type="button"
              onClick={() => navigate(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </button>
          ))}
        </nav>
        {navOpen ? (
          <button
            aria-label="关闭一级导航"
            className="react-nav-scrim"
            type="button"
            onClick={() => setNavOpen(false)}
          />
        ) : null}

        <main className="react-main">
          {globalStatus ? (
            <SafetyBanner
              action={
                globalStatus.id === 'failure' && failure?.retryable
                  ? { label: '重新读取', run: () => void refreshWorkspace() }
                  : globalStatus.id === 'read-only'
                    ? { label: '恢复与导出', run: () => void transitionToRoute('recovery') }
                    : globalStatus.id === 'missing'
                      ? { label: '查看最近项目', run: () => navigate('home') }
                      : undefined
              }
              diagnosticId={globalStatus.id === 'failure' ? (failure?.diagnosticId ?? null) : null}
              kind={
                globalStatus.id === 'failure' || globalStatus.id === 'core'
                  ? 'danger'
                  : globalStatus.priority === 'P0' || globalStatus.priority === 'P2'
                    ? 'warning'
                    : 'info'
              }
              message={globalStatus.message}
              title={
                globalStatus.id === 'failure'
                  ? (failure?.title ?? '操作失败')
                  : globalStatus.priority === 'P0'
                    ? '保护状态'
                    : '工作区状态'
              }
            />
          ) : null}
          {helpOpen ? (
            <ContextHelp
              disclosureMode={disclosureMode}
              route={route}
              seenTips={settings.onboardingTipsSeen}
              onClose={() => {
                setHelpOpen(false);
                window.requestAnimationFrame(() => helpTrigger.current?.focus());
              }}
              onDismissTip={(tip) =>
                void saveSettings({
                  onboardingTipsSeen: [...new Set([...settings.onboardingTipsSeen, tip])],
                })
              }
              onOpenOnboarding={() => {
                setHelpOpen(false);
                if (activeProject) {
                  void saveSettings({ onboardingScaffoldDismissed: false });
                  setMessage('已在首页重新显示项目引导建议。');
                } else {
                  setOnboardingRequest((request) => request + 1);
                }
                navigate('home');
              }}
            />
          ) : null}

          {route === 'home' || route === 'project' ? (
            <HomePage
              activeProject={activeProject}
              activeTaskCount={tasks.length}
              continuation={continuation}
              disclosureMode={disclosureMode}
              healthSignals={healthSignals}
              message={message}
              onboardingRequest={onboardingRequest}
              pendingKey={pendingKey}
              providerAvailable={providerAvailable}
              recentProjects={recentProjects}
              settings={settings}
              onCloseProject={(projectId) => void closeProject(projectId)}
              onCreate={createFromOnboarding}
              onContinue={() => {
                if (activeProject) {
                  void transitionToRoute(continuationRoute(continuation));
                  return;
                }
                const recent = [...recentProjects]
                  .filter((project) => project.missingSince === null)
                  .sort(
                    (left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt),
                  )[0];
                if (recent) void openRecent(recent.projectId);
              }}
              onMoveProject={(projectId) => void moveProject(projectId)}
              onNavigate={navigate}
              onOpenRecent={(projectId) => void openRecent(projectId)}
              onOpenRecovery={() => void transitionToRoute('recovery')}
              onOpenSelected={(recover) => void openSelected(recover)}
              onRelocateRecent={(projectId) => void relocateRecent(projectId)}
              onRemoveRecent={(projectId) => void removeRecent(projectId)}
              onSaveSettings={saveSettings}
            />
          ) : null}

          {route === 'settings' ? (
            <SettingsPage
              appearance={appearance}
              bridge={bridge}
              coreStatus={coreStatus}
              disclosureMode={disclosureMode}
              message={message}
              pendingKey={pendingKey}
              settings={settings}
              onClose={() => {
                navigate('home');
                window.requestAnimationFrame(() => settingsTrigger.current?.focus());
              }}
              onResetSettings={() => {
                void bridge.settings.reset().then((outcome) => {
                  if (outcome.state === 'success') {
                    confirmedSettings.current = outcome.data.settings;
                    setSettings(outcome.data.settings);
                    setMessage('已恢复默认设置。');
                  } else setFailure(failureFromOutcome('恢复默认设置失败', outcome));
                });
              }}
              onRestartCore={() => void restartCore()}
              onSaveAppearance={saveAppearance}
              onSaveSettings={saveSettings}
              onOpenOnboarding={() => {
                if (activeProject) {
                  void saveSettings({ onboardingScaffoldDismissed: false });
                  setMessage('已在首页重新显示项目引导建议。');
                } else {
                  setOnboardingRequest((request) => request + 1);
                }
                navigate('home');
              }}
            />
          ) : null}

          {route === 'planning' && activeProject ? (
            <PlanningWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              readOnly={activeProject.databaseMode === 'read-only'}
              onClose={() => void transitionToRoute('writing')}
            />
          ) : null}

          {route === 'canon' && activeProject ? (
            <CanonWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              projectName={activeProject.name}
              readOnly={activeProject.databaseMode === 'read-only'}
              section={canonSection}
              onSectionChange={setCanonSection}
            />
          ) : null}

          {route === 'recovery' && activeProject ? (
            <DataToolsWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              readOnly={activeProject.databaseMode === 'read-only'}
              section={dataToolsSection}
              onClose={() => void transitionToRoute('writing')}
              onProjectRestored={refreshWorkspace}
              onSectionChange={setDataToolsSection}
            />
          ) : null}

          {isWritingRoute(route) && activeProject ? (
            <WritingWorkbench
              bridge={bridge}
              initialContinuation={continuation}
              panel={writingPanel}
              project={activeProject}
              onPanelChange={(panel) =>
                void transitionToRoute(
                  panel === 'versions'
                    ? 'versions'
                    : panel === 'candidates'
                      ? 'candidates'
                      : 'writing',
                )
              }
              onStatus={setMessage}
            />
          ) : null}

          {route === 'checks' && activeProject ? (
            <ChecksWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              readOnly={activeProject.databaseMode === 'read-only'}
              onOpenCanon={() => {
                setCanonSection('entities');
                void transitionToRoute('canon');
              }}
              onOpenWriting={() => void transitionToRoute('writing')}
            />
          ) : null}
        </main>
      </div>

      <TaskBar
        foregroundTaskId={foregroundTaskId}
        tasks={tasks}
        onCancel={(taskId, projectId) => void cancelTask(taskId, projectId)}
      />
    </div>
  );
}

function isWritingRoute(route: RendererRouteId): boolean {
  return route === 'writing' || route === 'versions' || route === 'candidates';
}

function continuationRoute(
  continuation: ProjectContinuationSnapshot | null,
): 'writing' | 'versions' | 'candidates' {
  if (continuation?.status !== 'ready') return 'writing';
  return continuation.panel === 'editor' ? 'writing' : continuation.panel;
}

function isCancelledOutcome(outcome: BridgeRequestOutcome<unknown>): boolean {
  return (
    outcome.state === 'cancelled' ||
    (outcome.state === 'failure' && outcome.error.code === 'COMMON_CANCELLED_004')
  );
}

interface FailureView {
  readonly title: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly diagnosticId: string | null;
}

function failureFromOutcome(title: string, outcome: BridgeRequestOutcome<unknown>): FailureView {
  if (outcome.state === 'failure') {
    return {
      title,
      message: `${outcome.error.message} · ${outcome.error.code}`,
      retryable: outcome.error.retryable,
      diagnosticId: outcome.error.diagnosticId ?? null,
    };
  }
  return {
    title,
    message: outcome.state === 'cancelled' ? '操作已取消。' : '响应已被更新请求替代。',
    retryable: outcome.state !== 'cancelled',
    diagnosticId: null,
  };
}

function contentWidthPixels(
  preference: AppearancePreferences['contentWidth'],
  viewportWidth: number,
): number {
  if (preference === 'narrow') return Math.min(720, viewportWidth - 48);
  if (preference === 'wide') return Math.min(1280, viewportWidth - 48);
  if (preference === 'adaptive') return Math.min(Math.max(720, viewportWidth * 0.72), 1440);
  return Math.min(960, viewportWidth - 48);
}
