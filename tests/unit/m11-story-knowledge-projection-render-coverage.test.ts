import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryKnowledgeProjection } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StoryKnowledgePanel } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  state: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
  data: null as StoryKnowledgeProjection | null,
  error: null as null | {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  },
}));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: () => ({
    state: controls.state,
    data: controls.data,
    error: controls.error,
    refresh: async () => undefined,
  }),
}));

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
const characterId = '33333333-3333-4333-8333-333333333333';
const secondCharacterId = '44444444-4444-4444-8444-444444444444';
const thirdCharacterId = '55555555-5555-4555-8555-555555555555';
const versionId = '66666666-6666-4666-8666-666666666666';
const secondVersionId = '77777777-7777-4777-8777-777777777777';

function renderPanel(
  projection: StoryKnowledgeProjection | null,
  selectedEntityId: string | null = characterId,
): string {
  controls.state = 'success';
  controls.data = projection;
  controls.error = null;
  return renderToStaticMarkup(
    createElement(StoryKnowledgePanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      readOnly: false,
      selectedEntityId,
      selectedChapterId: chapterId,
      onNavigate: () => undefined,
    }),
  );
}

function characterCard(empty: boolean): StoryKnowledgeProjection {
  return contractInput({
    view: 'character_card',
    projectId,
    bounded: true,
    character: {
      id: characterId,
      name: '沈砚',
      summary: empty ? '' : '负责追查旧案。',
    },
    facts: empty
      ? []
      : [
          {
            id: '81000000-0000-4000-8000-000000000001',
            key: '身份',
            value: '巡检',
            description: '公开身份',
          },
          {
            id: '81000000-0000-4000-8000-000000000002',
            key: '年龄',
            value: 28,
            description: '',
          },
          {
            id: '81000000-0000-4000-8000-000000000003',
            key: '谨慎',
            value: true,
            description: '',
          },
          {
            id: '81000000-0000-4000-8000-000000000004',
            key: '线索',
            value: { place: '南门' },
            description: '',
          },
        ],
    states: empty
      ? []
      : [
          {
            id: '82000000-0000-4000-8000-000000000001',
            key: '伤势',
            value: '轻伤',
            semanticKind: 'physical',
          },
        ],
    relationships: empty
      ? []
      : [
          {
            id: '83000000-0000-4000-8000-000000000001',
            fromCharacterId: characterId,
            fromCharacterName: '沈砚',
            toCharacterId: secondCharacterId,
            toCharacterName: '顾青',
            category: 'ally',
            label: '',
          },
        ],
  });
}

function relationshipProjection(empty: boolean): StoryKnowledgeProjection {
  return contractInput({
    view: 'relationships',
    projectId,
    bounded: true,
    center: { id: characterId, name: '沈砚', summary: '' },
    relationships: empty
      ? []
      : [
          {
            id: '84000000-0000-4000-8000-000000000001',
            fromCharacterId: characterId,
            fromCharacterName: '沈砚',
            toCharacterId: secondCharacterId,
            toCharacterName: '顾青',
            category: 'ally',
            label: '同盟',
          },
          {
            id: '84000000-0000-4000-8000-000000000002',
            fromCharacterId: thirdCharacterId,
            fromCharacterName: '陆遥',
            toCharacterId: characterId,
            toCharacterName: '沈砚',
            category: 'rival',
            label: '',
          },
        ],
    truncated: !empty,
  });
}

function timelineProjection(empty: boolean): StoryKnowledgeProjection {
  return contractInput({
    view: 'timeline',
    projectId,
    bounded: true,
    anchorChapterId: chapterId,
    items: empty
      ? []
      : [
          {
            id: '85000000-0000-4000-8000-000000000001',
            chapterId,
            chapterTitle: '第一章',
            title: '雨夜目击',
            startValue: '2026-07-20',
            endValue: '2026-07-21',
          },
          {
            id: '85000000-0000-4000-8000-000000000002',
            chapterId,
            chapterTitle: '第二章',
            title: '密信送达',
            startValue: '2026-07-22',
            endValue: null,
          },
        ],
    truncatedBefore: !empty,
    truncatedAfter: false,
  });
}

function foreshadowingProjection(empty: boolean): StoryKnowledgeProjection {
  const attentions = ['none', 'due', 'overdue', 'blocked'] as const;
  return contractInput({
    view: 'foreshadowing',
    projectId,
    bounded: true,
    anchorChapterId: chapterId,
    items: empty
      ? []
      : attentions.map((attention, index) => ({
          id: `86000000-0000-4000-8000-00000000000${index + 1}`,
          title: `伏笔${index + 1}`,
          description: index === 0 ? '' : `说明${index + 1}`,
          status: 'planted',
          attention,
        })),
    truncated: !empty,
  });
}

function arcProjection(empty: boolean): StoryKnowledgeProjection {
  return contractInput({
    view: 'arc',
    projectId,
    bounded: true,
    character: {
      id: characterId,
      name: '沈砚',
      summary: empty ? '' : '从旁观到承担。',
    },
    milestones: empty
      ? []
      : [
          {
            id: '87000000-0000-4000-8000-000000000001',
            arcId: '87100000-0000-4000-8000-000000000001',
            arcTitle: '成长线',
            title: '主动追查',
            description: '第一次主动承担风险。',
            status: 'hit',
            actualChapterId: chapterId,
            plannedChapterId: null,
          },
          {
            id: '87000000-0000-4000-8000-000000000002',
            arcId: '87100000-0000-4000-8000-000000000001',
            arcTitle: '成长线',
            title: '计划转折',
            description: '',
            status: 'planned',
            actualChapterId: null,
            plannedChapterId: chapterId,
          },
          {
            id: '87000000-0000-4000-8000-000000000003',
            arcId: '87100000-0000-4000-8000-000000000001',
            arcTitle: '成长线',
            title: '开放节点',
            description: '',
            status: 'planned',
            actualChapterId: null,
            plannedChapterId: null,
          },
        ],
    truncated: !empty,
  });
}

function historyProjection(empty: boolean): StoryKnowledgeProjection {
  return contractInput({
    view: 'history',
    projectId,
    bounded: true,
    chapterId,
    items: empty
      ? []
      : [
          {
            versionId,
            chapterId,
            title: '第一版',
            createdAt: '2026-08-11T10:00:00.000Z',
            finalized: true,
            versionType: 'manual',
          },
          {
            versionId: secondVersionId,
            chapterId,
            title: '第二版',
            createdAt: '2026-08-11T11:00:00.000Z',
            finalized: false,
            versionType: 'rewrite',
          },
        ],
    nextBeforeCreatedAt: empty ? null : '2026-08-10T10:00:00.000Z',
    nextBeforeVersionId: empty ? null : versionId,
    candidates: [],
    candidatesTruncated: false,
    recovery: {
      checkpoints: [],
      checkpointsTruncated: false,
      backupFailures: [],
      backupFailuresTruncated: false,
    },
  });
}

describe('M11-04 Story Knowledge Projection renderer branch coverage', () => {
  beforeEach(() => {
    controls.state = 'success';
    controls.data = null;
    controls.error = null;
  });

  it('渲染人物、关系、时间线、伏笔、成长与历史的非空分支', () => {
    const cases: ReadonlyArray<readonly [StoryKnowledgeProjection, string]> = [
      [characterCard(false), '负责追查旧案'],
      [relationshipProjection(false), '关系较多，仅显示当前窗口'],
      [timelineProjection(false), '雨夜目击'],
      [foreshadowingProjection(false), '已超过回收窗口'],
      [arcProjection(false), '开放节点'],
      [historyProjection(false), '查看更早版本'],
    ];

    for (const [projection, expected] of cases) {
      expect(renderPanel(projection)).toContain(expected);
    }
  });

  it('渲染人物、关系、时间线、伏笔、成长与历史的空态分支', () => {
    const cases: ReadonlyArray<readonly [StoryKnowledgeProjection, string]> = [
      [characterCard(true), '尚未填写人物简介'],
      [relationshipProjection(true), '当前章节没有可显示的人物关系'],
      [timelineProjection(true), '当前时间窗口没有事件'],
      [foreshadowingProjection(true), '当前章节没有需要关注的伏笔'],
      [arcProjection(true), '该人物暂无成长节点'],
      [historyProjection(true), '当前页没有版本记录'],
    ];

    for (const [projection, expected] of cases) {
      expect(renderPanel(projection)).toContain(expected);
    }
  });

  it('覆盖失败、无错误详情失败、取消与空成功响应', () => {
    controls.state = 'failure';
    controls.error = {
      code: 'COMMON_INTERNAL_999',
      message: '读取失败',
      retryable: true,
    };
    expect(renderPanelWithCurrentResource()).toContain('data-story-knowledge-error');

    controls.error = null;
    expect(renderPanelWithCurrentResource()).toContain('故事知识暂时无法读取');

    controls.state = 'cancelled';
    expect(renderPanelWithCurrentResource()).toContain('读取已取消');

    controls.state = 'success';
    expect(renderPanelWithCurrentResource()).toContain('暂无可显示的故事知识');
  });

  it('未选择人物时保留明确空态', () => {
    expect(renderPanel(null, null)).toContain('请先选择人物');
  });
});

function renderPanelWithCurrentResource(): string {
  return renderToStaticMarkup(
    createElement(StoryKnowledgePanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      readOnly: false,
      selectedEntityId: characterId,
      selectedChapterId: chapterId,
      onNavigate: () => undefined,
    }),
  );
}
