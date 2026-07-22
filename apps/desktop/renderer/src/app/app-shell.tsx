import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_APPEARANCE_PREFERENCES,
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppSettingsUpdate,
  type AppearancePreferences,
  type CoreStatus,
  type ProjectCreateInput,
  type ProjectWorkspaceSummary,
  type RecentProject,
  type TaskSnapshot,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { BridgeRequestOutcome } from '../bridge/request-lifecycle.js';
import { SafetyBanner } from '../components/safety-banner.js';
import { TaskBar } from '../components/task-bar.js';
import type { LegacySurfaceController } from '../compat/legacy-surface.js';
import { CanonWorkbench, type CanonSection } from '../features/canon/canon-workbench.js';
import {
  DataToolsWorkbench,
  type DataToolsSection,
} from '../features/data-tools/data-tools-workbench.js';
import { HomePage } from '../features/home/home-page.js';
import { PlanningWorkbench, StructureNavigator } from '../features/planning/planning-workbench.js';
import { SettingsPage } from '../features/settings/settings-page.js';
import {
  createPrimaryNavigationItems,
  resolvePrimaryNavigationIntent,
  restoreAppShellRoute,
  type AppDisclosureMode,
  type PrimaryNavigationId,
} from '../shell/app-shell-model.js';
import type { HomeHealthSignal } from '../shell/home-dashboard-model.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';
import { useRendererUiStore } from '../state/ui-store.js';

export interface AppShellProps {
  readonly bridge: RendererBridgeAdapter;
  readonly legacySurface: LegacySurfaceController;
}

export function AppShell({ bridge, legacySurface }: AppShellProps) {
  const route = useRendererUiStore((state) => state.route);
  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [navOpen, setNavOpen] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const initialWorkspaceResolved = useRef(false);
  const settingsWriteQueue = useRef<Promise<void>>(Promise.resolve());
  const confirmedSettings = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [activeProject, setActiveProject] = useState<ProjectWorkspaceSummary | null>(null);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [appearance, setAppearance] = useState<AppearancePreferences>(
    DEFAULT_APPEARANCE_PREFERENCES,
  );
  const [coreStatus, setCoreStatus] = useState<CoreStatus | null>(null);
  const [tasks, setTasks] = useState<readonly TaskSnapshot[]>([]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [message, setMessage] = useState<string | null>('正在读取本地工作区…');
  const [failure, setFailure] = useState<FailureView | null>(null);
  const [canonSection, setCanonSection] = useState<CanonSection>('entities');
  const [dataToolsSection, setDataToolsSection] = useState<DataToolsSection>('recovery');

  const disclosureMode: AppDisclosureMode = settings.defaultMode;

  const refreshTasks = useCallback(async (): Promise<void> => {
    const outcome = await bridge.task.listActive(undefined, { mode: 'replace' });
    if (outcome.state === 'success') setTasks(outcome.data.tasks);
  }, [bridge]);

  const refreshWorkspace = useCallback(async (): Promise<void> => {
    const [core, applicationSettings, windowPreferences, project, recent, activeTasks] =
      await Promise.all([
        bridge.app.getCoreStatus({ mode: 'replace' }),
        bridge.settings.get({ mode: 'replace' }),
        bridge.app.getWindowPreferences({ mode: 'replace' }),
        bridge.project.getActive({ mode: 'replace' }),
        bridge.project.listRecent({ mode: 'replace' }),
        bridge.task.listActive(undefined, { mode: 'replace' }),
      ]);

    if (core.state === 'success') setCoreStatus(core.data);
    else setFailure(failureFromOutcome('Core状态读取失败', core));
    if (applicationSettings.state === 'success') {
      confirmedSettings.current = applicationSettings.data.settings;
      setSettings(applicationSettings.data.settings);
    } else setFailure(failureFromOutcome('应用设置读取失败', applicationSettings));
    if (windowPreferences.state === 'success') {
      setAppearance({
        workspaceAlignment: windowPreferences.data.workspaceAlignment,
        uiScalePercent: windowPreferences.data.uiScalePercent,
        bodyFontSize: windowPreferences.data.bodyFontSize,
        contentWidth: windowPreferences.data.contentWidth,
      });
    } else setFailure(failureFromOutcome('显示设置读取失败', windowPreferences));
    if (project.state === 'success') {
      setActiveProject(project.data);
      if (!initialWorkspaceResolved.current) {
        initialWorkspaceResolved.current = true;
        dispatch({
          type: 'navigate',
          route: restoreAppShellRoute(project.data ? 'writing' : 'home', {
            activeProjectId: project.data?.projectId ?? null,
            disclosureMode:
              applicationSettings.state === 'success'
                ? applicationSettings.data.settings.defaultMode
                : DEFAULT_APP_SETTINGS.defaultMode,
          }),
        });
      }
    } else setFailure(failureFromOutcome('项目状态读取失败', project));
    if (recent.state === 'success') setRecentProjects(recent.data.projects);
    else setFailure(failureFromOutcome('最近项目读取失败', recent));
    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);

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
    legacySurface.applyPresentation(
      settings,
      appearance,
      activeProject?.databaseMode === 'read-only' ? 'read-only' : activeProject ? 'open' : 'closed',
    );
  }, [activeProject, appearance, legacySurface, settings]);

  useEffect(() => {
    if (isLegacyBusinessRoute(route)) {
      legacySurface.activate(route);
    } else {
      legacySurface.deactivate();
    }
  }, [legacySurface, route]);

  useEffect(() => {
    legacySurface.refreshPlacement();
  });

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
    checks: false,
    settings: true,
  } as const;
  const navigation = createPrimaryNavigationItems({
    activeProjectId: activeProject?.projectId ?? null,
    currentRoute: route,
    disclosureMode,
    availability,
  });

  const transitionToRoute = useCallback(
    async (nextRoute: RendererRouteId): Promise<boolean> => {
      if (route === nextRoute) {
        return true;
      }
      if (route !== nextRoute && isLegacyBusinessRoute(route)) {
        const flushed = await legacySurface.flushPendingDraft();
        if (!flushed) {
          setMessage('自动保存失败，已阻止离开当前工作台。');
          return false;
        }
      }
      dispatch({ type: 'navigate', route: nextRoute });
      return true;
    },
    [dispatch, legacySurface, route],
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
      setFailure(null);
      setMessage(null);
      setNavOpen(false);
      void transitionToRoute(resolution.route).then((changed) => {
        if (changed && navigationId === 'home') {
          void refreshWorkspace();
        }
      });
    },
    [activeProject, disclosureMode, refreshWorkspace, route, transitionToRoute],
  );

  const projectChanged = useCallback(
    async (project: ProjectWorkspaceSummary | null, resultMessage: string): Promise<void> => {
      setActiveProject(project);
      legacySurface.synchronizeProjectContext();
      const recent = await bridge.project.listRecent({ mode: 'replace' });
      if (recent.state === 'success') setRecentProjects(recent.data.projects);
      setMessage(resultMessage);
    },
    [bridge, legacySurface],
  );

  const healthSignals = useMemo<readonly HomeHealthSignal[]>(() => {
    const signals: HomeHealthSignal[] = [];
    if (coreStatus && coreStatus.status !== 'healthy') {
      signals.push({
        id: 'core-health',
        severity: 'data-risk',
        title: 'Core需要处理',
        message: `当前状态：${coreStatus.status}。写入操作会保持阻断，直到Core恢复健康。`,
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
        message: '重新定位后即可恢复最近项目入口，项目文件不会被删除。',
        intent: 'recovery',
      });
    }
    return signals;
  }, [activeProject, coreStatus, recentProjects]);

  const createProject = async (input: ProjectCreateInput): Promise<boolean> => {
    setPendingKey('project.create');
    setMessage('请选择保存位置…');
    const outcome = await bridge.project.create(input);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('项目创建失败', outcome));
      setMessage(null);
      return false;
    }
    await projectChanged(outcome.data, '项目已创建，Core已验证路径和数据库完整性。');
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
    await projectChanged(outcome.data, '项目已安全打开。');
    dispatch({ type: 'navigate', route: recover ? 'recovery' : 'writing' });
  };

  const openRecent = async (projectId: string): Promise<void> => {
    setPendingKey(`project.openRecent:${projectId}`);
    const outcome = await bridge.project.openRecent(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('最近项目打开失败', outcome));
      return;
    }
    await projectChanged(outcome.data, '最近项目已安全打开。');
    dispatch({ type: 'navigate', route: 'writing' });
  };

  const closeProject = async (projectId: string): Promise<void> => {
    if (!(await legacySurface.flushPendingDraft())) {
      setMessage('自动保存失败，已阻止关闭项目。');
      return;
    }
    setPendingKey(`project.close:${projectId}`);
    setMessage('正在安全关闭项目…');
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
    if (!(await legacySurface.flushPendingDraft())) {
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

  const legacyRoute = isLegacyBusinessRoute(route);

  return (
    <div
      className="react-app-shell"
      data-legacy-route={legacyRoute}
      data-react-runtime="running"
      data-react-shell
    >
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
            {legacyRoute ? (
              <button
                className="quiet-button"
                type="button"
                onClick={legacySurface.toggleProjectPanel}
              >
                卷章目录
              </button>
            ) : null}
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

        <main className="react-main" data-legacy-placeholder={legacyRoute}>
          {failure ? (
            <SafetyBanner
              action={
                failure.retryable
                  ? { label: '重新读取', run: () => void refreshWorkspace() }
                  : undefined
              }
              diagnosticId={failure.diagnosticId}
              kind="danger"
              message={failure.message}
              title={failure.title}
            />
          ) : null}
          {activeProject?.databaseMode === 'read-only' ? (
            <SafetyBanner
              action={{
                label: '恢复与导出',
                run: () => void transitionToRoute('recovery'),
              }}
              kind="warning"
              message={`项目处于只读保护：${activeProject.readOnlyReason ?? '兼容性保护'}。`}
              title="写入已禁用，浏览和安全导出仍可用"
            />
          ) : null}
          {route === 'home' || route === 'project' ? (
            <HomePage
              activeProject={activeProject}
              activeTaskCount={tasks.length}
              disclosureMode={disclosureMode}
              healthSignals={healthSignals}
              message={message}
              pendingKey={pendingKey}
              recentProjects={recentProjects}
              onCloseProject={(projectId) => void closeProject(projectId)}
              onCreate={createProject}
              onMoveProject={(projectId) => void moveProject(projectId)}
              onNavigate={navigate}
              onOpenRecent={(projectId) => void openRecent(projectId)}
              onOpenRecovery={() => void transitionToRoute('recovery')}
              onOpenSelected={(recover) => void openSelected(recover)}
              onRelocateRecent={(projectId) => void relocateRecent(projectId)}
              onRemoveRecent={(projectId) => void removeRecent(projectId)}
            />
          ) : null}
          {route === 'settings' ? (
            <SettingsPage
              appearance={appearance}
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
          {legacyRoute ? (
            <>
              <div className="react-legacy-heading" role="status">
                <strong>{navigation.find((item) => item.current)?.label ?? '工作台'}</strong>
                <span>正文、Version与Candidate仍由兼容层承载；卷章目录已由React管理。</span>
              </div>
              {activeProject && route === 'writing' ? (
                <div data-react-structure-rail>
                  <StructureNavigator
                    bridge={bridge}
                    compact
                    projectId={activeProject.projectId}
                    readOnly={activeProject.databaseMode === 'read-only'}
                    onOpenChapter={(chapter) => legacySurface.openChapter(chapter.id)}
                    onBeforeWrite={legacySurface.flushPendingDraft}
                    onStatus={setMessage}
                  />
                </div>
              ) : null}
            </>
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

function isLegacyBusinessRoute(route: RendererRouteId): boolean {
  return ['writing', 'versions', 'candidates', 'checks'].includes(route);
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
