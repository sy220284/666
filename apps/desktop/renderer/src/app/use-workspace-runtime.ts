import { useCallback, useEffect, useRef, useState } from 'react';

import type { CoreStatus, ProjectWorkspaceSummary, TaskSnapshot } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import {
  EMPTY_WORKSPACE_ATTENTION,
  loadWorkspaceAttention,
  type WorkspaceAttention,
} from '../runtime/workspace-attention.js';
import type { RendererRouteId } from '../state/ui-state-boundary.js';

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
  const [workspaceAttention, setWorkspaceAttention] =
    useState<WorkspaceAttention>(EMPTY_WORKSPACE_ATTENTION);
  const [hydrated, setHydrated] = useState(false);

  const projectId = activeProject?.projectId;
  const refreshTasks = useCallback(async (): Promise<void> => {
    const outcome = await bridge.task.listActive(projectId, { mode: 'replace' });
    if (outcome.state === 'success') setTasks(outcome.data.tasks);
  }, [bridge, projectId]);

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
    workspaceAttention,
    hydrated,
    setCoreStatus,
    setTasks,
    setHydrated,
    refreshTasks,
    refreshWorkspaceAttention,
  };
}
