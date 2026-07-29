import { describe, expect, it } from 'vitest';

import {
  arcTypeLabel,
  authorFactLabel,
  authorStateLabel,
  chapterName,
  knowledgeStatusLabel,
  parseAuthorValue,
  recordStatusLabel,
  timelinePrecisionLabel,
  type CanonAuthorReferences,
} from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';

const references: CanonAuthorReferences = {
  state: 'ready',
  entities: [],
  chapters: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      label: '第一卷 / 第三章',
      finalVersionId: '22222222-2222-4222-8222-222222222222',
    },
  ],
  versions: [
    {
      id: '22222222-2222-4222-8222-222222222222',
      chapterId: '11111111-1111-4111-8111-111111111111',
      label: '第一卷 / 第三章 · 定稿版本',
    },
  ],
};

describe('设定结构化字段', () => {
  it('把常用事实和动态状态键转换为作者名称', () => {
    expect(authorFactLabel('appearance')).toBe('外貌特征');
    expect(authorStateLabel('emotion')).toBe('情绪状态');
    expect(authorFactLabel('custom-key')).toBe('custom-key');
  });

  it('按作者选择的值类型安全解析输入', () => {
    expect(parseAuthorValue('text', '  清河  ')).toBe('清河');
    expect(parseAuthorValue('number', '12')).toBe(12);
    expect(parseAuthorValue('boolean', '是')).toBe(true);
    expect(parseAuthorValue('list', '赵二，少东家\n清河')).toEqual(['赵二', '少东家', '清河']);
    expect(parseAuthorValue('json', '{"伤势":"左肩"}')).toEqual({ 伤势: '左肩' });
    expect(() => parseAuthorValue('number', '十二')).toThrow('请输入有效数字');
  });

  it('用中文显示章节和内部状态', () => {
    expect(chapterName(references, references.chapters[0]?.id ?? null)).toBe('第一卷 / 第三章');
    expect(chapterName(references, null)).toBe('当前');
    expect(knowledgeStatusLabel('suspects')).toBe('有所怀疑');
    expect(recordStatusLabel('superseded')).toBe('已被更新');
    expect(timelinePrecisionLabel('approximate')).toBe('大致时间');
    expect(arcTypeLabel('redemption')).toBe('救赎');
  });
});
