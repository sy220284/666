import type {
  AppSettings,
  CoreStatus,
  ProjectWorkspaceSummary,
  RecentProject,
  TaskSnapshot,
} from '@worldforge/contracts';

import type { AiReadiness } from '../runtime/ai-readiness.js';
import { RendererStatusArbitrator, type RendererStatus } from '../runtime/status-arbitrator.js';
import type { WorkspaceAttention } from '../runtime/workspace-attention.js';
import type { HomeHealthSignal } from '../shell/home-dashboard-model.js';
import type { FailureView } from './app-shell-helpers.js';
import type { WorkspaceStartupResourceStates } from './use-workspace-runtime.js';

export function buildHomeHealthSignals({
  activeProject,
  coreStatus,
  recentProjects,
}: {
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly coreStatus: CoreStatus | null;
  readonly recentProjects: readonly RecentProject[];
}): readonly HomeHealthSignal[] {
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
}

export function buildGlobalStatus({
  activeProject,
  aiReadiness,
  coreStatus,
  creativePath,
  failure,
  message,
  recentProjects,
  startupResources,
  tasks,
  workspaceAttention,
}: {
  readonly activeProject: ProjectWorkspaceSummary | null;
  readonly aiReadiness: AiReadiness;
  readonly coreStatus: CoreStatus | null;
  readonly creativePath: AppSettings['creativePath'];
  readonly failure: FailureView | null;
  readonly message: string | null;
  readonly recentProjects: readonly RecentProject[];
  readonly startupResources?: WorkspaceStartupResourceStates;
  readonly tasks: readonly TaskSnapshot[];
  readonly workspaceAttention: WorkspaceAttention;
}): RendererStatus | null {
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
  const degradedResources = (
    [
      ['tasks', '任务状态'],
      ['providers', 'AI连接'],
      ['continuation', '续写位置'],
    ] as const
  )
    .filter(([resource]) => startupResources?.[resource] === 'degraded')
    .map(([, label]) => label);
  if (degradedResources.length > 0) {
    arbitrator.publish({
      id: 'startup-degraded',
      priority: 'P1',
      message: `${degradedResources.join('、')}读取失败；界面保留上一次可信值，请重新读取后再据此判断当前状态。`,
      persistence: 'sticky',
      createdAt: 71,
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
      message: `AI审阅有${workspaceAttention.pendingProposalCount}条建议等待作者处理；尚未写入人物与世界。`,
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
  if (creativePath === 'ai-first' && aiReadiness.status !== 'ready') {
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
}
