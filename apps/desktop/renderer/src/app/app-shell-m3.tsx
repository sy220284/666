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
  type ProviderConnectionTestResult,
  type ProviderSummary,
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
import {
  resolveAuthorNavigationTarget,
  type AuthorNavigationTarget,
} from '../shell/navigation-target.js';
import type { HomeHealthSignal } from '../shell/home-dashboard-model.js';
import { resolveAiReadiness } from '../runtime/ai-readiness.js';
import { deriveCapabilityMatrix } from '../runtime/capability-matrix.js';
import { flushRegisteredDraft } from '../runtime/draft-flush-registry.js';
import { RendererStatusArbitrator } from '../runtime/status-arbitrator.js';
import {
  EMPTY_WORKSPACE_ATTENTION,
  loadWorkspaceAttention,
  type WorkspaceAttention,
} from '../runtime/workspace-attention.js';
import type { RendererReturnLocation, RendererRouteId } from '../state/ui-state-boundary.js';
import { useRendererUiStore } from '../state/ui-store.js';

import { authorErrorSummary } from '../presentation/author-error-message.js';
export interface AppShellProps {
  readonly bridge: RendererBridgeAdapter;
  readonly legacySurface?: unknown;
}

export function AppShell({ bridge }: AppShellProps) {
  const route = useRendererUiStore((state) => state.route);
  const selection = useRendererUiStore((state) => state.selection);
  const filters = useRendererUiStore((state) => state.filters);
  const returnLocation = useRendererUiStore((state) => state.returnLocation);
  const navigationQuery = useRendererUiStore((state) => state.filters['navigation.query'] ?? null);
  const foregroundTaskId = useRendererUiStore((state) => state.foregroundRequestKey);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [navOpen, setNavOpen] = useState(false);
  const navToggle = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const settingsReturnRoute = useRef<RendererRouteId>('home');
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const mainContent = useRef<HTMLElement>(null);
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
  const [providers, setProviders] = useState<readonly ProviderSummary[]>([]);
  const [verifiedProviderIds, setVerifiedProviderIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [workspaceAttention, setWorkspaceAttention] =
    useState<WorkspaceAttention>(EMPTY_WORKSPACE_ATTENTION);
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
  const aiReadiness = useMemo(
    () => resolveAiReadiness(providers, verifiedProviderIds),
    [providers, verifiedProviderIds],
  );
  const capabilities = useMemo(
    () =>
      deriveCapabilityMatrix({
        hydrated,
        coreStatus,
        project: activeProject,
        providerCount: providers.length,
        verifiedProviderCount: verifiedProviderIds.size,
      }),
    [activeProject, coreStatus, hydrated, providers.length, verifiedProviderIds],
  );

  const applyProviders = useCallback((nextProviders: readonly ProviderSummary[]): void => {
    setProviders(nextProviders);
    const currentIds = new Set(nextProviders.map((provider) => provider.id));
    setVerifiedProviderIds(
      (current) => new Set([...current].filter((providerId) => currentIds.has(providerId))),
    );
  }, []);

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
    else nextFailure = failureFromOutcome('本地服务状态读取失败', core);

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
    else nextFailure ??= failureFromOutcome('最近作品读取失败', recent);

    if (activeTasks.state === 'success') setTasks(activeTasks.data.tasks);
    if (providers.state === 'success') applyProviders(providers.data.providers);
    setFailure(nextFailure);
    setMessage(null);
    setHydrated(true);
  }, [applyProviders, bridge, dispatch]);

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

  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {
    if (!activeProject) {
      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);
      return;
    }
    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);
    setWorkspaceAttention(next);
  }, [activeProject, bridge]);

  useEffect(() => {
    void refreshWorkspaceAttention();
  }, [refreshWorkspaceAttention, route, tasks]);

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

  const availability = capabilities.navigation;

  const navigation = createPrimaryNavigationItems({
    activeProjectId: activeProject?.projectId ?? null,
    currentRoute: route,
    disclosureMode,
    availability,
  });

  const flushWriting = useCallback(async (): Promise<boolean> => {
    return flushRegisteredDraft();
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
      if (resolution.route === 'settings' && route !== 'settings') {
        settingsReturnRoute.current = route;
      }
      void transitionToRoute(resolution.route).then((changed) => {
        if (changed && navigationId === 'home') void refreshWorkspace();
      });
    },
    [
      activeProject,
      availability,
      disclosureMode,
      refreshWorkspace,
      route,
      transitionToRoute,
    ],
  );

  const navigateToAuthorTarget = useCallback(
    (target: AuthorNavigationTarget): void => {
      const resolution = resolveAuthorNavigationTarget(target);
      void (async () => {
        if (route !== resolution.route && isWritingRoute(route) && !(await flushWriting())) {
          setMessage('自动保存失败，已阻止离开当前写作会话。');
          return;
        }
        setFailure(null);
        setMessage(null);
        const sourceLocation: RendererReturnLocation = {
          route,
          selection: { ...selection },
          filters: { ...filters },
          scrollTop: Math.max(0, Math.round(mainContent.current?.scrollTop ?? 0)),
          focusKey: authorReturnFocusKey(document.activeElement),
        };
        if (target.type === 'entity') setCanonSection('entities');
        dispatch({ type: 'select', selection: resolution.selection });
        for (const [key, value] of Object.entries(resolution.filters)) {
          dispatch({ type: 'set-filter', key, value });
        }
        dispatch({
          type: 'navigate',
          route: resolution.route,
          returnLocation: sourceLocation,
        });
      })();
    },
    [dispatch, filters, flushWriting, route, selection],
  );

  const returnToAuthorSource = useCallback(async (): Promise<void> => {
    if (!returnLocation) return;
    if (isWritingRoute(route) && !(await flushWriting())) {
      setMessage('自动保存失败，已阻止返回来源页面。');
      return;
    }
    const location = returnLocation;
    dispatch({ type: 'return-to-source' });
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (mainContent.current) mainContent.current.scrollTop = location.scrollTop;
        focusAuthorReturnTarget(location.focusKey);
      });
    });
  }, [dispatch, flushWriting, returnLocation, route]);

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
        title: '本地服务需要处理',
        message: `当前状态：${coreStatus.status}。写入保持阻断，直到本地服务恢复正常。`,
        intent: 'settings',
      });
    }
    if (activeProject?.databaseMode === 'read-only') {
      signals.push({
        id: 'project-readonly',
        severity: 'data-risk',
        title: '作品处于只读保护',
        message: `原因：${activeProject.readOnlyReason ?? '兼容性保护'}。可以浏览并安全导出。`,
        intent: 'recovery',
      });
    }
    const missingCount = recentProjects.filter((project) => project.missingSince !== null).length;
    if (missingCount > 0) {
      signals.push({
        id: 'recent-missing',
        severity: 'high',
        title: `${missingCount}个最近作品路径失效`,
        message: '重新定位后即可恢复入口，作品文件不会被删除。',
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
        message: `作品处于只读保护：${activeProject.readOnlyReason ?? '兼容性保护'}。`,
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
        createdAt: 70,
      });
    }
    if (workspaceAttention.searchStatus === 'rebuilding') {
      arbitrator.publish({
        id: 'search-rebuilding',
        priority: 'P1',
        message: '全文索引正在重建；写作保持可用，搜索结果将在完成后恢复完整。',
        persistence: 'transient',
        createdAt: 69,
      });
    }
    if (workspaceAttention.partialCandidateCount > 0) {
      arbitrator.publish({
        id: 'candidate-partial',
        priority: 'P2',
        message: `当前章节有${workspaceAttention.partialCandidateCount}份未完成建议稿待处理，不能直接定稿。`,
        persistence: 'sticky',
        createdAt: 60,
      });
    } else if (workspaceAttention.pendingCandidateCount > 0) {
      arbitrator.publish({
        id: 'candidate-pending',
        priority: 'P2',
        message: `当前章节有${workspaceAttention.pendingCandidateCount}份建议稿待作者审阅。`,
        persistence: 'sticky',
        createdAt: 59,
      });
    }
    if (workspaceAttention.pendingProposalCount > 0) {
      arbitrator.publish({
        id: 'proposal-pending',
        priority: 'P2',
        message: `有${workspaceAttention.pendingProposalCount}条设定更新建议等待作者裁决；尚未写入权威状态。`,
        persistence: 'sticky',
        createdAt: 58,
      });
    }
    if (workspaceAttention.openValidationCount > 0) {
      arbitrator.publish({
        id: 'validation-open',
        priority: 'P2',
        message: workspaceAttention.highValidationCount
          ? `有${workspaceAttention.openValidationCount}项检查问题待处理，其中${workspaceAttention.highValidationCount}项为高优先级。`
          : `有${workspaceAttention.openValidationCount}项检查问题待处理。`,
        persistence: 'sticky',
        createdAt: 57,
      });
    }
    if (workspaceAttention.backupFailureCount > 0) {
      arbitrator.publish({
        id: 'backup-failed',
        priority: 'P2',
        message: `有${workspaceAttention.backupFailureCount}次备份失败尚未由后续成功备份解除。`,
        persistence: 'sticky',
        createdAt: 57,
      });
    }
    if (workspaceAttention.searchFailedCount > 0) {
      arbitrator.publish({
        id: 'search-failed',
        priority: 'P2',
        message: `全文索引有${workspaceAttention.searchFailedCount}项失败；权威数据未受影响，可重建索引。`,
        persistence: 'sticky',
        createdAt: 56,
      });
    } else if (workspaceAttention.searchStatus === 'stale') {
      arbitrator.publish({
        id: 'search-stale',
        priority: 'P2',
        message: '全文索引已过期；搜索可降级读取权威数据，建议重建索引。',
        persistence: 'sticky',
        createdAt: 55,
      });
    }
    if (settings.creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
      arbitrator.publish({
        id: 'ai-readiness',
        priority: 'P2',
        message: aiReadiness.message,
        persistence: 'sticky',
        createdAt: 54,
      });
    }
    if (workspaceAttention.unavailableSources.length > 0) {
      arbitrator.publish({
        id: 'attention-unavailable',
        priority: 'P3',
        message: '部分工作区状态暂不可读取；未将失败查询误报为空状态。',
        persistence: 'transient',
        createdAt: 10,
      });
    }
    const missing = recentProjects.filter((project) => project.missingSince !== null).length;
    if (missing > 0) {
      arbitrator.publish({
        id: 'missing',
        priority: 'P2',
        message: `${missing}个最近作品路径失效，可重新定位恢复入口。`,
        persistence: 'sticky',
        createdAt: 53,
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
  }, [
    activeProject,
    aiReadiness,
    coreStatus,
    failure,
    message,
    recentProjects,
    settings.creativePath,
    tasks,
    workspaceAttention,
  ]);

  const globalStatusAction = useMemo(() => {
    if (!globalStatus) return undefined;
    if (globalStatus.id === 'failure' && failure?.retryable) {
      return { label: '重新读取', run: () => void refreshWorkspace() };
    }
    if (globalStatus.id === 'read-only') {
      return { label: '恢复与导出', run: () => void transitionToRoute('recovery') };
    }
    if (globalStatus.id === 'missing') {
      return { label: '查看最近作品', run: () => navigate('home') };
    }
    if (globalStatus.id === 'candidate-partial' || globalStatus.id === 'candidate-pending') {
      return { label: '审阅建议稿', run: () => void transitionToRoute('candidates') };
    }
    if (globalStatus.id === 'proposal-pending') {
      return {
        label: '处理设定更新建议',
        run: () => {
          setCanonSection('continuity');
          void transitionToRoute('canon');
        },
      };
    }
    if (
      globalStatus.id === 'validation-open' ||
      globalStatus.id === 'search-failed' ||
      globalStatus.id === 'search-stale' ||
      globalStatus.id === 'backup-failed'
    ) {
      return globalStatus.id === 'backup-failed'
        ? { label: '打开恢复中心', run: () => void transitionToRoute('recovery') }
        : { label: '打开检查', run: () => void transitionToRoute('checks') };
    }
    if (globalStatus.id === 'ai-readiness') {
      return { label: '检查AI连接', run: () => navigate('settings') };
    }
    return undefined;
  }, [failure, globalStatus, navigate, refreshWorkspace, transitionToRoute]);

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
      setFailure(failureFromOutcome('作品创建失败', outcome));
      setMessage(null);
      return false;
    }
    await projectChanged(outcome.data, '项目已创建，路径和数据库完整性校验通过。');
    dispatch({ type: 'navigate', route: 'writing' });
    return true;
  };

  const openSelected = async (recover: boolean): Promise<void> => {
    setPendingKey('project.openSelected');
    setMessage('请选择作品目录…');
    const outcome = await bridge.project.openSelected();
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) {
      setMessage('已取消打开项目。');
      return;
    }
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('作品打开失败', outcome));
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
      setFailure(failureFromOutcome('最近作品打开失败', outcome));
      return;
    }
    const nextContinuation = await projectChanged(outcome.data, '最近作品已安全打开。');
    dispatch({ type: 'navigate', route: continuationRoute(nextContinuation) });
  };

  const closeProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止关闭项目。');
      return;
    }
    setPendingKey(`project.close:${projectId}`);
    try {
      const outcome = await bridge.project.close(projectId);
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('作品关闭失败', outcome));
        return;
      }
      await projectChanged(null, '项目已安全关闭。');
      dispatch({ type: 'reset-project-context' });
      dispatch({ type: 'navigate', route: 'home' });
    } finally {
      setPendingKey(null);
    }
  };

  const moveProject = async (projectId: string): Promise<void> => {
    if (!(await flushWriting())) {
      setMessage('自动保存失败，已阻止移动项目。');
      return;
    }
    setPendingKey(`project.move:${projectId}`);
    setMessage('请选择新位置；本地服务将复制、校验后再切换。');
    const outcome = await bridge.project.move(projectId);
    setPendingKey(null);
    if (isCancelledOutcome(outcome)) {
      setMessage('已取消移动。');
      return;
    }
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('作品移动失败，原项目保持可用', outcome));
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
      setFailure(failureFromOutcome('作品重新定位失败', outcome));
      return;
    }
    await refreshWorkspace();
    setMessage('作品路径已重新定位。');
  };

  const removeRecent = async (projectId: string): Promise<void> => {
    setPendingKey(`project.removeRecent:${projectId}`);
    const outcome = await bridge.project.removeRecent(projectId);
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('最近作品记录移除失败', outcome));
      return;
    }
    setRecentProjects((projects) => projects.filter((project) => project.projectId !== projectId));
    setMessage('最近作品记录已移除，作品文件保持不变。');
  };

  const saveSettings = (update: AppSettingsUpdate): Promise<boolean> => {
    if (update.creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
      setMessage('AI优先需要先在本次会话完成真实连接测试；离线创作功能保持可用。');
      return Promise.resolve(false);
    }
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
    if (!(await flushWriting())) {
      setMessage('当前稿尚未安全保存，已阻止重启本地服务。');
      return;
    }
    setPendingKey('app.restartCore');
    const outcome = await bridge.app.restartCore();
    setPendingKey(null);
    if (outcome.state !== 'success') {
      setFailure(failureFromOutcome('本地服务重启失败', outcome));
      return;
    }
    setCoreStatus(outcome.data.status);
    setMessage(`本地服务已进入${outcome.data.status.status}状态。`);
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
            本地服务 · {coreStatus?.status ?? '正在连接'}
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
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，连续性账本暂不可读取。'
              }
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
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，伏笔与弧光暂不可读取。'
              }
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
              disabled={!capabilities.project.canonReadable || Boolean(pendingKey)}
              title={
                capabilities.project.canonReadable
                  ? undefined
                  : '当前作品处于恢复保护状态，设定更新建议暂不可读取。'
              }
              type="button"
              onClick={() => {
                setCanonSection('proposals');
                void transitionToRoute('canon');
              }}
            >
              设定更新建议
            </button>
            <button
              className="quiet-button"
              data-open-recovery
              disabled={
                (!capabilities.project.restoreAvailable && !capabilities.project.exportAvailable) ||
                Boolean(pendingKey)
              }
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
              disabled={!capabilities.project.exportAvailable || Boolean(pendingKey)}
              title={
                capabilities.project.exportAvailable ? undefined : '当前作品无法安全导入或导出。'
              }
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
              disabled={!capabilities.project.moveAvailable || Boolean(pendingKey)}
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

        <main className="react-main" ref={mainContent}>
          {globalStatus ? (
            <SafetyBanner
              action={globalStatusAction}
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
              projectCapabilities={capabilities.project}
              providerAvailable={aiReadiness.status === 'ready'}
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
              aiReady={aiReadiness.status === 'ready'}
              onProvidersChanged={applyProviders}
              onProviderConnectionVerified={(result: ProviderConnectionTestResult) => {
                setVerifiedProviderIds((current) => new Set([...current, result.providerId]));
              }}
              onProviderInvalidated={(providerId) => {
                setVerifiedProviderIds((current) => {
                  const next = new Set(current);
                  next.delete(providerId);
                  return next;
                });
              }}
              onClose={() => {
                const target = restoreAppShellRoute(settingsReturnRoute.current, {
                  activeProjectId: activeProject?.projectId ?? null,
                  disclosureMode,
                });
                void transitionToRoute(target).then((changed) => {
                  if (changed) window.requestAnimationFrame(() => settingsTrigger.current?.focus());
                });
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
              onReturn={() => void returnToAuthorSource()}
            />
          ) : null}

          {route === 'canon' && activeProject ? (
            <CanonWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              projectName={activeProject.name}
              readOnly={activeProject.databaseMode === 'read-only'}
              section={canonSection}
              selectedEntityId={selection.entityId}
              onSectionChange={setCanonSection}
              onReturn={() => void returnToAuthorSource()}
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
              disclosureMode={disclosureMode}
              initialContinuation={continuation}
              panel={writingPanel}
              project={activeProject}
              navigationChapterId={selection.chapterId}
              navigationLogicalBlockId={selection.logicalBlockId}
              navigationVersionId={selection.versionId}
              navigationQuery={navigationQuery}
              onNavigate={navigateToAuthorTarget}
              onPanelChange={(panel) =>
                void transitionToRoute(
                  panel === 'versions'
                    ? 'versions'
                    : panel === 'candidates'
                      ? 'candidates'
                      : 'writing',
                )
              }
              onStatus={(nextMessage) => {
                setMessage(nextMessage);
                void refreshWorkspaceAttention();
              }}
              onReturn={() => void returnToAuthorSource()}
            />
          ) : null}

          {route === 'checks' && activeProject ? (
            <ChecksWorkbench
              bridge={bridge}
              projectId={activeProject.projectId}
              readOnly={activeProject.databaseMode === 'read-only'}
              onNavigate={navigateToAuthorTarget}
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

function authorReturnFocusKey(element: Element | null): string | null {
  return element instanceof HTMLElement ? (element.dataset.authorReturnKey ?? null) : null;
}

function focusAuthorReturnTarget(focusKey: string | null): void {
  if (!focusKey) return;
  const target = Array.from(
    document.querySelectorAll<HTMLElement>('[data-author-return-key]'),
  ).find((element) => element.dataset.authorReturnKey === focusKey);
  target?.focus();
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
      message: authorErrorSummary(outcome.error),
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
