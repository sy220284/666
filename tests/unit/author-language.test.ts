import { describe, expect, it } from 'vitest';

import {
  authorErrorMessage,
  authorErrorSummary,
} from '../../apps/desktop/renderer/src/presentation/author-error-message.js';
import { authorStatusLabel } from '../../apps/desktop/renderer/src/presentation/author-status-labels.js';
import {
  AUTHOR_TERMS,
  authorTerm,
  technicalTermDetail,
} from '../../apps/desktop/renderer/src/presentation/author-terms.js';
import {
  authorAttentionLabel,
  authorCharacterArcStatusLabel,
  authorEntityTypeLabel,
  authorForeshadowingStatusLabel,
  authorJsonValue,
  authorPlotNodeTypeLabel,
  authorSceneBeatTypeLabel,
} from '../../apps/desktop/renderer/src/presentation/author-value-format.js';

describe('正式中文名称', () => {
  it('为核心写作概念提供唯一中文名称', () => {
    expect(authorTerm('draft')).toBe('当前稿');
    expect(authorTerm('draftBlock')).toBe('正文段落');
    expect(authorTerm('version')).toBe('历史版本');
    expect(authorTerm('finalVersion')).toBe('定稿');
    expect(authorTerm('candidate')).toBe('AI建议稿');
    expect(authorTerm('provider')).toBe('AI连接');
    expect(authorTerm('projectBrief')).toBe('作品核心');
    expect(authorTerm('sceneBeat')).toBe('场景');
    expect(authorTerm('canon')).toBe('人物与世界');
    expect(authorTerm('aiReview')).toBe('AI审阅');
    expect(authorTerm('stateProposal')).toBe('AI审阅建议');
    expect(authorTerm('reviewProposal')).toBe('AI审阅建议');
    expect(authorTerm('validation')).toBe('内容检查');
    expect(authorTerm('storyTodo')).toBe('修改任务');
    expect(authorTerm('beginnerMode')).toBe('简明模式');
    expect(authorTerm('professionalMode')).toBe('完整模式');
  });

  it('技术详情保持中文名称在前并保留内部标识', () => {
    expect(technicalTermDetail('candidate', 'CandidateDocument')).toEqual({
      authorLabel: 'AI建议稿',
      internalName: 'CandidateDocument',
    });
  });

  it('正式名称不存在空值，兼容键只允许映射到同一现行名称', () => {
    const labels = Object.values(AUTHOR_TERMS);
    expect(labels.every((label) => label.trim().length > 0)).toBe(true);
    const duplicateLabels = labels.filter((label, index) => labels.indexOf(label) !== index);
    expect([...new Set(duplicateLabels)]).toEqual(['AI审阅建议']);
  });
});

describe('作者状态名称', () => {
  it('将内部状态转换为作者可理解的名称', () => {
    expect(authorStatusLabel('pending')).toBe('等待处理');
    expect(authorStatusLabel('partial')).toBe('未完成');
    expect(authorStatusLabel('false_positive')).toBe('已标记为误报');
    expect(authorStatusLabel('degraded')).toBe('部分功能受限');
  });

  it('未知状态使用安全回退，不向普通界面泄漏内部枚举', () => {
    expect(authorStatusLabel('custom-status')).toBe('状态未知');
    expect(authorStatusLabel('partially_processed')).toBe('状态未知');
  });
});

describe('设定与规划值格式化', () => {
  it('将设定类型、规划类型和状态转换为正式中文名称', () => {
    expect(authorEntityTypeLabel('character')).toBe('人物');
    expect(authorEntityTypeLabel('rule')).toBe('世界规则');
    expect(authorEntityTypeLabel('unknown')).toBe('其他设定');
    expect(authorForeshadowingStatusLabel('partially_revealed')).toBe('已部分揭示');
    expect(authorCharacterArcStatusLabel('active')).toBe('进行中');
    expect(authorAttentionLabel('overdue')).toBe('已经逾期');
    expect(authorSceneBeatTypeLabel('turn')).toBe('关键转折');
    expect(authorPlotNodeTypeLabel('arc')).toBe('故事线');
  });

  it('普通视图不直接显示原始结构化数据', () => {
    expect(authorJsonValue(null)).toBe('无');
    expect(authorJsonValue(['清河', '不羡仙'])).toBe('清河、不羡仙');
    expect(authorJsonValue({ location: '清河' })).toBe('结构化内容');
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

  it('未知错误摘要不把桥接消息和错误码带入普通提示', () => {
    const summary = authorErrorSummary({
      code: 'CORE_STATUS_FAILED',
      message: 'CORE_STATUS_FAILED',
    });
    expect(summary).toContain('操作未完成');
    expect(summary).not.toContain('CORE_STATUS_FAILED');
  });

  it('未知错误使用固定安全回退，不展示未经映射的技术消息', () => {
    const expected = {
      title: '操作未完成',
      message: '系统未能完成本次操作，现有内容保持不变。',
      suggestedAction: '请查看技术详情后重试。',
    };
    expect(authorErrorMessage('UNKNOWN_ERROR', '磁盘写入失败')).toEqual(expected);
    expect(authorErrorMessage('UNKNOWN_ERROR', 'Internal disk write failure.')).toEqual(expected);
  });
});
