import { useCallback, useEffect, useRef } from 'react';

import {
  DEFAULT_APP_SETTINGS,
  type AppSettings,
  type AppearancePreferences,
  type CoreStatus,
  type ProjectContinuationSnapshot,
  type ProjectWorkspaceSummary,
  type ProviderSummary,
  type RecentProject,
  type TaskSnapshot,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import { restoreAppShellRoute } from '../shell/app-shell-model.js';
import type { RendererUiStoreState } from '../state/ui-store.js';
import { continuationRoute, failureFromOutcome, type FailureView } from './app-shell-helpers.js';
import type {
  WorkspaceStartupResource,
  WorkspaceStartupResourceState,
} from './use-workspace-runtime.js';

interface WorkspaceStartupInput {
  readonly bridge: RendererBridgeAdapter;
  readonly dispatch: RendererUiStoreState['dispatch'];
  readonly applySettings: (settings: AppSettings) => void;
  readonly applyAppearance: (appearance: AppearancePreferences) => void;
  readonly applyProviders: (providers: readonly ProviderSummary[]) => void;
  readonly setCoreStatus: (status: CoreStatus | null) => void;
  readonly setActiveProject: (project: ProjectWorkspaceSummary | null) => void;
  readonly setContinuation: (continuation: ProjectContinuationSnapshot | null) => void;
  readonly setRecentProjects: (projects: readonly RecentProject[]) => void;
  readonly setTasks: (tasks: readonly TaskSnapshot[]) => void;
  readonly setResourceState: (
    resource: WorkspaceStartupResource,
    state: WorkspaceStartupResourceState,
  ) => void;
  readonly setHydrated: (hydrated: boolean) => void;
  readonly setFailure: (failure: FailureView | null) => void;
  readonly setMessage: (message: string | null) => void;
}

export function collectionStartupState(values: readonly unknown[]): WorkspaceStartupResourceState {
  return values.length === 0 ? 'empty' : 'loaded';
}

export function nullableStartupState(value: unknown | null): WorkspaceStartupResourceState {
  return value === null ? 'empty' : 'loaded';
}

export function useWorkspaceStartup({
  bridge,
  dispatch,
  applySettings,
  applyAppearance,
  applyProviders,
  setCoreStatus,
  setActiveProject,
  setContinuation,
  setRecentProjects,
  setTasks,
  setResourceState,
  setHydrated,
  setFailure,
  setMessage,
}: WorkspaceStartupInput): () => Promise<void> {
  const initialWorkspaceResolved = useRef(false);

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

    if (applicationSettings.state === 'success') applySettings(applicationSettings.data.settings);
    else nextFailure ??= failureFromOutcome('应用设置读取失败', applicationSettings);

    if (windowPreferences.state === 'success') {
      applyAppearance({
        workspaceAlignment: windowPreferences.data.workspaceAlignment,
        uiScalePercent: windowPreferences.data.uiScalePercent,
        bodyFontSize: windowPreferences.data.bodyFontSize,
        contentWidth: windowPreferences.data.contentWidth,
      });
    } else nextFailure ??= failureFromOutcome('显示设置读取失败', windowPreferences);

    if (recent.state === 'success') setRecentProjects(recent.data.projects);
    else nextFailure ??= failureFromOutcome('最近作品读取失败', recent);

    if (project.state === 'success') {
      let resolvedProject = project.data;
      if (
        !resolvedProject &&
        !initialWorkspaceResolved.current &&
        applicationSettings.state === 'success' &&
        applicationSettings.data.settings.startupBehavior === 'reopen-last' &&
        recent.state === 'success'
      ) {
        const candidate = recent.data.projects.find((item) => item.missingSince === null);
        if (candidate) {
          const reopened = await bridge.project.openRecent(candidate.projectId, {
            mode: 'replace',
          });
          if (reopened.state === 'success') resolvedProject = reopened.data;
          else if (reopened.state === 'failure')
            nextFailure ??= failureFromOutcome('最近作品自动打开失败', reopened);
        }
      }
      setActiveProject(resolvedProject);
      let routeContinuation: ProjectContinuationSnapshot | null = null;
      if (resolvedProject) {
        const continuationOutcome = await bridge.project.getContinuation(
          resolvedProject.projectId,
          { mode: 'replace' },
        );
        if (continuationOutcome.state === 'success') {
          routeContinuation = continuationOutcome.data;
          setContinuation(routeContinuation);
          setResourceState('continuation', nullableStartupState(routeContinuation));
        } else {
          setResourceState('continuation', 'degraded');
          nextFailure ??= failureFromOutcome('续写状态读取失败', continuationOutcome);
        }
      } else {
        setContinuation(null);
        setResourceState('continuation', 'empty');
      }
      if (!initialWorkspaceResolved.current) {
        initialWorkspaceResolved.current = true;
        const restoredRoute = resolvedProject ? continuationRoute(routeContinuation) : 'home';
        dispatch({
          type: 'navigate',
          route: restoreAppShellRoute(restoredRoute, {
            activeProjectId: resolvedProject?.projectId ?? null,
            disclosureMode:
              applicationSettings.state === 'success'
                ? applicationSettings.data.settings.defaultMode
                : DEFAULT_APP_SETTINGS.defaultMode,
          }),
        });
      }
    } else {
      setResourceState('continuation', 'degraded');
      nextFailure ??= failureFromOutcome('项目状态读取失败', project);
    }

    if (activeTasks.state === 'success') {
      setTasks(activeTasks.data.tasks);
      setResourceState('tasks', collectionStartupState(activeTasks.data.tasks));
    } else {
      setResourceState('tasks', 'degraded');
      nextFailure ??= failureFromOutcome('活动任务读取失败', activeTasks);
    }

    if (providers.state === 'success') {
      applyProviders(providers.data.providers);
      setResourceState('providers', collectionStartupState(providers.data.providers));
    } else {
      setResourceState('providers', 'degraded');
      nextFailure ??= failureFromOutcome('智能连接配置读取失败', providers);
    }

    setFailure(nextFailure);
    setMessage(null);
    setHydrated(true);
  }, [
    applyAppearance,
    applyProviders,
    applySettings,
    bridge,
    dispatch,
    setActiveProject,
    setContinuation,
    setCoreStatus,
    setFailure,
    setHydrated,
    setMessage,
    setRecentProjects,
    setResourceState,
    setTasks,
  ]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  return refreshWorkspace;
}
