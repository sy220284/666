import type { RecentProject, TaskSnapshot } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';

import { createHomeDashboardModel } from '../../apps/desktop/renderer/src/shell/home-dashboard-model.js';
import {
  SETTINGS_BASIC_SECTION_IDS,
  createSettingsNavigationItems,
  resolveSettingsNavigationIntent,
  restoreSettingsSection,
} from '../../apps/desktop/renderer/src/shell/settings-navigation-model.js';
import { createTaskBarModel } from '../../apps/desktop/renderer/src/shell/task-bar-model.js';

const recentProjects: readonly RecentProject[] = [
  {
    projectId: '00000000-0000-4000-8000-000000000001',
    workspacePath: '/workspace/older',
    displayName: '旧项目',
    lastOpenedAt: '2026-07-20T08:00:00.000Z',
    missingSince: null,
  },
  {
    projectId: '00000000-0000-4000-8000-000000000002',
    workspacePath: '/workspace/missing',
    displayName: '路径丢失项目',
    lastOpenedAt: '2026-07-21T08:00:00.000Z',
    missingSince: '2026-07-21T09:00:00.000Z',
  },
];

const task = (taskId: string, status: TaskSnapshot['status'], startedAt: string): TaskSnapshot => ({
  taskId,
  taskType: 'draft.generate',
  projectId: '00000000-0000-4000-8000-000000000001',
  status,
  stage: status === 'queued' ? 'queued' : 'calling_model',
  lastSequence: 1,
  startedAt,
  elapsedMs: 1_000,
});

describe('M3-08 home dashboard model', () => {
  it('prioritizes data risk and limits beginner prompts to one', () => {
    const model = createHomeDashboardModel({
      disclosureMode: 'beginner',
      continuation: null,
      recentProjects,
      activeTaskCount: -3,
      healthSignals: [
        {
          id: 'normal',
          severity: 'normal',
          title: '普通建议',
          message: '继续完善项目。',
          intent: 'checks',
        },
        {
          id: 'database-risk',
          severity: 'data-risk',
          title: '数据风险',
          message: '请先处理项目恢复。',
          intent: 'recovery',
        },
      ],
    });

    expect(model.promptLimit).toBe(1);
    expect(model.prompts.map((prompt) => prompt.id)).toEqual(['database-risk']);
    expect(model.activeTaskCount).toBe(0);
    expect(model.showDetailedTaskSummary).toBe(false);
  });

  it('shows at most two professional prompts and sorts recent projects', () => {
    const model = createHomeDashboardModel({
      disclosureMode: 'professional',
      continuation: {
        projectId: '00000000-0000-4000-8000-000000000001',
        projectName: '当前项目',
        chapterId: '00000000-0000-4000-8000-000000000010',
        chapterTitle: '第一章',
      },
      recentProjects,
      activeTaskCount: 2,
      healthSignals: [
        {
          id: 'normal',
          severity: 'normal',
          title: '普通建议',
          message: '继续完善项目。',
          intent: 'checks',
        },
        {
          id: 'high',
          severity: 'high',
          title: '高风险',
          message: '需要处理。',
          intent: 'checks',
        },
        {
          id: 'data',
          severity: 'data-risk',
          title: '数据风险',
          message: '先恢复数据。',
          intent: 'recovery',
        },
      ],
    });

    expect(model.prompts.map((prompt) => prompt.id)).toEqual(['data', 'high']);
    expect(model.recentProjects.map((project) => project.projectId)).toEqual([
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000001',
    ]);
    expect(model.recentProjects[0]).toMatchObject({
      missing: true,
      primaryIntent: 'relocate',
    });
    expect(model.recentProjects[1]).toMatchObject({
      missing: false,
      primaryIntent: 'open',
    });
    expect(model.showDetailedHealthSummary).toBe(true);
  });
});

describe('M3-08 task bar model', () => {
  it('keeps queued and running tasks visible across routes', () => {
    const runningId = '00000000-0000-4000-8000-000000000101';
    const model = createTaskBarModel(
      [
        task('00000000-0000-4000-8000-000000000102', 'queued', '2026-07-21T09:00:00Z'),
        task(runningId, 'running', '2026-07-21T10:00:00Z'),
        task('00000000-0000-4000-8000-000000000103', 'succeeded', '2026-07-21T08:00:00Z'),
      ],
      runningId,
    );

    expect(model.visible).toBe(true);
    expect(model.activeCount).toBe(2);
    expect(model.runningCount).toBe(1);
    expect(model.queuedCount).toBe(1);
    expect(model.items.map((item) => item.status)).toEqual(['running', 'queued']);
    expect(model.items[0]).toMatchObject({
      taskId: runningId,
      foreground: true,
      cancellable: true,
    });
  });

  it('hides when no active tasks remain', () => {
    const model = createTaskBarModel(
      [task('00000000-0000-4000-8000-000000000104', 'cancelled', '2026-07-21T08:00:00Z')],
      null,
    );

    expect(model).toMatchObject({
      visible: false,
      activeCount: 0,
      runningCount: 0,
      queuedCount: 0,
    });
  });
});

describe('M3-08 settings navigation model', () => {
  it('exposes only the four basic M3-08 settings sections', () => {
    const items = createSettingsNavigationItems({
      disclosureMode: 'beginner',
      currentSection: 'general',
    });

    expect(items.map((item) => item.id)).toEqual(SETTINGS_BASIC_SECTION_IDS);
    expect(items.filter((item) => item.disabled).map((item) => item.id)).toEqual([
      'editor',
      'advanced',
    ]);
    expect(items.find((item) => item.id === 'general')?.current).toBe(true);
  });

  it('changes disclosure without changing section identity or availability', () => {
    const beginner = createSettingsNavigationItems({
      disclosureMode: 'beginner',
      currentSection: 'appearance',
    });
    const professional = createSettingsNavigationItems({
      disclosureMode: 'professional',
      currentSection: 'appearance',
    });

    expect(professional.map(({ id, disabled }) => ({ id, disabled }))).toEqual(
      beginner.map(({ id, disabled }) => ({ id, disabled })),
    );
    expect(professional.find((item) => item.id === 'appearance')?.description).toContain('变体');
  });

  it('rejects unavailable placeholders and restores only legal sections', () => {
    expect(
      resolveSettingsNavigationIntent('editor', {
        disclosureMode: 'professional',
        currentSection: 'general',
      }),
    ).toMatchObject({
      accepted: false,
      section: 'editor',
      code: 'SECTION_UNAVAILABLE',
    });
    expect(
      resolveSettingsNavigationIntent('editor', {
        disclosureMode: 'professional',
        currentSection: 'general',
        availability: { editor: true },
      }),
    ).toEqual({ accepted: true, section: 'editor' });
    expect(
      restoreSettingsSection('advanced', {
        disclosureMode: 'professional',
      }),
    ).toBe('general');
    expect(
      restoreSettingsSection('appearance', {
        disclosureMode: 'professional',
      }),
    ).toBe('appearance');
    expect(
      restoreSettingsSection('invalid', {
        disclosureMode: 'professional',
      }),
    ).toBe('general');
  });
});
