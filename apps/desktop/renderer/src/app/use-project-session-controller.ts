import { useCallback, useEffect, type Dispatch, type SetStateAction } from 'react';

import type {
  ProjectContinuationSnapshot,
  ProjectCreateInput,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { RendererUiStoreState } from '../state/ui-store.js';
import {
  continuationRoute,
  failureFromOutcome,
  isCancelledOutcome,
  type FailureView,
} from './app-shell-helpers.js';

interface ProjectSessionControllerInput {
  readonly bridge: RendererBridgeAdapter;
  readonly dispatch: RendererUiStoreState['dispatch'];
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly setActiveProject: Dispatch<SetStateAction<ProjectWorkspaceSummary | null>>;
  readonly setContinuation: Dispatch<SetStateAction<ProjectContinuationSnapshot | null>>;
  readonly setRecentProjects: Dispatch<SetStateAction<readonly RecentProject[]>>;
  readonly flushWriting: () => Promise<boolean>;
  readonly flushSettings: () => Promise<void>;
  readonly setPendingKey: (key: string | null) => void;
  readonly setMessage: (message: string | null) => void;
  readonly setFailure: (failure: FailureView | null) => void;
}

export function useProjectSessionController({
  bridge,
  dispatch,
  activeProject,
  setActiveProject,
  setContinuation,
  setRecentProjects,
  flushWriting,
  flushSettings,
  setPendingKey,
  setMessage,
  setFailure,
}: ProjectSessionControllerInput) {
  useEffect(() => {
    dispatch({
      type: 'select',
      selection: { projectId: activeProject?.projectId ?? null },
    });
  }, [activeProject, dispatch]);

  const prepareProjectTransition = useCallback(
    async (blockedMessage: string): Promise<boolean> => {
      if (!(await flushWriting())) {
        setMessage(blockedMessage);
        return false;
      }
      await flushSettings();
      return true;
    },
    [flushSettings, flushWriting, setMessage],
  );

  const refreshRecentProjects = useCallback(async (): Promise<void> => {
    const recent = await bridge.project.listRecent({ mode: 'replace' });
    if (recent.state === 'success') setRecentProjects(recent.data.projects);
  }, [bridge, setRecentProjects]);

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
      await refreshRecentProjects();
      setMessage(resultMessage);
      return nextContinuation;
    },
    [bridge, refreshRecentProjects, setActiveProject, setContinuation, setMessage],
  );

  const createProject = useCallback(
    async (input: ProjectCreateInput): Promise<boolean> => {
      if (!(await prepareProjectTransition('自动保存失败，已阻止创建并切换项目。'))) return false;
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
    }, [bridge, dispatch, prepareProjectTransition, projectChanged, setFailure, setMessage, setPendingKey],
  );

  const openSelected = useCallback(
    async (recover: boolean): Promise<void> => {
      if (!(await prepareProjectTransition('自动保存失败，已阻止切换作品。'))) return;
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
    }, [bridge, dispatch, prepareProjectTransition, projectChanged, setFailure, setMessage, setPendingKey],
  );

  const openRecent = useCallback(
    async (projectId: string): Promise<void> => {
      if (!(await prepareProjectTransition('自动保存失败，已阻止切换作品。'))) return;
      setPendingKey(`project.openRecent:${projectId}`);
      const outcome = await bridge.project.openRecent(projectId);
      setPendingKey(null);
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('最近作品打开失败', outcome));
        return;
      }
      const nextContinuation = await projectChanged(outcome.data, '最近作品已安全打开。');
      dispatch({ type: 'navigate', route: continuationRoute(nextContinuation) });
    }, [bridge, dispatch, prepareProjectTransition, projectChanged, setFailure, setPendingKey],
  );

  const closeProject = useCallback(
    async (projectId: string): Promise<void> => {
      if (!(await prepareProjectTransition('自动保存失败，已阻止关闭项目。'))) return;
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
    }, [bridge, dispatch, prepareProjectTransition, projectChanged, setFailure, setPendingKey],
  );

  const moveProject = useCallback(
    async (projectId: string): Promise<void> => {
      if (!(await prepareProjectTransition('自动保存失败，已阻止移动项目。'))) return;
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
    }, [bridge, prepareProjectTransition, projectChanged, setFailure, setMessage, setPendingKey],
  );

  const relocateRecent = useCallback(
    async (projectId: string): Promise<void> => {
      setPendingKey(`project.relocateRecent:${projectId}`);
      const outcome = await bridge.project.relocateRecent(projectId);
      setPendingKey(null);
      if (isCancelledOutcome(outcome)) return;
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('作品重新定位失败', outcome));
        return;
      }
      await refreshRecentProjects();
      setMessage('作品路径已重新定位。');
    }, [bridge, refreshRecentProjects, setFailure, setMessage, setPendingKey],
  );

  const removeRecent = useCallback(
    async (projectId: string): Promise<void> => {
      setPendingKey(`project.removeRecent:${projectId}`);
      const outcome = await bridge.project.removeRecent(projectId);
      setPendingKey(null);
      if (outcome.state !== 'success') {
        setFailure(failureFromOutcome('最近作品记录移除失败', outcome));
        return;
      }
      setRecentProjects((projects) =>
        projects.filter((project) => project.projectId !== projectId),
      );
      setMessage('最近作品记录已移除，作品文件保持不变。');
    }, [bridge, setFailure, setMessage, setPendingKey, setRecentProjects],
  );

  return {
    refreshRecentProjects,
    projectChanged,
    createProject,
    openSelected,
    openRecent,
    closeProject,
    moveProject,
    relocateRecent,
    removeRecent,
  };
}
