import { describe, expect, it } from 'vitest';

import {
  resolveAuthorNavigationTarget,
  searchResultNavigationTarget,
} from '../../apps/desktop/renderer/src/shell/navigation-target.js';

describe('内容精准跳转', () => {
  it('将正文搜索结果转换为章节与正文块目标', () => {
    const target = searchResultNavigationTarget(
      'project-1',
      {
        sourceType: 'draft',
        targetId: '00000000-0000-4000-8000-000000000010',
        anchorId: '00000000-0000-4000-8000-000000000011',
        chapterId: '00000000-0000-4000-8000-000000000012',
        title: '第一章',
        excerpt: '赵二进入清河。',
        score: 1,
      },
      '赵二',
    );

    expect(target).toEqual({
      type: 'draft-block',
      projectId: 'project-1',
      chapterId: '00000000-0000-4000-8000-000000000012',
      logicalBlockId: '00000000-0000-4000-8000-000000000011',
      query: '赵二',
    });
    expect(resolveAuthorNavigationTarget(target!)).toMatchObject({
      route: 'writing',
      selection: {
        chapterId: '00000000-0000-4000-8000-000000000012',
        logicalBlockId: '00000000-0000-4000-8000-000000000011',
      },
      filters: { 'navigation.query': '赵二' },
    });
  });

  it('将历史版本和人物设定结果送到对应工作台', () => {
    const versionTarget = searchResultNavigationTarget(
      'project-1',
      {
        sourceType: 'version',
        targetId: '00000000-0000-4000-8000-000000000020',
        anchorId: null,
        chapterId: '00000000-0000-4000-8000-000000000021',
        title: '第一章定稿',
        excerpt: '清河旧事。',
        score: 1,
      },
      '清河',
    );
    expect(resolveAuthorNavigationTarget(versionTarget!)).toMatchObject({
      route: 'versions',
      selection: {
        chapterId: '00000000-0000-4000-8000-000000000021',
        versionId: '00000000-0000-4000-8000-000000000020',
      },
    });

    const entityTarget = searchResultNavigationTarget(
      'project-1',
      {
        sourceType: 'entity',
        targetId: '00000000-0000-4000-8000-000000000030',
        anchorId: null,
        chapterId: null,
        title: '赵二',
        excerpt: '人物设定。',
        score: 1,
      },
      '赵二',
    );
    expect(resolveAuthorNavigationTarget(entityTarget!)).toMatchObject({
      route: 'canon',
      selection: { entityId: '00000000-0000-4000-8000-000000000030' },
    });
  });

  it('缺少章节的正文或历史版本结果不会错误跳转', () => {
    expect(
      searchResultNavigationTarget(
        'project-1',
        {
          sourceType: 'draft',
          targetId: '00000000-0000-4000-8000-000000000040',
          anchorId: null,
          chapterId: null,
          title: '失效结果',
          excerpt: '',
          score: null,
        },
        '失效',
      ),
    ).toBeNull();
  });
});
