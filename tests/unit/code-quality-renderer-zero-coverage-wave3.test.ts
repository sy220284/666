import { createRequire } from 'node:module';

import type { Chapter, PlotNode, ProjectStructure, Volume } from '@worldforge/contracts';
import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { PlotTree } from '../../apps/desktop/renderer/src/features/planning/outline/plot-tree.js';
import { ChapterEditorDialog } from '../../apps/desktop/renderer/src/features/structure/chapter-editor-dialog.js';
import { VolumeEditorDialog } from '../../apps/desktop/renderer/src/features/structure/volume-editor-dialog.js';
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

describe('代码质量治理：Renderer 0% 岛第三批直接渲染', () => {
  it('覆盖 PlotTree 的根节点、子节点和只读交互保护', () => {
    const root = contractInput<PlotNode>({
      id: '22222222-2222-4222-8222-222222222222',
      projectId,
      parentId: null,
      title: '第一卷主线',
      nodeType: 'volume',
      status: 'active',
      orderKey: 1,
    });
    const child = contractInput<PlotNode>({
      id: '33333333-3333-4333-8333-333333333333',
      projectId,
      parentId: root.id,
      title: '暗线揭露',
      nodeType: 'arc',
      status: 'planned',
      orderKey: 1,
    });

    const html = render(PlotTree, {
      bridge,
      nodes: [root, child],
      projectId,
      readOnly: true,
      onEdit: () => undefined,
      onCreateChild: () => undefined,
      onRefresh: async () => undefined,
      onStatus: () => undefined,
    });

    expect(html).toContain('第一卷主线');
    expect(html).toContain('暗线揭露');
    expect(html).toContain('作为子节点');
    expect(html).toContain('移到根级');
    expect(html).toContain('disabled');
  });

  it('覆盖新建与编辑卷对话框的两条静态分支', () => {
    const volume = contractInput<Volume>({
      id: '44444444-4444-4444-8444-444444444444',
      projectId,
      title: '第一卷',
      status: 'writing',
      chapters: [],
    });
    const createHtml = render(VolumeEditorDialog, {
      bridge,
      projectId,
      volume: null,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });
    const editHtml = render(VolumeEditorDialog, {
      bridge,
      projectId,
      volume,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });

    expect(createHtml).toContain('新建卷');
    expect(editHtml).toContain('编辑卷');
    expect(editHtml).toContain('第一卷');
    expect(editHtml).toContain('写作中');
  });

  it('覆盖新建与编辑章节对话框及所属卷选择', () => {
    const volume = contractInput<Volume>({
      id: '44444444-4444-4444-8444-444444444444',
      projectId,
      title: '第一卷',
      status: 'writing',
      chapters: [],
    });
    const secondVolume = contractInput<Volume>({
      id: '55555555-5555-4555-8555-555555555555',
      projectId,
      title: '第二卷',
      status: 'pending',
      chapters: [],
    });
    const chapter = contractInput<Chapter>({
      id: '66666666-6666-4666-8666-666666666666',
      volumeId: volume.id,
      title: '风雨夜',
      status: 'reviewing',
      targetWordMin: 2500,
      targetWordMax: 3500,
    });
    const structure = contractInput<ProjectStructure>({
      projectId,
      volumes: [volume, secondVolume],
    });

    const createHtml = render(ChapterEditorDialog, {
      bridge,
      chapter: null,
      projectId,
      structure,
      volume,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });
    const editHtml = render(ChapterEditorDialog, {
      bridge,
      chapter,
      projectId,
      structure,
      volume,
      onClose: () => undefined,
      onSaved: async () => undefined,
    });

    expect(createHtml).toContain('新建章节');
    expect(editHtml).toContain('编辑章节');
    expect(editHtml).toContain('风雨夜');
    expect(editHtml).toContain('第二卷');
    expect(editHtml).toContain('2500');
    expect(editHtml).toContain('3500');
  });
});
