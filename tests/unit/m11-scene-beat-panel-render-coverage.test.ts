import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { SceneBeatPanel } from '../../apps/desktop/renderer/src/features/planning/scenes/scene-beat-panel.js';
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
const chapterId = '22222222-2222-4222-8222-222222222222';

function renderPanel(readOnly: boolean): string {
  return renderToStaticMarkup(
    createElement(SceneBeatPanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      chapterId,
      entities: [],
      plotNodes: [],
      projectId,
      readOnly,
      onStatus: () => {},
    }),
  );
}

describe('M11 场景正文选择入口渲染覆盖', () => {
  it('在可编辑状态展示正文段落转换入口和场景操作', () => {
    const html = renderPanel(false);

    expect(html).toContain('章节与场景');
    expect(html).toContain('场景规划与正文段落保持显式分离。');
    expect(html).toContain('从正文段落转换');
    expect(html).toContain('新建场景');
    expect(html).toContain('已删除场景');
  });

  it('在只读状态保留入口语义并禁用写操作', () => {
    const html = renderPanel(true);

    expect(html).toContain('从正文段落转换');
    expect(html).toContain('新建场景');
    expect(html).toContain('disabled');
  });
});
