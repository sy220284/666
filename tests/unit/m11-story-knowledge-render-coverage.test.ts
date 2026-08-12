import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';

import type { StoryKnowledgeProjection } from '@worldforge/contracts';
import type { createElement as createReactElement } from 'react';
import type { renderToStaticMarkup as renderReactToStaticMarkup } from 'react-dom/server';

import type { RendererBridgeAdapter } from '../../apps/desktop/renderer/src/bridge/renderer-bridge-adapter.js';
import { StoryKnowledgeHistoryMetadata } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-history-metadata.js';
import { StoryKnowledgePanel } from '../../apps/desktop/renderer/src/features/canon/story-knowledge-panel.js';
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
const characterId = '33333333-3333-4333-8333-333333333333';

function renderPanel(readOnly: boolean, selected = false): string {
  return renderToStaticMarkup(
    createElement(StoryKnowledgePanel, {
      bridge: contractInput<RendererBridgeAdapter>({}),
      projectId,
      readOnly,
      selectedEntityId: selected ? characterId : null,
      selectedChapterId: selected ? chapterId : null,
      onNavigate: () => undefined,
    }),
  );
}

describe('M11-04 故事知识工作台服务端渲染覆盖', () => {
  it('渲染七类故事知识视图与缺失选择空态', () => {
    const html = renderPanel(false);

    for (const label of [
      '人物卡',
      '人物关系图',
      '故事时间线',
      '人物时间线',
      '伏笔泳道',
      '成长路线',
      '历史时间轴',
    ]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('data-story-knowledge-panel');
    expect(html).toContain('data-story-knowledge-empty');
    expect(html).toContain('请先选择人物');
  });

  it('只读模式仍允许读取故事知识，并显式进入加载态', () => {
    const html = renderPanel(true, true);

    expect(html).toContain('只读模式');
    expect(html).toContain('正在读取故事知识…');
    expect(html).not.toContain('请先选择人物');
  });

  it('历史元数据同时呈现候选稿、恢复点和恢复异常', () => {
    const projection = contractInput<
      Extract<StoryKnowledgeProjection, { readonly view: 'history' }>
    >({
      view: 'history',
      projectId,
      bounded: true,
      chapterId,
      items: [],
      nextBeforeCreatedAt: null,
      nextBeforeVersionId: null,
      candidates: [
        {
          candidateId: '44444444-4444-4444-8444-444444444444',
          title: '河边改写稿',
          candidateType: 'rewrite',
          completeness: 'complete',
          status: 'pending',
          generationRunId: null,
          sourceVersionId: null,
          createdAt: '2026-08-11T10:00:00.000Z',
          resolvedAt: null,
        },
      ],
      candidatesTruncated: true,
      recovery: {
        checkpoints: [
          {
            backupId: '55555555-5555-4555-8555-555555555555',
            projectId,
            operation: 'manual-protection',
            backupFileName: 'snapshot.sqlite',
            sizeBytes: 1024,
            sha256: 'a'.repeat(64),
            createdAt: '2026-08-11T09:00:00.000Z',
            verifiedAt: '2026-08-11T09:00:01.000Z',
            track: 'named',
            displayName: '夜渡前快照',
            note: null,
            authorProtected: true,
            migrationProtected: false,
            schemaVersion: 29,
            protectionReasons: ['author-protected'],
          },
        ],
        checkpointsTruncated: true,
        backupFailures: [
          {
            failureId: '66666666-6666-4666-8666-666666666666',
            projectId,
            operation: 'replace',
            track: 'major',
            errorCode: 'BACKUP_VERIFY_FAILED',
            occurredAt: '2026-08-11T08:00:00.000Z',
            resolvedAt: null,
          },
        ],
        backupFailuresTruncated: true,
      },
    });

    const html = renderToStaticMarkup(createElement(StoryKnowledgeHistoryMetadata, { projection }));

    expect(html).toContain('data-history-candidates');
    expect(html).toContain('河边改写稿');
    expect(html).toContain('改写候选稿');
    expect(html).toContain('待审阅');
    expect(html).toContain('data-history-checkpoints');
    expect(html).toContain('夜渡前快照');
    expect(html).toContain('命名快照');
    expect(html).toContain('data-history-backup-failures');
    expect(html).toContain('备份校验失败');
    expect(html).toContain('待处理');
    expect(html).toContain('候选稿记录较多，仅显示当前窗口。');
    expect(html).toContain('恢复点较多，仅显示当前窗口。');
    expect(html).toContain('恢复异常较多，仅显示当前窗口。');
  });

  it('历史元数据为空时保留清晰空态', () => {
    const projection = contractInput<
      Extract<StoryKnowledgeProjection, { readonly view: 'history' }>
    >({
      view: 'history',
      projectId,
      bounded: true,
      chapterId,
      items: [],
      nextBeforeCreatedAt: null,
      nextBeforeVersionId: null,
      candidates: [],
      candidatesTruncated: false,
      recovery: {
        checkpoints: [],
        checkpointsTruncated: false,
        backupFailures: [],
        backupFailuresTruncated: false,
      },
    });

    const html = renderToStaticMarkup(createElement(StoryKnowledgeHistoryMetadata, { projection }));

    expect(html).toContain('当前章节没有候选稿记录。');
    expect(html).toContain('当前作品没有恢复点记录。');
    expect(html).toContain('当前作品没有备份异常记录。');
  });
});
