import type { StateProposal } from '@worldforge/contracts';

import {
  COMMON_STATE_FIELDS,
  parseAuthorValue,
  type AuthorValueType,
} from './canon-author-fields.js';

export type ProposalEditResult =
  | { readonly state: 'cancelled' }
  | { readonly state: 'invalid'; readonly message: string }
  | { readonly state: 'ready'; readonly value: unknown };

export function editProposalValue(proposal: StateProposal): ProposalEditResult {
  if (proposal.proposalType === 'arc_milestone') {
    return editArcMilestoneProposal(proposal);
  }
  if (proposal.proposalType !== 'entity_state') {
    return {
      state: 'invalid',
      message: '当前建议暂不支持直接修改，可以接受或忽略。',
    };
  }

  const valueType = stateProposalValueType(proposal);
  if (!valueType) {
    return {
      state: 'invalid',
      message: '当前建议包含复杂结构，普通模式暂不直接编辑；可以接受、忽略或查看技术详情。',
    };
  }

  const fieldLabel =
    COMMON_STATE_FIELDS.find((field) => field.key === proposal.stateKey)?.label ?? '最终内容';
  const input = window.prompt(
    `${fieldLabel}：${authorValueInputHint(valueType)}`,
    authorValueInputDefault(valueType, proposal.proposedValue),
  );
  if (input === null) return { state: 'cancelled' };

  try {
    return {
      state: 'ready',
      value: parseAuthorValue(valueType, input),
    };
  } catch (error) {
    return {
      state: 'invalid',
      message: error instanceof Error ? error.message : '内容格式不正确，未保存修改。',
    };
  }
}

export function proposalConfidenceLabel(confidence: number): '高' | '中' | '低' {
  if (confidence >= 0.8) return '高';
  if (confidence >= 0.5) return '中';
  return '低';
}

function editArcMilestoneProposal(proposal: StateProposal): ProposalEditResult {
  const currentStatus = arcMilestoneStatus(proposal.proposedValue);
  const input = window.prompt(
    '成长节点最终状态：请输入“已发生”或“已跳过”。',
    currentStatus === 'skipped' ? '已跳过' : '已发生',
  );
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
  const configured = COMMON_STATE_FIELDS.find(
    (field) => field.key === proposal.stateKey,
  )?.valueType;
  if (configured) return configured;

  const value = proposal.proposedValue;
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
