import { afterEach, describe, expect, it, vi } from 'vitest';

import { StateProposalSchema, type StateProposal } from '@worldforge/contracts';

import { editProposalValue } from '../../apps/desktop/renderer/src/features/canon/state-proposal-author-edit.js';

const ids = {
  proposal: '11111111-1111-4111-8111-111111111111',
  batch: '22222222-2222-4222-8222-222222222222',
  project: '33333333-3333-4333-8333-333333333333',
  chapter: '44444444-4444-4444-8444-444444444444',
  version: '55555555-5555-4555-8555-555555555555',
  entity: '66666666-6666-4666-8666-666666666666',
  secondEntity: '77777777-7777-4777-8777-777777777777',
  foreshadowing: '88888888-8888-4888-8888-888888888888',
};

function proposal(
  proposalType: StateProposal['proposalType'],
  proposedValue: unknown,
  target: StateProposal['target'],
): StateProposal {
  return StateProposalSchema.parse({
    id: ids.proposal,
    batchId: ids.batch,
    generationRunId: null,
    projectId: ids.project,
    chapterId: ids.chapter,
    sourceVersionId: ids.version,
    proposalType,
    source: 'provider_stub',
    target,
    previousValue: null,
    proposedValue,
    evidence: [{ kind: 'logicalBlock', targetId: 'block-1', note: '正文依据' }],
    confidence: 0.7,
    status: 'pending',
    freshness: 'current',
    actionability: 'accept',
    resolvedValue: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    resolvedAt: null,
  });
}

function knowledge(
  value: unknown = { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '旧说明' },
) {
  return proposal('knowledge_state', value, {
    targetType: 'knowledge_state',
    characterId: ids.entity,
    informationKey: 'secret',
  });
}
function timeline(
  value: unknown = {
    eventId: null,
    title: '旧标题',
    startValue: '夜',
    endValue: null,
    precision: 'exact',
    locationId: null,
    description: '',
    participantIds: [],
    witnessIds: [],
    subjectIds: [],
    dependencyIds: [],
  },
) {
  return proposal('timeline_event', value, { targetType: 'timeline_event', eventId: null });
}
function relationship(
  value: unknown = { category: 'alliance', label: '同伴', validUntilChapterId: null },
) {
  return proposal('character_relationship', value, {
    targetType: 'character_relationship',
    fromCharacterId: ids.entity,
    toCharacterId: ids.secondEntity,
    category: 'alliance',
    label: '同伴',
  });
}
function entityCreate(
  value: unknown = { entityType: 'character', name: '阿灯', aliases: [], summary: '' },
) {
  return proposal('entity_create', value, {
    targetType: 'entity_create',
    entityType: 'character',
    name: '阿灯',
  });
}
function canonFact(value: unknown = { value: '旧事实', description: '' }) {
  return proposal('canon_fact', value, {
    targetType: 'canon_fact',
    entityId: ids.entity,
    factKey: 'origin',
  });
}
function foreshadowing(value: unknown = { foreshadowingId: ids.foreshadowing, status: 'planned' }) {
  return proposal('foreshadowing', value, {
    targetType: 'foreshadowing',
    foreshadowingId: ids.foreshadowing,
  });
}
function entityState(stateKey: string, value: unknown) {
  return proposal(
    'entity_state',
    { value, semanticKind: 'custom', validUntilChapterId: null },
    { targetType: 'entity_state', entityId: ids.entity, stateKey },
  );
}

function prompt(...values: Array<string | null>): ReturnType<typeof vi.fn> {
  const fn = vi.fn();
  for (const value of values) fn.mockReturnValueOnce(value);
  vi.stubGlobal('window', { prompt: fn });
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('StateProposal author edit edge coverage', () => {
  it('edits optional knowledge notes and covers cancellation/non-object structured input', () => {
    let ask = prompt('  新说明  ', null);
    expect(editProposalValue(knowledge())).toEqual({
      state: 'ready',
      value: { knowledgeStatus: 'knows', validUntilChapterId: null, notes: '新说明' },
    });
    expect(ask).toHaveBeenLastCalledWith('知情状态说明：请填写作者确认后的说明。', '旧说明');
    expect(editProposalValue(knowledge())).toEqual({ state: 'cancelled' });

    ask = prompt('  ');
    expect(
      editProposalValue(
        knowledge({ knowledgeStatus: 'knows', validUntilChapterId: null, notes: 42 }),
      ),
    ).toMatchObject({ state: 'ready', value: { notes: '' } });
    expect(ask).toHaveBeenLastCalledWith('知情状态说明：请填写作者确认后的说明。', '');

    expect(editProposalValue(knowledge('invalid'))).toEqual({
      state: 'invalid',
      message: '当前建议暂不支持直接修改，可以接受或忽略。',
    });
  });

  it('enforces required titles, relationship labels and entity names', () => {
    let ask = prompt(' 新事件 ', '   ', null);
    expect(editProposalValue(timeline())).toMatchObject({
      state: 'ready',
      value: { title: '新事件' },
    });
    expect(editProposalValue(timeline())).toEqual({ state: 'invalid', message: '内容不能为空。' });
    expect(editProposalValue(timeline())).toEqual({ state: 'cancelled' });
    expect(ask).toHaveBeenCalledWith('时间线事件标题：请填写作者确认后的标题。', '旧标题');

    prompt(' 敌手 ', '   ');
    expect(editProposalValue(relationship())).toMatchObject({
      state: 'ready',
      value: { label: '敌手' },
    });
    expect(editProposalValue(relationship())).toEqual({
      state: 'invalid',
      message: '内容不能为空。',
    });

    ask = prompt(' 新人物 ', '');
    expect(editProposalValue(entityCreate())).toMatchObject({
      state: 'ready',
      value: { name: '新人物' },
    });
    expect(editProposalValue(entityCreate())).toEqual({
      state: 'invalid',
      message: '内容不能为空。',
    });
    expect(ask).toHaveBeenCalledWith('人物或设定名称：请填写作者确认后的名称。', '阿灯');
  });

  it('covers canon-fact current-value fallback, cancellation, blank rejection and success', () => {
    prompt(null, '   ', ' 新事实 ');
    expect(editProposalValue(canonFact())).toEqual({ state: 'cancelled' });
    expect(editProposalValue(canonFact())).toEqual({
      state: 'invalid',
      message: '设定事实不能为空。',
    });
    expect(editProposalValue(canonFact())).toEqual({
      state: 'ready',
      value: { value: '新事实', description: '' },
    });

    const ask = prompt('替换数字事实');
    expect(editProposalValue(canonFact({ value: 42, description: '' }))).toMatchObject({
      state: 'ready',
      value: { value: '替换数字事实' },
    });
    expect(ask).toHaveBeenLastCalledWith('设定事实：请填写作者确认后的内容。', '');
  });

  it('covers foreshadowing cancellation, invalid status and all allowed status values', () => {
    const allowed = [
      'planned',
      'planted',
      'reinforced',
      'partially_revealed',
      'revealed',
      'cancelled',
    ];
    const ask = prompt(null, 'unknown', ...allowed);
    expect(editProposalValue(foreshadowing())).toEqual({ state: 'cancelled' });
    expect(editProposalValue(foreshadowing())).toEqual({
      state: 'invalid',
      message: '伏笔进度填写不正确。',
    });
    for (const status of allowed) {
      expect(editProposalValue(foreshadowing())).toMatchObject({
        state: 'ready',
        value: { status },
      });
    }
    expect(ask).toHaveBeenCalledWith(expect.stringContaining('伏笔进度'), 'planned');

    const nonString = prompt('revealed');
    expect(
      editProposalValue(foreshadowing({ foreshadowingId: ids.foreshadowing, status: 7 })),
    ).toMatchObject({ state: 'ready', value: { status: 'revealed' } });
    expect(nonString).toHaveBeenLastCalledWith(expect.stringContaining('伏笔进度'), '');
  });

  it('covers inferred text and configured default-value branches for entity state', () => {
    let ask = prompt(' 新文本 ');
    expect(editProposalValue(entityState('custom-string', '旧文本'))).toMatchObject({
      state: 'ready',
      value: { value: '新文本' },
    });
    expect(ask).toHaveBeenLastCalledWith('最终内容：直接填写最终内容', '旧文本');

    ask = prompt('是');
    expect(editProposalValue(entityState('alive', true))).toMatchObject({
      state: 'ready',
      value: { value: true },
    });
    expect(ask).toHaveBeenLastCalledWith(expect.stringContaining('请输入“是”或“否”'), '是');

    ask = prompt('否');
    expect(editProposalValue(entityState('alive', false))).toMatchObject({
      state: 'ready',
      value: { value: false },
    });
    expect(ask).toHaveBeenLastCalledWith(expect.stringContaining('请输入“是”或“否”'), '否');

    ask = prompt('临安');
    expect(editProposalValue(entityState('location', null))).toMatchObject({
      state: 'ready',
      value: { value: '临安' },
    });
    expect(ask).toHaveBeenLastCalledWith('所在地点：直接填写最终内容', '');
  });
});
