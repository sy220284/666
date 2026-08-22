import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  arcTypeLabel,
  authorFactLabel,
  authorStateLabel,
  chapterName,
  entityName,
  knowledgeStatusLabel,
  parseAuthorValue,
  promptChapterId,
  recordStatusLabel,
  timelinePrecisionLabel,
  type CanonAuthorReferences,
} from '../../apps/desktop/renderer/src/features/canon/canon-author-fields.js';

const authorDialogs = vi.hoisted(() => ({ authorSelect: vi.fn() }));

vi.mock('../../apps/desktop/renderer/src/runtime/author-dialog.js', () => ({
  authorSelect: authorDialogs.authorSelect,
}));

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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('把常用事实和动态状态键转换为作者名称', () => {
    expect(authorFactLabel('appearance')).toBe('外貌特征');
    expect(authorStateLabel('emotion')).toBe('情绪状态');
    expect(authorFactLabel('custom-key')).toBe('custom-key');
  });

  it('按作者选择的值类型安全解析输入', () => {
    expect(parseAuthorValue('text', '  清河  ')).toBe('清河');
    expect(parseAuthorValue('number', '12')).toBe(12);
    expect(parseAuthorValue('boolean', '是')).toBe(true);
    expect(parseAuthorValue('boolean', 'true')).toBe(true);
    expect(parseAuthorValue('boolean', '否')).toBe(false);
    expect(parseAuthorValue('boolean', 'false')).toBe(false);
    expect(parseAuthorValue('list', '赵二，少东家\n清河')).toEqual(['赵二', '少东家', '清河']);
    expect(parseAuthorValue('list', ' ，\n ')).toEqual([]);
    expect(parseAuthorValue('json', '{"伤势":"左肩"}')).toEqual({ 伤势: '左肩' });
    expect(parseAuthorValue('json', '')).toBeNull();
  });

  it('数字、布尔值与原始JSON格式错误时返回作者可理解说明', () => {
    expect(() => parseAuthorValue('number', '十二')).toThrow('请输入有效数字');
    expect(() => parseAuthorValue('boolean', '大概')).toThrow('布尔值只能填写“是”或“否”');
    expect(() => parseAuthorValue('json', '{伤势:左肩}')).toThrow(
      '原始JSON格式不正确，请检查括号、引号和逗号',
    );
  });

  it('用中文显示章节和内部状态', () => {
    expect(chapterName(references, references.chapters[0]?.id ?? null)).toBe('第一卷 / 第三章');
    expect(chapterName(references, null)).toBe('当前');
    expect(chapterName(references, '不存在')).toBe('未知章节');
    expect(entityName(references, '不存在')).toBe('未知设定条目');
    expect(knowledgeStatusLabel('suspects')).toBe('有所怀疑');
    expect(knowledgeStatusLabel('未登记')).toBe('状态未知');
    expect(recordStatusLabel('superseded')).toBe('已被更新');
    expect(recordStatusLabel('custom')).toBe('custom');
    expect(timelinePrecisionLabel('approximate')).toBe('大致时间');
    expect(timelinePrecisionLabel('custom')).toBe('custom');
    expect(arcTypeLabel('redemption')).toBe('救赎');
    expect(arcTypeLabel('customized')).toBe('customized');
    expect(authorStateLabel('custom-state')).toBe('custom-state');
  });

  it('用作者选择的章节名称返回内部章节标识', async () => {
    expect(await promptChapterId([], '选择章节')).toBeNull();

    authorDialogs.authorSelect
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(references.chapters[0]?.id)
      .mockResolvedValueOnce('不存在的章节');
    expect(await promptChapterId(references.chapters, '选择章节')).toBeNull();
    expect(await promptChapterId(references.chapters, '选择章节')).toBe(references.chapters[0]?.id);
    expect(await promptChapterId(references.chapters, '选择章节')).toBeNull();
  });
});
