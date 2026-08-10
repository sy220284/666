import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import type { ContinuityCatalog } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import type { CanonAuthorReferences } from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';
import { ContinuityEditors } from '../../apps/desktop/renderer/src/features/canon/continuity-editors.js';
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
const versionId = '33333333-3333-4333-8333-333333333333';
const characterId = '44444444-4444-4444-8444-444444444444';
const locationId = '55555555-5555-4555-8555-555555555555';

const references = contractInput<CanonAuthorReferences>({
  state: 'ready',
  entities: [
    { id: characterId, entityType: 'character', name: '赵二' },
    { id: locationId, entityType: 'location', name: '清河' },
  ],
  chapters: [{ id: chapterId, title: '第三章 夜渡清河' }],
  versions: [{ id: versionId, chapterId, label: '第三章 · 定稿 1' }],
});

const catalog = contractInput<ContinuityCatalog>({
  projectId,
  entityStates: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      entityId: characterId,
      stateKey: 'location',
      recordStatus: 'current',
    },
    {
      id: '77777777-7777-4777-8777-777777777777',
      entityId: characterId,
      stateKey: 'health',
      recordStatus: 'superseded',
    },
  ],
  timelineEvents: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      title: '夜渡清河',
      status: 'active',
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      title: '旧事件',
      status: 'archived',
    },
  ],
  knowledgeStates: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      characterId,
      informationKey: '追兵暗号',
      recordStatus: 'current',
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      characterId,
      informationKey: '旧情报',
      recordStatus: 'superseded',
    },
  ],
});

describe('M11 作者表单服务端渲染覆盖', () => {
  it('渲染动态状态、时间线和知情状态的作者可读入口', () => {
    const html = renderToStaticMarkup(
      createElement(ContinuityEditors, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        catalog,
        projectId,
        readOnly: false,
        references,
        onRefresh: async () => {},
      }),
    );

    expect(html).toContain('记录动态状态');
    expect(html).toContain('所在地点');
    expect(html).toContain('赵二');
    expect(html).toContain('清河');
    expect(html).toContain('第三章 夜渡清河');
    expect(html).toContain('第三章 · 定稿 1');
    expect(html).toContain('夜渡清河');
    expect(html).toContain('追兵暗号');
    expect(html).toContain('选择来源正文段落');
    expect(html).not.toContain('旧事件');
    expect(html).not.toContain('旧情报');
  });

  it('覆盖只读状态和空引用提示', () => {
    const html = renderToStaticMarkup(
      createElement(ContinuityEditors, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        catalog: contractInput<ContinuityCatalog>({
          projectId,
          entityStates: [],
          timelineEvents: [],
          knowledgeStates: [],
        }),
        projectId,
        readOnly: true,
        references: contractInput<CanonAuthorReferences>({
          state: 'degraded',
          entities: [],
          chapters: [],
          versions: [],
        }),
        onRefresh: async () => {},
      }),
    );

    expect(html).toContain('当前没有可选对象');
    expect(html).toContain('当前没有可选章节');
    expect(html).toContain('当前没有可选定稿');
    expect(html).toContain('disabled');
  });
});
