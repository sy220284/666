import { describe, expect, it } from 'vitest';

import { authorErrorMessage } from '../../apps/desktop/renderer/src/presentation/author-error-message.js';
import { authorStatusLabel } from '../../apps/desktop/renderer/src/presentation/author-status-labels.js';
import {
  AUTHOR_TERMS,
  authorTerm,
  technicalTermDetail,
} from '../../apps/desktop/renderer/src/presentation/author-terms.js';

describe('正式中文名称', () => {
  it('为核心写作概念提供唯一中文名称', () => {
    expect(authorTerm('draft')).toBe('当前稿');
    expect(authorTerm('version')).toBe('历史版本');
    expect(authorTerm('candidate')).toBe('建议稿');
    expect(authorTerm('provider')).toBe('AI连接');
    expect(authorTerm('stateProposal')).toBe('设定更新建议');
    expect(authorTerm('validation')).toBe('作品检查');
    expect(authorTerm('beginnerMode')).toBe('简明模式');
    expect(authorTerm('professionalMode')).toBe('完整模式');
  });

  it('技术详情保持中文名称在前并保留内部标识', () => {
    expect(technicalTermDetail('candidate', 'CandidateDocument')).toEqual({
      authorLabel: '建议稿',
      internalName: 'CandidateDocument',
    });
  });

  it('正式名称不存在空值或重复值', () => {
    const labels = Object.values(AUTHOR_TERMS);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('作者状态名称', () => {
  it('将内部状态转换为作者可理解的名称', () => {
    expect(authorStatusLabel('pending')).toBe('等待处理');
    expect(authorStatusLabel('partial')).toBe('未完成');
    expect(authorStatusLabel('false_positive')).toBe('已标记为误报');
    expect(authorStatusLabel('custom-status')).toBe('custom-status');
  });
});

describe('作者错误说明', () => {
  it('保存冲突时明确说明系统没有覆盖正文', () => {
    expect(authorErrorMessage('REVISION_CONFLICT')).toEqual({
      title: '当前稿已经发生变化',
      message: '建议稿生成后，当前稿又有新的修改。系统没有覆盖正文。',
      suggestedAction: '请重新比较内容后再采用。',
    });
  });

  it('未知错误使用安全回退说明', () => {
    expect(authorErrorMessage('UNKNOWN_ERROR', '磁盘写入失败')).toEqual({
      title: '操作未完成',
      message: '磁盘写入失败',
      suggestedAction: '请查看技术详情后重试。',
    });
  });
});
