import { createRequire } from 'node:module';

import type { AppSettings, ProjectBrief, ProjectWorkspaceSummary } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import { AppShellLayout } from '../../apps/desktop/renderer/src/app/app-shell-layout.js';
import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { CanonWorkbench } from '../../apps/desktop/renderer/src/features/canon/canon-core-workbench.js';
import { BeginnerPlanningQuestions } from '../../apps/desktop/renderer/src/features/planning/brief/beginner-planning-questions.js';
import { ProjectBriefEditor } from '../../apps/desktop/renderer/src/features/planning/brief/project-brief-editor.js';
import { PlanningWorkbench } from '../../apps/desktop/renderer/src/features/planning/professional-planning-workbench.js';
import type { CapabilityMatrix } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';
import type { PrimaryNavigationItem } from '../../apps/desktop/renderer/src/shell/app-shell-model.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

const bridge = contractInput<RendererBridgeAdapter>({});
const projectId = '11111111-1111-4111-8111-111111111111';

function render(component: Parameters<typeof createElement>[0], props: object): string {
  return renderToStaticMarkup(createElement(component, props));
}

describe('代码质量治理：Renderer 0% 岛第二批直接渲染', () => {
  it('覆盖完整规划与卷章导航的初始安全状态', () => {
    const html = render(PlanningWorkbench, {
      bridge,
      projectId,
      readOnly: false,
      onClose: () => undefined,
    });

    expect(html).toContain('完整规划工作台');
    expect(html).toContain('卷章目录');
    expect(html).toContain('正在读取作品核心');
    expect(html).toContain('故事大纲');
    expect(html).toContain('从左侧选择章节后编辑场景');
  });

  it('覆盖简明规划的加载态，确保同一 ProjectBrief 入口可渲染', () => {
    const html = render(BeginnerPlanningQuestions, {
      bridge,
      projectId,
      readOnly: false,
      onClose: () => undefined,
      onOpenProfessional: () => undefined,
    });

    expect(html).toContain('用四个问题建立作品方向');
    expect(html).toContain('打开完整规划');
    expect(html).toContain('先回答四个问题即可开始写作');
    expect(html).toContain('正在读取作品核心');
  });

  it('覆盖作品核心编辑器的完整静态表单', () => {
    const brief = contractInput<ProjectBrief>({
      projectId,
      concept: '一场跨越三代人的追索',
      readingPromise: '谜团持续升级',
      protagonistGoal: '找回失落档案',
      coreConflict: '真相与家族利益冲突',
      endingIntent: '完成选择而非简单胜负',
      required: ['伏笔回收'],
      forbidden: ['无代价复活'],
      updatedAt: '2026-08-14T00:00:00.000Z',
    });
    const html = render(ProjectBriefEditor, {
      brief,
      disabled: false,
      loading: false,
      bridge,
      onRefresh: async () => undefined,
      onSkip: () => undefined,
      onStatus: () => undefined,
    });

    expect(html).toContain('作品核心');
    expect(html).toContain('一场跨越三代人的追索');
    expect(html).toContain('伏笔回收');
    expect(html).toContain('无代价复活');
    expect(html).toContain('保存作品核心');
  });

  it('覆盖 Canon 工作台及叙事规划分区的静态入口', () => {
    const html = render(CanonWorkbench, {
      bridge,
      projectId,
      projectName: '长篇测试项目',
      readOnly: false,
      section: 'narrative',
      selectedEntityId: null,
      selectedChapterId: null,
      onSectionChange: () => undefined,
      onNavigate: () => undefined,
    });

    expect(html).toContain('设定与连续性工作台');
    expect(html).toContain('伏笔生命周期与人物弧光');
    expect(html).toContain('智能审阅');
    expect(html).toContain('读取中');
  });

  it('覆盖应用壳层与活动项目上下文，不依赖浏览器事件执行', () => {
    const settings = contractInput<AppSettings>({
      onboardingTipsSeen: [],
    });
    const project = contractInput<ProjectWorkspaceSummary>({
      projectId,
      name: '作者项目',
      workspacePath: '/local/worldforge/project',
      databaseMode: 'read-write',
      readOnlyReason: null,
    });
    const capabilities = contractInput<CapabilityMatrix>({
      project: {
        canonReadable: true,
        restoreAvailable: true,
        exportAvailable: true,
        moveAvailable: true,
      },
    });
    const navigation = [
      contractInput<PrimaryNavigationItem>({
        id: 'home',
        label: '首页',
        description: '作品入口',
        current: true,
        disabled: false,
        disabledReason: null,
      }),
    ];
    const ref = { current: null };
    const html = render(AppShellLayout, {
      children: createElement('p', null, '正文区域'),
      activeProject: project,
      capabilities,
      coreStatus: null,
      tasks: [],
      pendingKey: null,
      message: '已保存',
      navigation,
      disclosureMode: 'professional',
      route: 'home',
      settings,
      failure: null,
      globalStatus: null,
      foregroundTaskId: null,
      navOpen: false,
      helpOpen: false,
      commandPaletteOpen: false,
      navToggle: ref,
      settingsTrigger: ref,
      helpTrigger: ref,
      commandPaletteTrigger: ref,
      mainContent: ref,
      onNavOpenChange: () => undefined,
      onHelpOpenChange: () => undefined,
      onCommandPaletteOpenChange: () => undefined,
      onNavigate: () => undefined,
      onTransitionToRoute: async () => true,
      onOpenCanonSection: () => undefined,
      onOpenDataToolsSection: () => undefined,
      onMoveProject: async () => undefined,
      onCloseProject: async () => undefined,
      onSaveSettings: async () => true,
      onOpenOnboarding: () => undefined,
      onCancelTask: async () => undefined,
    });

    expect(html).toContain('WorldForge');
    expect(html).toContain('作者项目');
    expect(html).toContain('可写 · 本地数据库');
    expect(html).toContain('已保存');
    expect(html).toContain('正文区域');
  });
});
