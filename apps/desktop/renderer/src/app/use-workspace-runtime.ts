import { useCallback, useEffect, useRef, useState } from 'react';

import type { CoreStatus, ProjectWorkspaceSummary, TaskSnapshot } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import {
  EMPTY_WORKSPACE_ATTENTION,
  loadWorkspaceAttention,
  type WorkspaceAttention,
} from '../runtime/workspace-attention.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';

export type WorkspaceStartupResource = 'tasks' | 'providers' | 'continuation';
export type WorkspaceStartupResourceState = 'loaded' | 'empty' | 'degraded';

export interface WorkspaceStartupResourceStates {
  readonly tasks: WorkspaceStartupResourceState | null;
  readonly providers: WorkspaceStartupResourceState | null;
  readonly continuation: WorkspaceStartupResourceState | null;
}

const INITIAL_STARTUP_RESOURCE_STATES: WorkspaceStartupResourceStates = {
  tasks: null,
  providers: null,
  continuation: null,
};

export function useWorkspaceRuntime({
  bridge,
  activeProject,
  route,
}: {
  readonly bridge: RendererBridgeAdapter;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly route: RendererRouteId;
}) {
  const attentionGeneration = useRef(0);
  const [coreStatus, setCoreStatus] = useState<CoreStatus | null>(null);
  const [tasks, setTasks] = useState<readonly TaskSnapshot[]>([]);
  const [startupResources, setStartupResources] = useState<WorkspaceStartupResourceStates>(
    INITIAL_STARTUP_RESOURCE_STATES,
  );
  const [workspaceAttention, setWorkspaceAttention] =
    useState<WorkspaceAttention>(EMPTY_WORKSPACE_ATTENTION);
  const [hydrated, setHydrated] = useState(false);

  const setStartupResourceState = useCallback(
    (resource: WorkspaceStartupResource, state: WorkspaceStartupResourceState): void => {
      setStartupResources((current) => ({ ...current, [resource]: state }));
    },
    [],
  );

  const projectId = activeProject?.projectId;
  const refreshTasks = useCallback(async (): Promise<void> => {
    const outcome = await bridge.task.listActive(projectId, { mode: 'replace' });
    if (outcome.state === 'success') {
      setTasks(outcome.data.tasks);
      setStartupResourceState('tasks', outcome.data.tasks.length === 0 ? 'empty' : 'loaded');
      return;
    }
    setStartupResourceState('tasks', 'degraded');
  }, [bridge, projectId, setStartupResourceState]);

  useEffect(() => {
    void refreshTasks();
    const unsubscribe = bridge.task.subscribe(() => void refreshTasks(), projectId);
    return unsubscribe;
  }, [bridge, projectId, refreshTasks]);

  const refreshWorkspaceAttention = useCallback(async (): Promise<void> => {
    const generation = attentionGeneration.current + 1;
    attentionGeneration.current = generation;
    if (!activeProject) {
      setWorkspaceAttention(EMPTY_WORKSPACE_ATTENTION);
      return;
    }
    const next = await loadWorkspaceAttention(bridge, activeProject.projectId);
    if (attentionGeneration.current !== generation) return;
    setWorkspaceAttention(next);
  }, [activeProject, bridge]);

  useEffect(() => {
    void refreshWorkspaceAttention();
    return () => {
      attentionGeneration.current += 1;
    };
  }, [refreshWorkspaceAttention, route, tasks]);

  useEffect(() => {
    if (hydrated) document.body.dataset.rendererReady = 'true';
  }, [hydrated]);

  return {
    coreStatus,
    tasks,
    startupResources,
    workspaceAttention,
    hydrated,
    setCoreStatus,
    setTasks,
    setStartupResourceState,
    setHydrated,
    refreshTasks,
    refreshWorkspaceAttention,
  };
}
