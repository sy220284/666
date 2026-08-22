import type { StateProposal } from '@worldforge/contracts';

import { authorPrompt } from '../../runtime/author-dialog.js';
import {
  COMMON_STATE_FIELDS,
  parseAuthorValue,
  type AuthorValueType,
} from './canon-author-fields.js';

export type ProposalEditResult =
  | { readonly state: 'cancelled' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'ready'; readonly value: unknown };

export async function editProposalValue(proposal: StateProposal): Promise<ProposalEditResult> {
  if (proposal.proposalType === 'arc_milestone') {
    return editArcMilestoneProposal(proposal);
  }
  if (proposal.proposalType !== 'entity_state') return editStructuredProposal(proposal);

  if (proposal.target.targetType !== 'entity_state') return unsupportedProposalEdit();
  const target = proposal.target;
  const proposed = objectValue(proposal.proposedValue);
  if (!proposed) return unsupportedProposalEdit();
  const innerValue = proposed['value'];
  const valueType = stateProposalValueType(proposal);
  if (!valueType) {
    return {
      state: 'invalid',
      message: '当前建议包含复杂结构，普通模式暂不直接编辑；可以接受、忽略或查看技术详情。',
    };
  }

  const fieldLabel =
    COMMON_STATE_FIELDS.find((field) => field.key === target.stateKey)?.label ?? '最终内容';
  const input = await authorPrompt({
    title: `${fieldLabel}：${authorValueInputHint(valueType)}`,
    initialValue: authorValueInputDefault(valueType, innerValue),
    multiline: valueType === 'list',
    confirmLabel: '确认修改',
  });
  if (input === null) return { state: 'cancelled' };

  try {
    return {
      state: 'ready',
      value: { ...proposed, value: parseAuthorValue(valueType, input) },
    };
  } catch (error) {
    return {
      state: 'invalid',
      message: error instanceof Error ? error.message : '内容格式不正确，未保存修改。',
    };
  }
}

async function editStructuredProposal(proposal: StateProposal): Promise<ProposalEditResult> {
  const value = objectValue(proposal.proposedValue);
  if (!value) return unsupportedProposalEdit();
  switch (proposal.proposalType) {
    case 'knowledge_state':
      return promptField(value, 'notes', '知情状态说明：请填写作者确认后的说明。');
    case 'timeline_event':
      return promptField(value, 'title', '时间线事件标题：请填写作者确认后的标题。', true);
    case 'character_relationship':
      return promptField(value, 'label', '人物关系：请填写作者确认后的关系名称。', true);
    case 'entity_create':
      return promptField(value, 'name', '人物或设定名称：请填写作者确认后的名称。', true);
    case 'canon_fact': {
      const current = typeof value['value'] === 'string' ? value['value'] : '';
      const input = await authorPrompt({
        title: '设定事实：请填写作者确认后的内容。',
        initialValue: current,
        confirmLabel: '确认修改',
      });
      if (input === null) return { state: 'cancelled' };
      if (!input.trim()) return { state: 'invalid', message: '设定事实不能为空。' };
      return { state: 'ready', value: { ...value, value: input.trim() } };
    }
    case 'foreshadowing': {
      const input = await authorPrompt({
        title:
          '伏笔进度：填写 planned、planted、reinforced、partially_revealed、revealed 或 cancelled。',
        initialValue: typeof value['status'] === 'string' ? value['status'] : '',
        confirmLabel: '确认修改',
      });
      if (input === null) return { state: 'cancelled' };
      const status = input.trim();
      const allowed = new Set([
        'planned',
        'planted',
        'reinforced',
        'partially_revealed',
        'revealed',
        'cancelled',
      ]);
      if (!allowed.has(status)) return { state: 'invalid', message: '伏笔进度填写不正确。' };
      return { state: 'ready', value: { ...value, status } };
    }
    case 'entity_state':
    case 'arc_milestone':
      return unsupportedProposalEdit();
  }
}

async function promptField(
  value: Record<string, unknown>,
  field: string,
  message: string,
  required = false,
): Promise<ProposalEditResult> {
  const input = await authorPrompt({
    title: message,
    initialValue: typeof value[field] === 'string' ? value[field] : '',
    confirmLabel: '确认修改',
  });
  if (input === null) return { state: 'cancelled' };
  const normalized = input.trim();
  if (required && !normalized) return { state: 'invalid', message: '内容不能为空。' };
  return { state: 'ready', value: { ...value, [field]: normalized } };
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unsupportedProposalEdit(): ProposalEditResult {
  return {
    state: 'invalid',
    message: '当前建议暂不支持直接修改，可以接受或忽略。',
  };
}

export function proposalConfidenceLabel(confidence: number): '高' | '中' | '低' {
  if (confidence >= 0.8) return '高';
  if (confidence >= 0.5) return '中';
  return '低';
}

async function editArcMilestoneProposal(proposal: StateProposal): Promise<ProposalEditResult> {
  const currentStatus = arcMilestoneStatus(proposal.proposedValue);
  const input = await authorPrompt({
    title: '成长节点最终状态：请输入“已发生”或“已跳过”。',
    initialValue: currentStatus === 'skipped' ? '已跳过' : '已发生',
    confirmLabel: '确认修改',
  });
  if (input === null) return { state: 'cancelled' };

  const normalized = input.trim();
  if (normalized === '已发生' || normalized === '发生' || normalized === 'hit') {
    return {
      state: 'ready',
      value: { status: 'hit', actualChapterId: proposal.chapterId },
    };
  }
  if (normalized === '已跳过' || normalized === '跳过' || normalized === 'skipped') {
    return {
      state: 'ready',
      value: { status: 'skipped', actualChapterId: null },
    };
  }
  return {
    state: 'invalid',
    message: '成长节点状态只能填写“已发生”或“已跳过”。',
  };
}

function arcMilestoneStatus(value: unknown): 'hit' | 'skipped' | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = (value as Record<string, unknown>)['status'];
  return status === 'hit' || status === 'skipped' ? status : null;
}

function stateProposalValueType(proposal: StateProposal): AuthorValueType | null {
  if (proposal.target.targetType !== 'entity_state') return null;
  const target = proposal.target;
  const configured = COMMON_STATE_FIELDS.find((field) => field.key === target.stateKey)?.valueType;
  if (configured) return configured;

  const proposed = objectValue(proposal.proposedValue);
  const value = proposed?.['value'];
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
    return 'list';
  }
  return null;
}

function authorValueInputDefault(valueType: AuthorValueType, value: unknown): string {
  if (valueType === 'boolean') {
    return value === true ? '是' : value === false ? '否' : '';
  }
  if (valueType === 'list' && Array.isArray(value)) {
    return value.map(String).join('\n');
  }
  if (valueType === 'text' || valueType === 'number') {
    return value === null ? '' : String(value);
  }
  return '';
}

function authorValueInputHint(valueType: AuthorValueType): string {
  if (valueType === 'number') return '请输入数字';
  if (valueType === 'boolean') return '请输入“是”或“否”';
  if (valueType === 'list') return '每行填写一项';
  return '直接填写最终内容';
}
