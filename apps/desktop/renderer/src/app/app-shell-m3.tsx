import { useCallback, useMemo, useRef, useState } from 'react';

import type {
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { CanonSection } from '../features/canon/canon-workbench.js';
import type { DataToolsSection } from '../features/data-tools/data-tools-workbench.js';
import type { WritingPanel } from '../features/writing/writing-workbench.js';
import { deriveCapabilityMatrix } from '../runtime/capability-matrix.js';
import { restoreAppShellRoute, type AppDisclosureMode } from '../shell/app-shell-model.js';
import { useRendererUiStore } from '../state/ui-store.js';
import { AppShellLayout } from './app-shell-layout.js';
import { AppShellPages } from './app-shell-pages.js';
import { buildGlobalStatus, buildHomeHealthSignals } from './app-shell-status.js';
import type { FailureView } from './app-shell-helpers.js';
import type { RendererApplicationController } from './renderer-application-controller.js';
import { useAppSettingsPersistence } from './use-app-settings-persistence.js';
import { useAppShellActions } from './use-app-shell-actions.js';
import { useAppShellNavigation } from './use-app-shell-navigation.js';
import { useProjectSessionController } from './use-project-session-controller.js';
import { useWorkspaceRuntime } from './use-workspace-runtime.js';
import { useWorkspaceStartup } from './use-workspace-startup.js';

export interface AppShellProps {
  readonly bridge: RendererBridgeAdapter;
  readonly applicationController: RendererApplicationController;
}

export function AppShell({ applicationController, bridge }: AppShellProps) {
  const route = useRendererUiStore((state) => state.route);
  const dispatch = useRendererUiStore((state) => state.dispatch);
  const [activeProject, setActiveProject] = useState<ProjectWorkspaceSummary | null>(null);
  const [continuation, setContinuation] = useState<ProjectContinuationSnapshot | null>(null);
  const [recentProjects, setRecentProjects] = useState<readonly RecentProject[]>([]);
  const [onboardingRequest, setOnboardingRequest] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>('正在读取本地工作区…');
  const [failure, setFailure] = useState<FailureView | null>(null);
  const [canonSection, setCanonSection] = useState<CanonSection>('entities');
  const [dataToolsSection, setDataToolsSection] = useState<DataToolsSection>('recovery');
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const flushWriting = useCallback(
    async (): Promise<boolean> => applicationController.flushPendingDraft(),
    [applicationController],
  );

  const settingsController = useAppSettingsPersistence({
    bridge,
    activeProject,
    setPendingKey,
    setMessage,
    setFailure,
    applicationController,
  });
  const projectController = useProjectSessionController({
    bridge,
    dispatch,
    activeProject,
    setActiveProject,
    setContinuation,
    setRecentProjects,
    flushWriting,
    flushSettings: settingsController.flushSettings,
    setPendingKey,
    setMessage,
    setFailure,
  });
  const runtime = useWorkspaceRuntime({ bridge, activeProject, route });
  const refreshWorkspace = useWorkspaceStartup({
    bridge,
    dispatch,
    applySettings: settingsController.applySettings,
    applyAppearance: settingsController.applyAppearance,
    applyProviders: settingsController.applyProviders,
    setCoreStatus: runtime.setCoreStatus,
    setActiveProject,
    setContinuation,
    setRecentProjects,
    setTasks: runtime.setTasks,
    setResourceState: runtime.setStartupResourceState,
    setHydrated: runtime.setHydrated,
    setFailure,
    setMessage,
  });
  const capabilities = useMemo(
    () =>
      deriveCapabilityMatrix({
        hydrated: runtime.hydrated,
        coreStatus: runtime.coreStatus,
        project: activeProject,
        providerCount: settingsController.providers.length,
        verifiedProviderCount: settingsController.verifiedProviderIds.size,
      }),
    [
      activeProject,
      runtime.coreStatus,
      runtime.hydrated,
      settingsController.providers.length,
      settingsController.verifiedProviderIds,
    ],
  );
  const disclosureMode: AppDisclosureMode = settingsController.settings.defaultMode;
  const navigation = useAppShellNavigation({
    activeProjectId: activeProject?.projectId ?? null,
    disclosureMode,
    availability: capabilities.navigation,
    flushWriting,
    refreshWorkspace,
    setCanonEntities: () => setCanonSection('entities'),
    setFailure,
    setMessage,
  });
  const actions = useAppShellActions({
    bridge,
    activeProject,
    dispatch,
    flushWriting,
    flushSettings: settingsController.flushSettings,
    createProject: projectController.createProject,
    saveSettings: settingsController.saveSettings,
    refreshWorkspace,
    refreshTasks: runtime.refreshTasks,
    setCoreStatus: runtime.setCoreStatus,
    setDataToolsSection,
    setOnboardingRequest,
    setPendingKey,
    setMessage,
    setFailure,
    navigate: navigation.navigate,
  });

  const writingPanel: WritingPanel =
    route === 'versions' ? 'versions' : route === 'candidates' ? 'candidates' : 'editor';
  const healthSignals = useMemo(
    () =>
      buildHomeHealthSignals({
        activeProject,
        coreStatus: runtime.coreStatus,
        recentProjects,
      }),
    [activeProject, recentProjects, runtime.coreStatus],
  );
  const globalStatus = useMemo(
    () =>
      buildGlobalStatus({
        activeProject,
        aiReadiness: settingsController.aiReadiness,
        coreStatus: runtime.coreStatus,
        creativePath: settingsController.settings.creativePath,
        failure,
        message,
        recentProjects,
        tasks: runtime.tasks,
        workspaceAttention: runtime.workspaceAttention,
      }),
    [
      activeProject,
      failure,
      message,
      recentProjects,
      runtime.coreStatus,
      runtime.tasks,
      runtime.workspaceAttention,
      settingsController.aiReadiness,
      settingsController.settings.creativePath,
    ],
  );
  const globalStatusAction = useMemo(() => {
    if (!globalStatus) return undefined;
    if (globalStatus.id === 'failure' && failure?.retryable)
      return { label: '重新读取', run: () => void refreshWorkspace() };
    if (globalStatus.id === 'read-only')
      return { label: '恢复与导出', run: () => void navigation.transitionToRoute('recovery') };
    if (globalStatus.id === 'missing')
      return { label: '查看最近作品', run: () => navigation.navigate('home') };
    if (globalStatus.id === 'candidate-partial' || globalStatus.id === 'candidate-pending')
      return { label: '审阅建议稿', run: () => void navigation.transitionToRoute('candidates') };
    if (globalStatus.id === 'proposal-pending')
      return {
        label: '处理设定更新建议',
        run: () => {
          setCanonSection('continuity');
          void navigation.transitionToRoute('canon');
        },
      };
    if (globalStatus.id === 'backup-failed')
      return { label: '打开恢复中心', run: () => void navigation.transitionToRoute('recovery') };
    if (['validation-open', 'search-failed', 'search-stale'].includes(globalStatus.id))
      return { label: '打开检查', run: () => void navigation.transitionToRoute('checks') };
    if (globalStatus.id === 'ai-readiness')
      return { label: '检查AI连接', run: () => navigation.navigate('settings') };
    return undefined;
  }, [failure, globalStatus, navigation, refreshWorkspace]);

  const closeSettings = useCallback((): void => {
    const returnRoute = restoreAppShellRoute(navigation.settingsReturnRoute.current, {
      activeProjectId: activeProject?.projectId ?? null,
      disclosureMode,
    });
    void navigation.transitionToRoute(returnRoute).then((changed) => {
      if (changed) window.requestAnimationFrame(() => navigation.settingsTrigger.current?.focus());
    });
  }, [activeProject?.projectId, disclosureMode, navigation]);

  return (
    <AppShellLayout
      activeProject={activeProject}
      capabilities={capabilities}
      coreStatus={runtime.coreStatus}
      tasks={runtime.tasks}
      pendingKey={pendingKey}
      message={message}
      navigation={navigation.navigation}
      disclosureMode={disclosureMode}
      route={route}
      settings={settingsController.settings}
      failure={failure}
      globalStatus={globalStatus}
      {...(globalStatusAction ? { globalStatusAction } : {})}
      foregroundTaskId={navigation.foregroundTaskId}
      navOpen={navigation.navOpen}
      helpOpen={helpOpen}
      navToggle={navigation.navToggle}
      settingsTrigger={navigation.settingsTrigger}
      helpTrigger={helpTrigger}
      mainContent={navigation.mainContent}
      onNavOpenChange={navigation.setNavOpen}
      onHelpOpenChange={setHelpOpen}
      onNavigate={navigation.navigate}
      onTransitionToRoute={navigation.transitionToRoute}
      onOpenCanonSection={(section) => {
        setCanonSection(section);
        void navigation.transitionToRoute('canon');
      }}
      onOpenDataToolsSection={(section) => {
        setDataToolsSection(section);
        void navigation.transitionToRoute('recovery');
      }}
      onMoveProject={projectController.moveProject}
      onCloseProject={projectController.closeProject}
      onSaveSettings={settingsController.saveSettings}
      onOpenOnboarding={actions.openOnboarding}
      onCancelTask={actions.cancelTask}
    >
      <AppShellPages
        bridge={bridge}
        route={route}
        activeProject={activeProject}
        continuation={continuation}
        recentProjects={recentProjects}
        tasks={runtime.tasks}
        healthSignals={healthSignals}
        capabilities={capabilities}
        disclosureMode={disclosureMode}
        aiReadiness={settingsController.aiReadiness}
        settings={settingsController.settings}
        appearance={settingsController.appearance}
        coreStatus={runtime.coreStatus}
        message={message}
        onboardingRequest={onboardingRequest}
        pendingKey={pendingKey}
        canonSection={canonSection}
        dataToolsSection={dataToolsSection}
        writingPanel={writingPanel}
        selection={navigation.selection}
        navigationQuery={navigation.navigationQuery}
        onCreateFromOnboarding={actions.createFromOnboarding}
        onCloseProject={projectController.closeProject}
        onMoveProject={projectController.moveProject}
        onOpenRecent={projectController.openRecent}
        onOpenSelected={projectController.openSelected}
        onRelocateRecent={projectController.relocateRecent}
        onRemoveRecent={projectController.removeRecent}
        onNavigate={navigation.navigate}
        onNavigateToAuthorTarget={navigation.navigateToAuthorTarget}
        onTransitionToRoute={navigation.transitionToRoute}
        onCloseSettings={closeSettings}
        onReturnToAuthorSource={navigation.returnToAuthorSource}
        onSaveSettings={settingsController.saveSettings}
        onResetSettings={settingsController.resetSettings}
        onSaveAppearance={settingsController.saveAppearance}
        onRestartCore={actions.restartCore}
        onProvidersChanged={settingsController.applyProviders}
        onProviderConnectionVerified={settingsController.verifyProvider}
        onProviderInvalidated={settingsController.invalidateProvider}
        onOpenOnboarding={actions.openOnboarding}
        onCanonSectionChange={setCanonSection}
        onDataToolsSectionChange={setDataToolsSection}
        onProjectRestored={async () => {
          await refreshWorkspace();
          setMessage('项目恢复完成，已重新读取项目上下文。');
        }}
        onWritingStatus={setMessage}
      />
    </AppShellLayout>
  );
}
