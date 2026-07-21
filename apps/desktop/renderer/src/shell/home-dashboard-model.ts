import type { RecentProject } from '@worldforge/contracts';

import type { AppDisclosureMode } from './app-shell-model.js';

export type HomeHealthSeverity = 'data-risk' | 'high' | 'normal';
export type HomePromptIntent = 'recovery' | 'checks' | 'settings';
export type RecentProjectIntent = 'open' | 'relocate';

export interface HomeHealthSignal {
  readonly id: string;
  readonly severity: HomeHealthSeverity;
  readonly title: string;
  readonly message: string;
  readonly intent: HomePromptIntent;
}

export interface HomeContinuation {
  readonly projectId: string;
  readonly projectName: string;
  readonly chapterId: string;
  readonly chapterTitle: string;
}

export interface HomeDashboardInput {
  readonly disclosureMode: AppDisclosureMode;
  readonly continuation: HomeContinuation | null;
  readonly recentProjects: readonly RecentProject[];
  readonly healthSignals: readonly HomeHealthSignal[];
  readonly activeTaskCount: number;
}

export interface HomePromptCard extends HomeHealthSignal {
  readonly priority: number;
}

export interface RecentProjectCard {
  readonly projectId: string;
  readonly displayName: string;
  readonly workspacePath: string;
  readonly lastOpenedAt: string;
  readonly missing: boolean;
  readonly primaryIntent: RecentProjectIntent;
}

export interface HomeDashboardModel {
  readonly disclosureMode: AppDisclosureMode;
  readonly continuation: HomeContinuation | null;
  readonly promptLimit: 1 | 2;
  readonly prompts: readonly HomePromptCard[];
  readonly recentProjects: readonly RecentProjectCard[];
  readonly activeTaskCount: number;
  readonly showDetailedTaskSummary: boolean;
  readonly showDetailedHealthSummary: boolean;
  readonly createProjectAvailable: true;
  readonly importProjectAvailable: true;
}

const HOME_HEALTH_PRIORITY: Readonly<Record<HomeHealthSeverity, number>> = {
  'data-risk': 0,
  high: 1,
  normal: 2,
};

export function createHomeDashboardModel(input: HomeDashboardInput): HomeDashboardModel {
  const promptLimit = input.disclosureMode === 'beginner' ? 1 : 2;
  const prompts = [...input.healthSignals]
    .sort((left, right) => {
      const priorityDifference =
        HOME_HEALTH_PRIORITY[left.severity] - HOME_HEALTH_PRIORITY[right.severity];
      if (priorityDifference !== 0) return priorityDifference;
      return left.id.localeCompare(right.id);
    })
    .slice(0, promptLimit)
    .map((signal) => ({
      ...signal,
      priority: HOME_HEALTH_PRIORITY[signal.severity],
    }));

  const recentProjects = [...input.recentProjects]
    .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt))
    .map((project) => ({
      projectId: project.projectId,
      displayName: project.displayName,
      workspacePath: project.workspacePath,
      lastOpenedAt: project.lastOpenedAt,
      missing: project.missingSince !== null,
      primaryIntent: project.missingSince === null ? 'open' : 'relocate',
    })) satisfies RecentProjectCard[];

  return {
    disclosureMode: input.disclosureMode,
    continuation: input.continuation,
    promptLimit,
    prompts,
    recentProjects,
    activeTaskCount: Math.max(0, Math.trunc(input.activeTaskCount)),
    showDetailedTaskSummary: input.disclosureMode === 'professional',
    showDetailedHealthSummary: input.disclosureMode === 'professional',
    createProjectAvailable: true,
    importProjectAvailable: true,
  };
}
