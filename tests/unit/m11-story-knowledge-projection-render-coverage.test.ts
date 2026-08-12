import { createRequire } from 'node:module';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StoryKnowledgeProjection } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StoryKnowledgePanel } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({
  view: 'character-card',
  historyCursor: null as null | { readonly createdAt: string; readonly versionId: string },
  resourceState: 'success' as 'loading' | 'success' | 'failure' | 'cancelled',
  resourceData: null as unknown,
  resourceError: null as unknown,
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState(initial: unknown) {
      if (initial === 'character-card') return [controls.view, () => undefined];
      if (initial === null) return [controls.historyCursor, () => undefined];
      return actual.useState(initial);
    },
  };
});

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: () => ({
    state: controls.resourceState,
    data: controls.resourceData,
    error: controls.resourceError,
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

function renderPanel({
  view,
  projection,
  selectedEntityId = characterId,
  selectedChapterId = chapterId,
}: {
  readonly view: string;
  readonly projection?: StoryKnowledgeProjection | null;
  readonly selectedEntityId?: string | null;
  readonly selectedChapterId?: string | null;
}): string {
  controls.view = view;
  controls.resourceState = 'success';
  controls.resourceData = projection ?? null;
  controls.resourceError = null;
  return renderToStaticMarkup(
    createElement(StoryKnowledgePanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      readOnly: false,
      selectedEntityId,
      selectedChapterId,
      onNavigate: () => undefined,
    }),
  );
}

function characterCard(empty: boolean): Extract<
  StoryKnowledgeProjection,
  { readonly view: 'character_card' }
> {
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

function relationshipProjection(empty: boolean): Extract<
  StoryKnowledgeProjection,
  { readonly view: 'relationships' }
> {
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

function timelineProjection(empty: boolean): Extract<
  StoryKnowledgeProjection,
  { readonly view: 'timeline' }
> {
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

function foreshadowingProjection(empty: boolean): Extract<
  StoryKnowledgeProjection,
  { readonly view: 'foreshadowing' }
> {
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

function arcProjection(empty: boolean): Extract<StoryKnowledgeProjection, { readonly view: 'arc' }> {
  return contractInput({
    view: 'arc',
    projectId,
    bounded: true,
    character: { id: characterId, name: '沈砚', summary: empty ? '' : '从旁观到承担。' },
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

function historyProjection(empty: boolean): Extract<
  StoryKnowledgeProjection,
  { readonly view: 'history' }
> {
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
    controls.view = 'character-card';
    controls.historyCursor = null;
    controls.resourceState = 'success';
    controls.resourceData = null;
    controls.resourceError = null;
  });

  it('覆盖人物、关系、时间线、伏笔、成长与历史的非空和空态', () => {
    const cases: ReadonlyArray<readonly [string, StoryKnowledgeProjection, string]> = [
      ['character-card', characterCard(false), '负责追查旧案'],
      ['character-card', characterCard(true), '尚未填写人物简介'],
      ['relationships', relationshipProjection(false), '关系较多，仅显示当前窗口'],
      ['relationships', relationshipProjection(true), '当前章节没有可显示的人物关系'],
      ['story-timeline', timelineProjection(false), '雨夜目击'],
      ['story-timeline', timelineProjection(true), '当前时间窗口没有事件'],
      ['character-timeline', timelineProjection(false), '密信送达'],
      ['foreshadowing', foreshadowingProjection(false), '已超过回收窗口'],
      ['foreshadowing', foreshadowingProjection(true), '当前章节没有需要关注的伏笔'],
      ['arc', arcProjection(false), '开放节点'],
      ['arc', arcProjection(true), '该人物暂无成长节点'],
      ['history', historyProjection(false), '查看更早版本'],
      ['history', historyProjection(true), '当前页没有版本记录'],
    ];

    for (const [view, projection, expected] of cases) {
      const html = renderPanel({ view, projection });
      expect(html).toContain(expected);
    }
  });

  it('覆盖历史游标、资源失败、取消和空成功响应', () => {
    controls.historyCursor = {
      createdAt: '2026-08-10T10:00:00.000Z',
      versionId,
    };
    expect(renderPanel({ view: 'history', projection: historyProjection(false) })).toContain(
      '回到最新',
    );

    controls.view = 'character-card';
    controls.resourceState = 'failure';
    controls.resourceData = null;
    controls.resourceError = {
      code: 'COMMON_INTERNAL_999',
      message: '读取失败',
      retryable: true,
    };
    const failure = renderToStaticMarkup(
      createElement(StoryKnowledgePanel, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        projectId,
        readOnly: false,
        selectedEntityId: characterId,
        selectedChapterId: chapterId,
        onNavigate: () => undefined,
      }),
    );
    expect(failure).toContain('data-story-knowledge-error');

    controls.resourceState = 'cancelled';
    controls.resourceError = null;
    const cancelled = renderToStaticMarkup(
      createElement(StoryKnowledgePanel, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        projectId,
        readOnly: false,
        selectedEntityId: characterId,
        selectedChapterId: chapterId,
        onNavigate: () => undefined,
      }),
    );
    expect(cancelled).toContain('读取已取消');

    controls.resourceState = 'success';
    const emptySuccess = renderToStaticMarkup(
      createElement(StoryKnowledgePanel, {
        bridge: contractInput<RendererBridgeAdapter>({}),
        projectId,
        readOnly: false,
        selectedEntityId: characterId,
        selectedChapterId: chapterId,
        onNavigate: () => undefined,
      }),
    );
    expect(emptySuccess).toContain('暂无可显示的故事知识');
  });

  it('覆盖各视图缺少人物或章节时的选择提示', () => {
    expect(
      renderPanel({
        view: 'relationships',
        selectedEntityId: null,
        selectedChapterId: null,
      }),
    ).toContain('请先选择人物和章节');
    expect(
      renderPanel({ view: 'story-timeline', selectedEntityId: null, selectedChapterId: null }),
    ).toContain('请先选择章节');
    expect(renderPanel({ view: 'arc', selectedEntityId: null })).toContain('请先选择人物');
    expect(
      renderPanel({ view: 'character-timeline', selectedChapterId: null }),
    ).toContain('请先选择章节');
    expect(renderPanel({ view: 'foreshadowing', selectedChapterId: null })).toContain(
      '请先选择章节',
    );
    expect(renderPanel({ view: 'history', selectedChapterId: null })).toContain('请先选择章节');
  });
});
