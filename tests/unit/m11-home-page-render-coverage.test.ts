import { createRequire } from 'node:module';

import type {
  AppSettings,
  ProjectContinuationSnapshot,
  ProjectWorkspaceSummary,
  RecentProject,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import {
  HomePage,
  type HomePageProps,
} from '../../apps/desktop/renderer/src/features/home/home-page.js';
import type { ProjectCapabilities } from '../../apps/desktop/renderer/src/runtime/capability-matrix.js';

const rendererRequire = createRequire(
  new URL('../../apps/desktop/renderer/package.json', import.meta.url),
);
const { createElement } = rendererRequire('react') as {
  readonly createElement: typeof createReactElement;
};
const { renderToStaticMarkup } = rendererRequire('react-dom/server') as {
  readonly renderToStaticMarkup: typeof renderReactToStaticMarkup;
};

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const blockId = '44444444-4444-4444-8444-444444444444';

const settings: AppSettings = {
  schemaVersion: 1,
  language: 'zh-CN',
  startupBehavior: 'show-home',
  defaultMode: 'beginner',
  creativePath: 'autonomous',
  onboardingCompleted: false,
  onboardingTipsSeen: [],
  onboardingScaffoldDismissed: false,
  themeId: 'theme-a',
  themeVariant: 'light',
  reduceMotion: false,
};

const closedCapabilities: ProjectCapabilities = {
  mode: 'closed',
  projectReadable: false,
  projectWritable: false,
  databaseReadable: false,
  structureReadable: false,
  draftReadable: false,
  draftWritable: false,
  canonReadable: false,
  canonWritable: false,
  exportAvailable: false,
  backupAvailable: false,
  restoreAvailable: false,
  moveAvailable: false,
};

const normalCapabilities: ProjectCapabilities = {
  mode: 'normal',
  projectReadable: true,
  projectWritable: true,
  databaseReadable: true,
  structureReadable: true,
  draftReadable: true,
  draftWritable: true,
  canonReadable: true,
  canonWritable: true,
  exportAvailable: true,
  backupAvailable: true,
  restoreAvailable: true,
  moveAvailable: true,
};

const baseProps: HomePageProps = {
  disclosureMode: 'beginner',
  activeProject: null,
  continuation: null,
  recentProjects: [],
  healthSignals: [],
  activeTaskCount: 0,
  pendingKey: null,
  message: null,
  settings,
  providerAvailable: false,
  projectCapabilities: closedCapabilities,
  onboardingRequest: 0,
  onNavigate: () => undefined,
  onCreate: async () => true,
  onSaveSettings: async () => true,
  onContinue: () => undefined,
  onOpenSelected: () => undefined,
  onOpenRecent: () => undefined,
  onRelocateRecent: () => undefined,
  onRemoveRecent: () => undefined,
  onCloseProject: () => undefined,
  onMoveProject: () => undefined,
  onOpenRecovery: () => undefined,
};

function project(
  databaseMode: ProjectWorkspaceSummary['databaseMode'] = 'read-write',
  readOnlyReason: ProjectWorkspaceSummary['readOnlyReason'] = null,
): ProjectWorkspaceSummary {
  return {
    projectId,
    name: '长夜行舟',
    channel: '男频',
    workspacePath: '/works/long-night',
    schemaVersion: 1,
    databaseMode,
    compatibility: databaseMode === 'read-write' ? 'current' : 'future-schema',
    readOnlyReason,
    createdAt: '2026-08-13T00:00:00.000Z',
  };
}

function continuation(
  status: ProjectContinuationSnapshot['status'],
): ProjectContinuationSnapshot {
  const common = {
    projectId,
    chapterId,
    chapterTitle: '第二章',
    draftId,
    draftRevision: 3,
    logicalBlockId: blockId,
    expectedBlockHash: 'a'.repeat(64),
    cursorOffset: 12,
    scrollTop: 24,
    panel: 'editor' as const,
    updatedAt: '2026-08-13T01:00:00.000Z',
  };
  return status === 'ready'
    ? { status: 'ready', ...common }
    : { status: 'stale', ...common, reason: 'draft-changed' };
}

function recent(
  id: string,
  displayName: string,
  lastOpenedAt: string,
  missingSince: string | null,
): RecentProject {
  return {
    projectId: id,
    workspacePath: `/works/${id}`,
    displayName,
    lastOpenedAt,
    missingSince,
  };
}

function renderHome(overrides: Partial<HomePageProps> = {}): string {
  return renderToStaticMarkup(
    createElement(HomePage, { ...baseProps, ...overrides }),
  );
}

describe('M11 首页真实状态渲染覆盖', () => {
  it('空首页展示四种开始方式与空最近作品状态', () => {
    const html = renderHome();

    expect(html).toContain('继续你的本地写作');
    expect(html).toContain('选择开始方式');
    expect(html).toContain('快速开始');
    expect(html).toContain('完整流程');
    expect(html).toContain('导入已有作品');
    expect(html).toContain('空白作品');
    expect(html).toContain('还没有最近作品');
    expect(html).not.toContain('下一步建议');
  });

  it('完整模式展示状态提示、任务摘要与三种最近作品动作', () => {
    const html = renderHome({
      disclosureMode: 'professional',
      activeTaskCount: 3,
      message: '本地状态已刷新。',
      healthSignals: [
        {
          id: 'normal',
          severity: 'normal',
          title: '普通提示',
          message: '可以继续写作。',
          intent: 'checks',
        },
        {
          id: 'risk',
          severity: 'data-risk',
          title: '恢复提示',
          message: '先检查恢复点。',
          intent: 'recovery',
        },
      ],
      recentProjects: [
        recent(
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          '最近作品',
          '2026-08-13T03:00:00.000Z',
          null,
        ),
        recent(
          'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          '路径丢失作品',
          '2026-08-13T02:00:00.000Z',
          '2026-08-13T02:30:00.000Z',
        ),
        recent(
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          '较早作品',
          '2026-08-13T01:00:00.000Z',
          null,
        ),
      ],
    });

    expect(html).toContain('本地状态已刷新。');
    expect(html).toContain('恢复提示');
    expect(html).toContain('普通提示');
    expect(html).toContain('活动任务：3');
    expect(html).toContain('继续写作');
    expect(html).toContain('重新定位');
    expect(html).toContain('打开');
    expect(html).toContain('路径已丢失');
  });

  it('正常作品展示续写位置、引导脚手架和完整可用能力', () => {
    const html = renderHome({
      activeProject: project(),
      continuation: continuation('ready'),
      settings: {
        ...settings,
        creativePath: 'hybrid',
        onboardingCompleted: true,
      },
      projectCapabilities: normalCapabilities,
      providerAvailable: false,
    });

    expect(html).toContain('长夜行舟');
    expect(html).toContain('上次写到：第二章');
    expect(html).toContain('下一步建议');
    expect(html).toContain('可以写作 · 本地保存');
    expect(html).toContain('智能优先（需先配置智能连接）');
    expect(html).not.toContain('只读保护');
    expect(html).not.toContain('选择开始方式');
  });

  it('只读降级作品展示陈旧续写与能力禁用状态', () => {
    const html = renderHome({
      activeProject: project('read-only', 'future-schema'),
      continuation: continuation('stale'),
      pendingKey: 'project.move',
      settings: {
        ...settings,
        creativePath: 'ai-first',
        onboardingCompleted: true,
        onboardingScaffoldDismissed: true,
      },
      providerAvailable: true,
      projectCapabilities: {
        ...closedCapabilities,
        mode: 'read-only-compatible',
        projectReadable: true,
        databaseReadable: true,
        exportAvailable: true,
        restoreAvailable: true,
      },
    });

    expect(html).toContain('只读保护');
    expect(html).toContain('future-schema');
    expect(html).toContain('上次位置已变化');
    expect(html).toContain('智能优先');
    expect(html).not.toContain('需先配置智能连接');
    expect(html).not.toContain('下一步建议');
    expect(html).toContain('disabled=""');
  });

  it('只读原因缺失时使用兼容性保护兜底文案', () => {
    const html = renderHome({
      activeProject: project('read-only'),
      projectCapabilities: {
        ...normalCapabilities,
        mode: 'read-only-compatible',
        projectWritable: false,
        draftWritable: false,
        canonWritable: false,
        backupAvailable: false,
        moveAvailable: false,
      },
      providerAvailable: true,
    });

    expect(html).toContain('兼容性保护');
    expect(html).toContain('作品以只读方式打开');
  });
});
