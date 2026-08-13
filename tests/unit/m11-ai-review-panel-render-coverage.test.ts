import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StateProposalPanel } from '../../apps/desktop/renderer/src/features/canon/state-proposal-panel.js';
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

const projectId = '11111111-1111-4111-8111-111111111111';

function renderPanel(readOnly: boolean): string {
  return renderToStaticMarkup(
    createElement(StateProposalPanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      projectName: '审阅测试作品',
      readOnly,
    }),
  );
}

describe('M11 智能审阅工作台服务端渲染覆盖', () => {
  it('渲染统一审阅入口、筛选和加载态', () => {
    const html = renderPanel(false);

    expect(html).toContain('data-ai-review-dialog');
    expect(html).toContain('智能审阅与章节状态');
    expect(html).toContain('智能分析负责整理和提出建议');
    expect(html).toContain('data-ai-review-status-filter');
    expect(html).toContain('data-ai-review-type-filter');
    expect(html).toContain('待确认');
    expect(html).toContain('已处理');
    expect(html).toContain('人物与世界状态');
    expect(html).toContain('人物成长节点');
    expect(html).toContain('读取中…');
    expect(html).toContain('选择已经定稿的章节后');
  });

  it('只读模式继续阻止主动分析并保留审阅筛选', () => {
    const html = renderPanel(true);

    expect(html).toContain('智能审阅与章节状态');
    expect(html).toContain('data-ai-review-status-filter');
    expect(html).toContain('data-ai-review-type-filter');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>分析定稿<\/button>/u);
    expect(html).toContain('当前没有智能审阅建议');
  });
});
