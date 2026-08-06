import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

import type {
  ProjectContinuationSnapshot,
  ProjectCreateInput,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import {
  RendererCommandCoordinator,
  type RendererCommandResult,
  type RendererCommandScope,
} from '../runtime/command-coordinator.js';
import type { RendererUiStoreState } from '../state/ui-store.js';
import {
  continuationRoute,
  failureFromOutcome,
  isCancelledOutcome,
  type FailureView,
} from './app-shell-helpers.js';
import { prepareProjectSessionTransition } from './project-session-transition.js';

const PROJECT_SESSION_COMMAND = 'project-session';

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

function unexpectedFailure(title: string): FailureView {
  return {
    title,
    message: '操作未完成，当前内容仍保留，请重试。',
    retryable: true,
    diagnosticId: null,
  };
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
  const commandCoordinator = useRef(new RendererCommandCoordinator()).current;

  useEffect(
    () => () => {
      commandCoordinator.invalidateAll();
    },
    [commandCoordinator],
  );

  useEffect(() => {
    dispatch({
      type: 'select',
      selection: { projectId: activeProject?.projectId ?? null },
    });
  }, [activeProject, dispatch]);

  const prepareProjectTransition = useCallback(
    async (blockedMessage: string, scope?: RendererCommandScope): Promise<boolean> => {
      if (!(await flushWriting())) {
        if (scope?.isCurrent() ?? true) setMessage(blockedMessage);
        return false;
      }
      if (scope && !scope.isCurrent()) return false;
      await flushSettings();
      return scope?.isCurrent() ?? true;
    },
    [flushSettings, flushWriting, setMessage],
  );

  const refreshRecentProjects = useCallback(
    async (scope?: RendererCommandScope): Promise<void> => {
      const recent = await bridge.project.listRecent({ mode: 'replace' });
      if (scope && !scope.isCurrent()) return;
      if (recent.state === 'success') setRecentProjects(recent.data.projects);
    },
    [bridge, setRecentProjects],
  );

  const projectChanged = useCallback(
    async (
      project: ProjectWorkspaceSummary | null,
      resultMessage: string,
      scope?: RendererCommandScope,
    ): Promise<ProjectContinuationSnapshot | null> => {
      const transition = await prepareProjectSessionTransition({
        bridge,
        project,
        isCurrent: () => scope?.isCurrent() ?? true,
      });
      if (transition.state === 'stale') return null;
      setActiveProject(transition.project);
      setContinuation(transition.continuation);
      await refreshRecentProjects(scope);
      if (scope && !scope.isCurrent()) return null;
      setMessage(resultMessage);
      return transition.continuation;
    },
    [bridge, refreshRecentProjects, setActiveProject, setContinuation, setMessage],
  );

  const runProjectCommand = useCallback(
    async <Value>(
      pendingKey: string,
      failureTitle: string,
      operation: (scope: RendererCommandScope) => Promise<Value>,
    ): Promise<RendererCommandResult<Value>> => {
      setPendingKey(pendingKey);
      const result = await commandCoordinator.run({
        key: PROJECT_SESSION_COMMAND,
        policy: 'replace',
        operation,
      });
      if (commandCoordinator.isLatest(PROJECT_SESSION_COMMAND, result.token)) {
        setPendingKey(null);
        if (result.state === 'failed') {
          setFailure(unexpectedFailure(failureTitle));
          setMessage(null);
        }
      }
      return result;
    },
    [commandCoordinator, setFailure, setMessage, setPendingKey],
  );

  const createProject = useCallback(
    async (input: ProjectCreateInput): Promise<boolean> => {
      const result = await runProjectCommand('project.create', '作品创建失败', async (scope) => {
        if (!(await prepareProjectTransition('自动保存失败，已阻止创建并切换项目。', scope))) {
          return false;
        }
        if (!scope.isCurrent()) return false;
        setMessage('请选择保存位置…');
        const outcome = await bridge.project.create(input);
        if (!scope.isCurrent()) return false;
        if (isCancelledOutcome(outcome)) {
          setMessage('已取消创建项目。');
          return false;
        }
        if (outcome.state !== 'success') {
          setFailure(failureFromOutcome('作品创建失败', outcome));
          setMessage(null);
          return false;
        }
        await projectChanged(outcome.data, '项目已创建，路径和数据库完整性校验通过。', scope);
        if (!scope.isCurrent()) return false;
        dispatch({ type: 'navigate', route: 'writing' });
        return true;
      });
      return result.state === 'completed' && result.value;
    },
    [
      bridge,
      dispatch,
      prepareProjectTransition,
      projectChanged,
      runProjectCommand,
      setFailure,
      setMessage,
    ],
  );

  const openSelected = useCallback(
    async (recover: boolean): Promise<void> => {
      await runProjectCommand('project.openSelected', '作品打开失败', async (scope) => {
        if (!(await prepareProjectTransition('自动保存失败，已阻止切换作品。', scope))) return;
        if (!scope.isCurrent()) return;
        setMessage('请选择作品目录…');
        const outcome = await bridge.project.openSelected();
        if (!scope.isCurrent()) return;
        if (isCancelledOutcome(outcome)) {
          setMessage('已取消打开项目。');
          return;
        }
        if (outcome.state !== 'success') {
          setFailure(failureFromOutcome('作品打开失败', outcome));
          setMessage(null);
          return;
        }
        const nextContinuation = await projectChanged(outcome.data, '项目已安全打开。', scope);
        if (!scope.isCurrent()) return;
        dispatch({
          type: 'navigate',
          route: recover ? 'recovery' : continuationRoute(nextContinuation),
        });
      });
    },
    [
      bridge,
      dispatch,
      prepareProjectTransition,
      projectChanged,
      runProjectCommand,
      setFailure,
      setMessage,
    ],
  );

  const openRecent = useCallback(
    async (projectId: string): Promise<void> => {
      await runProjectCommand(
        `project.openRecent:${projectId}`,
        '最近作品打开失败',
        async (scope) => {
          if (!(await prepareProjectTransition('自动保存失败，已阻止切换作品。', scope))) {
            return;
          }
          const outcome = await bridge.project.openRecent(projectId);
          if (!scope.isCurrent()) return;
          if (outcome.state !== 'success') {
            setFailure(failureFromOutcome('最近作品打开失败', outcome));
            return;
          }
          const nextContinuation = await projectChanged(
            outcome.data,
            '最近作品已安全打开。',
            scope,
          );
          if (!scope.isCurrent()) return;
          dispatch({ type: 'navigate', route: continuationRoute(nextContinuation) });
        },
      );
    },
    [bridge, dispatch, prepareProjectTransition, projectChanged, runProjectCommand, setFailure],
  );

  const closeProject = useCallback(
    async (projectId: string): Promise<void> => {
      await runProjectCommand(`project.close:${projectId}`, '作品关闭失败', async (scope) => {
        if (!(await prepareProjectTransition('自动保存失败，已阻止关闭项目。', scope))) {
          return;
        }
        const outcome = await bridge.project.close(projectId);
        if (!scope.isCurrent()) return;
        if (outcome.state !== 'success') {
          setFailure(failureFromOutcome('作品关闭失败', outcome));
          return;
        }
        await projectChanged(null, '项目已安全关闭。', scope);
        if (!scope.isCurrent()) return;
        dispatch({ type: 'reset-project-context' });
        dispatch({ type: 'navigate', route: 'home' });
      });
    },
    [bridge, dispatch, prepareProjectTransition, projectChanged, runProjectCommand, setFailure],
  );

  const moveProject = useCallback(
    async (projectId: string): Promise<void> => {
      await runProjectCommand(
        `project.move:${projectId}`,
        '作品移动失败，原项目保持可用',
        async (scope) => {
          if (!(await prepareProjectTransition('自动保存失败，已阻止移动项目。', scope))) {
            return;
          }
          if (!scope.isCurrent()) return;
          setMessage('请选择新位置；本地服务将复制、校验后再切换。');
          const outcome = await bridge.project.move(projectId);
          if (!scope.isCurrent()) return;
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
            scope,
          );
        },
      );
    },
    [bridge, prepareProjectTransition, projectChanged, runProjectCommand, setFailure, setMessage],
  );

  const relocateRecent = useCallback(
    async (projectId: string): Promise<void> => {
      await runProjectCommand(
        `project.relocateRecent:${projectId}`,
        '作品重新定位失败',
        async (scope) => {
          const outcome = await bridge.project.relocateRecent(projectId);
          if (!scope.isCurrent()) return;
          if (isCancelledOutcome(outcome)) return;
          if (outcome.state !== 'success') {
            setFailure(failureFromOutcome('作品重新定位失败', outcome));
            return;
          }
          await refreshRecentProjects(scope);
          if (scope.isCurrent()) setMessage('作品路径已重新定位。');
        },
      );
    },
    [bridge, refreshRecentProjects, runProjectCommand, setFailure, setMessage],
  );

  const removeRecent = useCallback(
    async (projectId: string): Promise<void> => {
      await runProjectCommand(
        `project.removeRecent:${projectId}`,
        '最近作品记录移除失败',
        async (scope) => {
          const outcome = await bridge.project.removeRecent(projectId);
          if (!scope.isCurrent()) return;
          if (outcome.state !== 'success') {
            setFailure(failureFromOutcome('最近作品记录移除失败', outcome));
            return;
          }
          setRecentProjects((projects) =>
            projects.filter((project) => project.projectId !== projectId),
          );
          setMessage('最近作品记录已移除，作品文件保持不变。');
        },
      );
    },
    [bridge, runProjectCommand, setFailure, setMessage, setRecentProjects],
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
