import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { EMPTY_CANON_AUTHOR_REFERENCES } from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import { ContinuityPanel } from '../../apps/desktop/renderer/src/features/canon/continuity-panel.js';
import { ContinuityRelationshipEditor } from '../../apps/desktop/renderer/src/features/canon/continuity-relationship-editor.js';
import { NarrativeRelationshipEditor } from '../../apps/desktop/renderer/src/features/canon/narrative-relationship-editor.js';
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

describe('代码质量治理：Renderer 0% 岛第四批直接渲染', () => {
  it('覆盖完整连续性关系编辑器的安全初始状态', () => {
    const html = render(ContinuityRelationshipEditor, {
      bridge,
      projectId,
      readOnly: false,
    });

    expect(html).toContain('完整连续性关系编辑');
    expect(html).toContain('动态状态与证据锚点');
    expect(html).toContain('时间线人物角色与依赖');
    expect(html).toContain('保存完整动态状态');
    expect(html).toContain('保存完整时间线事件');
  });

  it('覆盖完整伏笔与弧光关系编辑器的安全初始状态', () => {
    const html = render(NarrativeRelationshipEditor, {
      bridge,
      projectId,
      readOnly: false,
    });

    expect(html).toContain('完整伏笔与弧光关系编辑');
    expect(html).toContain('伏笔章节锚点与关系');
    expect(html).toContain('弧光节点依赖');
    expect(html).toContain('完整叙事关系编辑会保存章节锚点');
  });

  it('覆盖连续性面板及编辑器组合层的加载态', () => {
    const html = render(ContinuityPanel, {
      bridge,
      projectId,
      projectName: '长篇项目',
      readOnly: false,
      references: EMPTY_CANON_AUTHOR_REFERENCES,
    });

    expect(html).toContain('动态状态、时间线与知情信息');
    expect(html).toContain('包含历史');
    expect(html).toContain('包含归档事件');
    expect(html).toContain('读取中');
  });
});
