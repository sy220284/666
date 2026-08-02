import { useCallback } from 'react';

import type { AppSettingsUpdate, CoreStatus, ProjectWorkspaceSummary } from '@worldforge/contracts';

import type { RendererBridgeAdapter } from '../bridge/renderer-bridge-adapter.js';
import type { DataToolsSection } from '../features/data-tools/data-tools-workbench.js';
import type { OnboardingProjectPlan } from '../features/home/home-page.js';
import type { PrimaryNavigationId } from '../shell/app-shell-model.js';
import type { RendererUiStoreState } from '../state/ui-store.js';
import { failureFromOutcome, type FailureView } from './app-shell-helpers.js';

interface AppShellActionsInput {
  readonly bridge: RendererBridgeAdapter;
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly dispatch: RendererUiStoreState['dispatch'];
  readonly flushWriting: () => Promise<boolean>;
  readonly flushSettings: () => Promise<void>;
  readonly createProject: (input: OnboardingProjectPlan['project']) => Promise<boolean>;
  readonly saveSettings: (update: AppSettingsUpdate) => Promise<boolean>;
  readonly refreshWorkspace: () => Promise<void>;
  readonly refreshTasks: () => Promise<void>;
  readonly setCoreStatus: (status: CoreStatus | null) => void;
  readonly setDataToolsSection: (section: DataToolsSection) => void;
  readonly setOnboardingRequest: (update: (request: number) => number) => void;
  readonly setPendingKey: (key: string | null) => void;
  readonly setMessage: (message: string | null) => void;
  readonly setFailure: (failure: FailureView | null) => void;
  readonly navigate: (id: PrimaryNavigationId) => void;
}

export function useAppShellActions(input: AppShellActionsInput) {
  const restartCore = useCallback(async (): Promise<void> => {
    if (!(await input.flushWriting())) {
      input.setMessage('当前稿尚未安全保存，已阻止重启本地服务。');
      return;
    }
    await input.flushSettings();
    input.setPendingKey('app.restartCore');
    const outcome = await input.bridge.app.restartCore();
    input.setPendingKey(null);
    if (outcome.state !== 'success') {
      input.setFailure(failureFromOutcome('本地服务重启失败', outcome));
      return;
    }
    input.setCoreStatus(outcome.data.status);
    input.setMessage(`本地服务已进入${outcome.data.status.status}状态。`);
    await input.refreshWorkspace();
  }, [input]);

  const cancelTask = useCallback(
    async (taskId: string, projectId: string | null): Promise<void> => {
      const outcome = await input.bridge.task.cancel(taskId, projectId ?? undefined);
      if (outcome.state !== 'success') {
        input.setFailure(failureFromOutcome('任务取消失败', outcome));
      }
      await input.refreshTasks();
    },
    [input],
  );

  const createFromOnboarding = useCallback(
    async (plan: OnboardingProjectPlan): Promise<boolean> => {
      const created = await input.createProject(plan.project);
      if (!created) return false;
      const settingsSaved = await input.saveSettings({
        creativePath: plan.creativePath,
        onboardingCompleted: true,
        onboardingScaffoldDismissed: plan.project.initialStructure === 'blank',
      });
      if (plan.destination === 'import-export') {
        input.setDataToolsSection('import-export');
        input.dispatch({ type: 'navigate', route: 'recovery' });
      } else {
        input.dispatch({ type: 'navigate', route: plan.destination });
      }
      if (!settingsSaved) {
        input.setMessage('项目已安全创建；创作路径偏好未保存，可稍后在设置中重试。');
      }
      return true;
    },
    [input],
  );

  const openOnboarding = useCallback((): void => {
    if (input.activeProject) {
      void input.saveSettings({ onboardingScaffoldDismissed: false });
      input.setMessage('已在首页重新显示项目引导建议。');
    } else {
      input.setOnboardingRequest((request) => request + 1);
    }
    input.navigate('home');
  }, [input]);

  return { restartCore, cancelTask, createFromOnboarding, openOnboarding };
}
