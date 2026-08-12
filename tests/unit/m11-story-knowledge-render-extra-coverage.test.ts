import { createRequire } from 'node:module';

import { describe, expect, it, vi } from 'vitest';

import type { StoryKnowledgeProjection } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StoryKnowledgeHistoryMetadata } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-history-metadata.js';
import { StoryKnowledgePanel } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-panel.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const controls = vi.hoisted(() => ({ data: null as StoryKnowledgeProjection | null }));

vi.mock('../../apps/desktop/renderer/src/bridge/use-bridge-resource.js', () => ({
  useBridgeQuery: () => ({
    state: 'success' as const,
    data: controls.data,
    error: null,
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

function renderProjection(projection: StoryKnowledgeProjection): string {
  controls.data = projection;
  return renderToStaticMarkup(
    createElement(StoryKnowledgePanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      readOnly: true,
      selectedEntityId: characterId,
      selectedChapterId: chapterId,
      onNavigate: () => undefined,
    }),
  );
}

function richHistory(): Extract<StoryKnowledgeProjection, { readonly view: 'history' }> {
  const candidateTypes = ['skeleton', 'full', 'rewrite', 'merge'] as const;
  const statuses = ['pending', 'accepted', 'discarded', 'pending'] as const;
  const tracks = ['daily', 'major', 'named'] as const;
  const failureCodes = [
    'BACKUP_CREATE_FAILED',
    'BACKUP_VERIFY_FAILED',
    'BACKUP_SPACE_LOW',
  ] as const;
  return contractInput({
    view: 'history',
    projectId,
    bounded: true,
    chapterId,
    items: [
      {
        versionId: '50000000-0000-4000-8000-000000000001',
        chapterId,
        title: '版本',
        createdAt: '2026-08-11T10:00:00.000Z',
        finalized: false,
        versionType: 'rewrite',
      },
    ],
    nextBeforeCreatedAt: null,
    nextBeforeVersionId: null,
    candidates: candidateTypes.map((candidateType, index) => ({
      candidateId: `51000000-0000-4000-8000-00000000000${index + 1}`,
      title: `候选${index + 1}`,
      candidateType,
      completeness: index % 2 === 0 ? 'complete' : 'partial',
      status: statuses[index],
      generationRunId: null,
      sourceVersionId: null,
      createdAt: '2026-08-11T11:00:00.000Z',
      resolvedAt: index === 0 ? null : '2026-08-11T12:00:00.000Z',
    })),
    candidatesTruncated: true,
    recovery: {
      checkpoints: tracks.map((track, index) => ({
        backupId: `52000000-0000-4000-8000-00000000000${index + 1}`,
        projectId,
        operation: 'replace',
        backupFileName: `backup-${index + 1}.sqlite`,
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
        createdAt: '2026-08-11T11:00:00.000Z',
        verifiedAt: '2026-08-11T11:00:00.000Z',
        track,
        displayName: index === 0 ? null : `恢复点${index + 1}`,
        note: null,
        authorProtected: false,
        migrationProtected: false,
        schemaVersion: 1,
        protectionReasons: [],
      })),
      checkpointsTruncated: true,
      backupFailures: failureCodes.map((errorCode, index) => ({
        failureId: `53000000-0000-4000-8000-00000000000${index + 1}`,
        projectId,
        operation: 'replace',
        track: tracks[index],
        errorCode,
        occurredAt: '2026-08-11T11:00:00.000Z',
        resolvedAt: index === 0 ? null : '2026-08-11T12:00:00.000Z',
      })),
      backupFailuresTruncated: true,
    },
  });
}

describe('M11-04 Story Knowledge renderer remaining branches', () => {
  it('覆盖历史候选稿、恢复点和备份异常标签的全部枚举分支', () => {
    const metadata = createElement(StoryKnowledgeHistoryMetadata, {
      projection: richHistory(),
    });
    const html = renderToStaticMarkup(metadata);
    for (const text of [
      '骨架候选稿',
      '完整生成',
      '改写候选稿',
      '合并候选稿',
      '待审阅',
      '已采用',
      '已舍弃',
      '日常备份',
      '重要恢复点',
      '命名快照',
      '备份创建失败',
      '备份校验失败',
      '备份空间不足',
      '部分候选稿',
      '待处理',
      '已解决',
    ]) {
      expect(html).toContain(text);
    }
  });

  it('覆盖关系、时间线、伏笔和成长路线的非截断分支', () => {
    const relation = contractInput<StoryKnowledgeProjection>({
      view: 'relationships',
      projectId,
      bounded: true,
      center: { id: characterId, name: '沈砚', summary: '' },
      relationships: [
        {
          id: '54000000-0000-4000-8000-000000000001',
          fromCharacterId: characterId,
          fromCharacterName: '沈砚',
          toCharacterId: secondCharacterId,
          toCharacterName: '顾青',
          category: 'ally',
          label: '',
        },
      ],
      truncated: false,
    });
    expect(renderProjection(relation)).toContain('只读模式');

    const timeline = contractInput<StoryKnowledgeProjection>({
      view: 'timeline',
      projectId,
      bounded: true,
      anchorChapterId: chapterId,
      items: [
        {
          id: '55000000-0000-4000-8000-000000000001',
          chapterId,
          chapterTitle: '第一章',
          title: '事件',
          startValue: '夜',
          endValue: null,
        },
      ],
      truncatedBefore: false,
      truncatedAfter: false,
    });
    expect(renderProjection(timeline)).not.toContain('时间线两侧仍有更多事件');

    const foreshadowing = contractInput<StoryKnowledgeProjection>({
      view: 'foreshadowing',
      projectId,
      bounded: true,
      anchorChapterId: chapterId,
      items: [
        {
          id: '56000000-0000-4000-8000-000000000001',
          title: '暗号',
          description: '已有说明',
          status: 'planted',
          attention: 'none',
        },
      ],
      truncated: false,
    });
    expect(renderProjection(foreshadowing)).not.toContain('伏笔较多');

    const arc = contractInput<StoryKnowledgeProjection>({
      view: 'arc',
      projectId,
      bounded: true,
      character: { id: characterId, name: '沈砚', summary: '' },
      milestones: [
        {
          id: '57000000-0000-4000-8000-000000000001',
          arcId: '57100000-0000-4000-8000-000000000001',
          arcTitle: '成长线',
          title: '节点',
          description: '',
          status: 'planned',
          actualChapterId: null,
          plannedChapterId: null,
        },
      ],
      truncated: false,
    });
    const arcHtml = renderProjection(arc);
    expect(arcHtml).toContain('尚未填写人物简介');
    expect(arcHtml).not.toContain('成长节点较多');
  });

  it('覆盖非 JSON 值的回退显示分支', () => {
    const character = contractInput<StoryKnowledgeProjection>({
      view: 'character_card',
      projectId,
      bounded: true,
      character: { id: characterId, name: '沈砚', summary: '' },
      facts: [
        {
          id: '58000000-0000-4000-8000-000000000001',
          key: '未定义值',
          value: undefined,
          description: '',
        },
      ],
      states: [],
      relationships: [],
    });
    expect(renderProjection(character)).toContain('—');
  });

  it('覆盖历史无下一页和丰富元数据在工作台中的渲染', () => {
    const html = renderProjection(richHistory());
    expect(html).toContain('候选稿记录');
    expect(html).not.toContain('查看更早版本');
  });
});
