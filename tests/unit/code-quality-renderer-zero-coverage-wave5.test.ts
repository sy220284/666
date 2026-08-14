import { createRequire } from 'node:module';

import type { Entity, PlotNode, ProjectWorkspaceSummary } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { CanonWorkbench } from '../../apps/desktop/renderer/src/features/canon/canon-workbench.js';
import { PlotNodeDialog } from '../../apps/desktop/renderer/src/features/planning/outline/plot-node-dialog.js';
import { SceneBeatDialog } from '../../apps/desktop/renderer/src/features/planning/scenes/scene-beat-dialog.js';
import { TrashPanel } from '../../apps/desktop/renderer/src/features/structure/trash-panel.js';
import { WritingWorkbench } from '../../apps/desktop/renderer/src/features/writing/writing-core-workbench.js';
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

describe('代码质量治理：Renderer 0% 岛第五批直接渲染', () => {
  it('覆盖剧情节点新建与编辑两条表单路径', () => {
    const node = contractInput<PlotNode>({
      id: '33333333-3333-4333-8333-333333333333',
      projectId,
      parentId: null,
      nodeType: 'chapter',
      title: '旧城追索',
      goal: '找到失踪档案',
      coreConflict: '真相与家族利益冲突',
      expectedResult: '获得第一条证据',
      status: 'writing',
      orderKey: 1,
    });

    const createHtml = render(PlotNodeDialog, {
      bridge,
      editor: { parentId: null },
      projectId,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });
    const editHtml = render(PlotNodeDialog, {
      bridge,
      editor: { node, parentId: null },
      projectId,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });

    expect(createHtml).toContain('新建大纲节点');
    expect(createHtml).toContain('保存');
    expect(editHtml).toContain('编辑大纲节点');
    expect(editHtml).toContain('旧城追索');
    expect(editHtml).toContain('找到失踪档案');
  });

  it('覆盖场景编辑器的新建与正文转换路径以及人物地点筛选', () => {
    const character = contractInput<Entity>({
      id: '44444444-4444-4444-8444-444444444444',
      projectId,
      entityType: 'character',
      name: '赵云川',
    });
    const location = contractInput<Entity>({
      id: '55555555-5555-4555-8555-555555555555',
      projectId,
      entityType: 'location',
      name: '旧档案馆',
    });
    const plotNode = contractInput<PlotNode>({
      id: '66666666-6666-4666-8666-666666666666',
      projectId,
      parentId: null,
      nodeType: 'chapter',
      title: '雨夜查档',
      status: 'writing',
      orderKey: 1,
    });

    const createHtml = render(SceneBeatDialog, {
      beat: null,
      bridge,
      chapterId,
      entities: [character, location],
      plotNodes: [plotNode],
      projectId,
      convertingLogicalBlockIds: [],
      onClose: () => undefined,
      onSaved: async () => undefined,
    });
    const convertHtml = render(SceneBeatDialog, {
      beat: null,
      bridge,
      chapterId,
      entities: [character, location],
      plotNodes: [plotNode],
      projectId,
      convertingLogicalBlockIds: ['block-a', 'block-b'],
      onClose: () => undefined,
      onSaved: async () => undefined,
    });

    expect(createHtml).toContain('新建场景');
    expect(createHtml).toContain('赵云川');
    expect(createHtml).toContain('旧档案馆');
    expect(createHtml).toContain('雨夜查档');
    expect(convertHtml).toContain('从 2 个正文段落转换');
  });

  it('覆盖回收站初始安全态，不执行永久删除副作用', () => {
    const html = render(TrashPanel, {
      bridge,
      projectId,
      readOnly: false,
      onClose: () => undefined,
      onStructureRefresh: async () => undefined,
    });

    expect(html).toContain('回收站');
    expect(html).toContain('恢复保留原始排序；永久删除先由本地服务计算影响。');
    expect(html).toContain('关闭');
  });

  it('覆盖完整 Canon wrapper 与叙事关系编辑组合层', () => {
    const html = render(CanonWorkbench, {
      bridge,
      projectId,
      projectName: '长篇项目',
      readOnly: false,
      section: 'narrative',
      selectedEntityId: null,
      selectedChapterId: null,
      onSectionChange: () => undefined,
      onNavigate: () => undefined,
      onReturn: () => undefined,
    });

    expect(html).toContain('设定与连续性工作台');
    expect(html).toContain('伏笔生命周期与人物弧光');
    expect(html).toContain('完整伏笔与弧光关系编辑');
  });

  it('覆盖完整 Writing Core/View 的无章节初始态与状态栏', () => {
    const project = contractInput<ProjectWorkspaceSummary>({
      projectId,
      name: '作者长篇',
      workspacePath: '/local/worldforge/project',
      databaseMode: 'read-write',
      readOnlyReason: null,
    });
    const html = render(WritingWorkbench, {
      bridge,
      disclosureMode: 'professional',
      project,
      initialContinuation: null,
      panel: 'editor',
      navigationChapterId: null,
      navigationLogicalBlockId: null,
      navigationVersionId: null,
      navigationQuery: null,
      navigationGenerationMode: null,
      onNavigate: () => undefined,
      onPanelChange: () => undefined,
      onStatus: () => undefined,
      statusNotice: null,
      onStatusNoticeConsumed: () => undefined,
    });

    expect(html).toContain('作者长篇');
    expect(html).toContain('选择章节开始写作');
    expect(html).toContain('查找与替换');
    expect(html).toContain('字数');
    expect(html).toContain('段落');
  });
});
