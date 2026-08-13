import { createRequire } from 'node:module';

import type {
  AppSettings,
  AppearancePreferences,
  Chapter,
  ContinuityCatalog,
  DraftDocument,
  NarrativePlanningCatalog,
  ProjectWorkspaceSummary,
} from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import {
  LedgerRecord,
  LedgerSection,
  lineValues,
  nullableString,
} from '../../apps/desktop/renderer/src/features/canon/canon-panel-shared.js';
import { EMPTY_CANON_AUTHOR_REFERENCES } from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import { ContinuityResults } from '../../apps/desktop/renderer/src/features/canon/continuity-results.js';
import { NarrativePlanningResults } from '../../apps/desktop/renderer/src/features/canon/narrative-planning-results.js';
import { RhythmPanel } from '../../apps/desktop/renderer/src/features/checks/rhythm-panel.js';
import { DataToolsWorkbench } from '../../apps/desktop/renderer/src/features/data-tools/data-tools-workbench.js';
import { PlanningContextPanel } from '../../apps/desktop/renderer/src/features/planning/planning-context-panel.js';
import { SettingsPage } from '../../apps/desktop/renderer/src/features/settings/settings-page.js';
import { VersionPanel } from '../../apps/desktop/renderer/src/features/writing/version-panel.js';
import { WritingAssistancePanel } from '../../apps/desktop/renderer/src/features/writing/writing-assistance-panel.js';
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
const chapterId = '22222222-2222-4222-8222-222222222222';

function render(component: Parameters<typeof createElement>[0], props: object): string {
  return renderToStaticMarkup(createElement(component, props));
}

describe('代码质量治理：Renderer 低覆盖界面直接渲染', () => {
  it('覆盖数据工具两个权威分区的初始状态', () => {
    const common = {
      bridge,
      projectId,
      readOnly: false,
      onSectionChange: () => undefined,
      onClose: () => undefined,
      onProjectRestored: async () => undefined,
    };

    const recovery = render(DataToolsWorkbench, { ...common, section: 'recovery' });
    const textIo = render(DataToolsWorkbench, { ...common, section: 'import-export' });

    expect(recovery).toContain('恢复与数据工具');
    expect(recovery).toContain('创建今日日常备份');
    expect(recovery).toContain('可安全导出的历史版本');
    expect(textIo).toContain('TXT / Markdown / DOCX导入');
    expect(textIo).toContain('历史版本与整书导出');
  });

  it('覆盖设置首页的完整静态状态', () => {
    const settings = contractInput<AppSettings>({
      schemaVersion: 1,
      language: 'zh-CN',
      startupBehavior: 'show-home',
      defaultMode: 'beginner',
      creativePath: 'autonomous',
      onboardingCompleted: true,
      onboardingTipsSeen: [],
      onboardingScaffoldDismissed: true,
      themeId: 'theme-a',
      themeVariant: 'light',
      reduceMotion: false,
    });
    const appearance = contractInput<AppearancePreferences>({
      uiScalePercent: 100,
      textScalePercent: 100,
      workspaceAlignment: 'center',
      editorLineHeight: 1.8,
      editorMeasure: 760,
    });

    const html = render(SettingsPage, {
      bridge,
      disclosureMode: 'professional',
      settings,
      appearance,
      coreStatus: null,
      pendingKey: null,
      message: '设置已同步。',
      onClose: () => undefined,
      onSaveSettings: async () => true,
      onResetSettings: () => undefined,
      onSaveAppearance: async () => true,
      onRestartCore: () => undefined,
      onOpenOnboarding: () => undefined,
      aiReady: false,
      onProvidersChanged: () => undefined,
      onProviderConnectionVerified: () => undefined,
      onProviderInvalidated: () => undefined,
    });

    expect(html).toContain('本地应用设置');
    expect(html).toContain('设置已同步。');
    expect(html).toContain('智能连接尚未验证');
    expect(html).toContain('通用');
  });

  it('覆盖历史版本、节奏与本章辅助的初始安全状态', () => {
    const project = contractInput<ProjectWorkspaceSummary>({
      projectId,
      databaseMode: 'read-write',
    });
    const chapter = contractInput<Chapter>({ id: chapterId });
    const draft = contractInput<DraftDocument>({
      draftId: '33333333-3333-4333-8333-333333333333',
      revision: 7,
      blocks: [],
    });

    const versionHtml = render(VersionPanel, {
      bridge,
      chapter,
      draft,
      project,
      navigationVersionId: null,
      flush: async () => true,
      onClose: () => undefined,
      onDraftReplace: () => undefined,
    });
    const rhythmHtml = render(RhythmPanel, { bridge, projectId, readOnly: false });
    const assistanceHtml = render(WritingAssistancePanel, {
      bridge,
      projectId,
      chapterId,
      savedRevision: 7,
      readOnly: false,
      onNavigate: () => undefined,
      onOpenAssistant: () => undefined,
    });

    expect(versionHtml).toContain('历史版本与比较');
    expect(versionHtml).toContain('还没有历史版本');
    expect(rhythmHtml).toContain('网文节奏与连载指标');
    expect(rhythmHtml).toContain('所有节奏结果均为 P3 建议');
    expect(assistanceHtml).toContain('本章写作辅助');
    expect(assistanceHtml).toContain('正在汇总本章规划与前后文');
  });

  it('覆盖设定结果、规划上下文与共享字段转换的有数据分支', () => {
    const continuity = contractInput<ContinuityCatalog>({
      entityStates: [
        {
          id: 'state-1',
          entityId: 'entity-1',
          stateKey: 'location',
          recordStatus: 'active',
          value: '汴京',
          validFromChapterId: chapterId,
          validUntilChapterId: null,
        },
      ],
      timelineEvents: [
        {
          id: 'timeline-1',
          title: '入京',
          status: 'active',
          startValue: '第一日',
          endValue: null,
          precision: 'day',
          chapterId,
          locationId: 'entity-2',
          description: '人物进入汴京。',
        },
      ],
      knowledgeStates: [
        {
          id: 'knowledge-1',
          characterId: 'entity-1',
          informationKey: '密信',
          knowledgeStatus: 'knows',
          recordStatus: 'active',
          notes: '已经读过。',
        },
      ],
      relationships: [
        {
          id: 'relationship-1',
          fromCharacterId: 'entity-1',
          toCharacterId: 'entity-2',
          category: 'ally',
          label: '同盟',
          recordStatus: 'active',
          validFromChapterId: chapterId,
          validUntilChapterId: null,
        },
      ],
    });
    const narrative = contractInput<NarrativePlanningCatalog>({
      foreshadowings: [
        {
          id: 'foreshadow-1',
          title: '密信伏笔',
          status: 'open',
          revealFromChapterId: chapterId,
          revealByChapterId: null,
          description: '信中藏着下一卷线索。',
          warnings: ['注意回收窗口'],
        },
      ],
      characterArcs: [
        {
          id: 'arc-1',
          title: '信任弧光',
          status: 'active',
          arcType: 'growth',
          characterId: 'entity-1',
          authorIntent: '从怀疑走向信任。',
          milestones: [
            {
              id: 'milestone-1',
              title: '第一次合作',
              status: 'hit',
              actualChapterId: chapterId,
            },
            {
              id: 'milestone-2',
              title: '第二次选择',
              status: 'pending',
              actualChapterId: null,
            },
          ],
        },
      ],
    });

    const continuityHtml = render(ContinuityResults, {
      catalog: continuity,
      references: EMPTY_CANON_AUTHOR_REFERENCES,
    });
    const narrativeHtml = render(NarrativePlanningResults, {
      catalog: narrative,
      references: EMPTY_CANON_AUTHOR_REFERENCES,
    });
    const planningHtml = render(PlanningContextPanel, {
      entities: [contractInput({ id: 'entity-1', name: '赵二', entityType: 'character' })],
      narrative,
    });
    const sharedHtml = render(LedgerSection, {
      title: '共享记录',
      children: createElement(LedgerRecord, {
        title: '条目',
        lines: ['第一行', '', '第二行'],
      }),
    });

    expect(continuityHtml).toContain('动态状态（1）');
    expect(continuityHtml).toContain('时间线事件（1）');
    expect(narrativeHtml).toContain('密信伏笔');
    expect(narrativeHtml).toContain('已命中');
    expect(narrativeHtml).toContain('待命中');
    expect(planningHtml).toContain('赵二');
    expect(sharedHtml).toContain('第一行');
    expect(sharedHtml).not.toContain('<p></p>');
    expect(lineValues(' 第一行\n\n 第二行 ')).toEqual(['第一行', '第二行']);
    expect(nullableString('  ')).toBeNull();
    expect(nullableString('  有值  ')).toBe('有值');
  });
});
