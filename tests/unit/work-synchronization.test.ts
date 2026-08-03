import { describe, expect, it } from 'vitest';

import { synchronizationDecision } from '../../.github/governance/work-synchronization.mjs';

const sha = (value: string): string => value.repeat(40);

describe('work安全同步决策', () => {
  it('允许来源Head未移动时重置到已验证main', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        workSha: sha('b'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
      }),
    ).toEqual({ action: 'reset', reason: 'verified-squash-complete' });
  });

  it('work被自动删除时允许重建', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        workSha: null,
        sourceHeadSha: sha('b'),
        openPulls: 0,
      }),
    ).toEqual({ action: 'create', reason: 'work-missing' });
  });

  it('work已经等于main时保持不动', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        workSha: sha('a'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
      }),
    ).toEqual({ action: 'keep', reason: 'already-synchronized' });
  });

  it('work出现新提交时拒绝覆盖', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        workSha: sha('c'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
      }),
    ).toEqual({ action: 'blocked', reason: 'work-advanced-after-merge' });
  });

  it('存在新work合并请求时拒绝同步', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        workSha: sha('b'),
        sourceHeadSha: sha('b'),
        openPulls: 1,
      }),
    ).toEqual({ action: 'blocked', reason: 'new-work-pull-request-open' });
  });
});
