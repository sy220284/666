import { afterEach, describe, expect, it, vi } from 'vitest';

import type { StateProposal } from '@worldforge/contracts';

import {
  editProposalValue,
  proposalConfidenceLabel,
} from '../../apps/desktop/renderer/src/features/canon/state-proposal-author-edit.js';

function proposal(overrides: Record<string, unknown> = {}): StateProposal {
  return {
    proposalType: 'entity_state',
    stateKey: 'location',
    proposedValue: '清河',
    chapterId: '11111111-1111-4111-8111-111111111111',
    ...overrides,
  } as unknown as StateProposal;
}

describe('M11 作者可读 AI 设定建议编辑', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('把可信度稳定映射为高、中、低', () => {
    expect(proposalConfidenceLabel(0.8)).toBe('高');
    expect(proposalConfidenceLabel(1)).toBe('高');
    expect(proposalConfidenceLabel(0.5)).toBe('中');
    expect(proposalConfidenceLabel(0.79)).toBe('中');
    expect(proposalConfidenceLabel(0.49)).toBe('低');
  });

  it('拒绝普通模式无法安全编辑的建议类型和复杂结构', () => {
    expect(editProposalValue(proposal({ proposalType: 'foreshadowing' }))).toEqual({
      state: 'invalid',
      message: '当前建议暂不支持直接修改，可以接受或忽略。',
    });
    expect(
      editProposalValue(
        proposal({ stateKey: 'custom-complex', proposedValue: { nested: ['value'] } }),
      ),
    ).toEqual({
      state: 'invalid',
      message: '当前建议包含复杂结构，普通模式暂不直接编辑；可以接受、忽略或查看技术详情。',
    });
  });

  it('按字段类型和现有值生成作者输入，并支持取消与格式错误', () => {
    const prompt = vi.fn();
    vi.stubGlobal('window', { prompt });

    prompt.mockReturnValueOnce(' 临安 ');
    expect(editProposalValue(proposal())).toEqual({ state: 'ready', value: '临安' });
    expect(prompt).toHaveBeenLastCalledWith('所在地点：直接填写最终内容', '清河');

    prompt.mockReturnValueOnce('12');
    expect(editProposalValue(proposal({ stateKey: 'custom-number', proposedValue: 10 }))).toEqual({
      state: 'ready',
      value: 12,
    });
    expect(prompt).toHaveBeenLastCalledWith('最终内容：请输入数字', '10');

    prompt.mockReturnValueOnce('是');
    expect(
      editProposalValue(proposal({ stateKey: 'custom-boolean', proposedValue: false })),
    ).toEqual({ state: 'ready', value: true });
    expect(prompt).toHaveBeenLastCalledWith('最终内容：请输入“是”或“否”', '否');

    prompt.mockReturnValueOnce('令牌\n密信');
    expect(
      editProposalValue(proposal({ stateKey: 'custom-list', proposedValue: ['令牌', '旧信'] })),
    ).toEqual({ state: 'ready', value: ['令牌', '密信'] });
    expect(prompt).toHaveBeenLastCalledWith('最终内容：每行填写一项', '令牌\n旧信');

    prompt.mockReturnValueOnce(null);
    expect(editProposalValue(proposal())).toEqual({ state: 'cancelled' });

    prompt.mockReturnValueOnce('十二');
    expect(editProposalValue(proposal({ stateKey: 'custom-number', proposedValue: 10 }))).toEqual({
      state: 'invalid',
      message: '请输入有效数字。',
    });
  });

  it('覆盖配置列表在旧值不是数组时的空缺默认值', () => {
    const prompt = vi.fn();
    vi.stubGlobal('window', { prompt });

    prompt.mockReturnValueOnce('令牌\n密信');
    expect(editProposalValue(proposal({ stateKey: 'possession', proposedValue: '未知' }))).toEqual({
      state: 'ready',
      value: ['令牌', '密信'],
    });
    expect(prompt).toHaveBeenLastCalledWith('持有物品：每行填写一项', '');
  });

  it('用作者语言编辑人物成长节点的发生、跳过、取消和非法输入', () => {
    const prompt = vi.fn();
    vi.stubGlobal('window', { prompt });

    prompt.mockReturnValueOnce('发生');
    expect(
      editProposalValue(
        proposal({ proposalType: 'arc_milestone', proposedValue: { status: 'hit' } }),
      ),
    ).toEqual({
      state: 'ready',
      value: { status: 'hit', actualChapterId: '11111111-1111-4111-8111-111111111111' },
    });
    expect(prompt).toHaveBeenLastCalledWith(
      '成长节点最终状态：请输入“已发生”或“已跳过”。',
      '已发生',
    );

    prompt.mockReturnValueOnce('skipped');
    expect(
      editProposalValue(
        proposal({ proposalType: 'arc_milestone', proposedValue: { status: 'skipped' } }),
      ),
    ).toEqual({ state: 'ready', value: { status: 'skipped', actualChapterId: null } });
    expect(prompt).toHaveBeenLastCalledWith(
      '成长节点最终状态：请输入“已发生”或“已跳过”。',
      '已跳过',
    );

    prompt.mockReturnValueOnce('hit');
    expect(
      editProposalValue(proposal({ proposalType: 'arc_milestone', proposedValue: null })),
    ).toEqual({
      state: 'ready',
      value: { status: 'hit', actualChapterId: '11111111-1111-4111-8111-111111111111' },
    });

    prompt.mockReturnValueOnce('跳过');
    expect(
      editProposalValue(proposal({ proposalType: 'arc_milestone', proposedValue: [] })),
    ).toEqual({ state: 'ready', value: { status: 'skipped', actualChapterId: null } });

    prompt.mockReturnValueOnce(null);
    expect(
      editProposalValue(proposal({ proposalType: 'arc_milestone', proposedValue: '未知' })),
    ).toEqual({ state: 'cancelled' });

    prompt.mockReturnValueOnce('以后再说');
    expect(
      editProposalValue(
        proposal({ proposalType: 'arc_milestone', proposedValue: { status: 'other' } }),
      ),
    ).toEqual({
      state: 'invalid',
      message: '成长节点状态只能填写“已发生”或“已跳过”。',
    });
  });
});
