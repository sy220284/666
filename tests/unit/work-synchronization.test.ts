import { describe, expect, it } from 'vitest';

import {
  assertSynchronizedWorkRef,
  synchronizationDecision,
  synchronizationRequest,
} from '../../.github/governance/work-synchronization.mjs';

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

  it('复读最终work Ref并要求与main完全一致', () => {
    expect(assertSynchronizedWorkRef({ object: { sha: sha('a') } }, sha('a'))).toBe(sha('a'));
    expect(() => assertSynchronizedWorkRef({ object: { sha: sha('b') } }, sha('a'))).toThrow(
      'postcondition failed',
    );
  });
});

describe('work同步请求来源', () => {
  it('接受成功的Main Verification完成事件', () => {
    expect(
      synchronizationRequest({
        workflow_run: {
          name: 'Main Verification',
          conclusion: 'success',
          head_sha: sha('a'),
        },
      }),
    ).toEqual({
      mode: 'workflow-run',
      mainSha: sha('a'),
      sourcePr: null,
      sourceHeadSha: null,
    });
  });

  it('接受带完整来源绑定的手动恢复请求', () => {
    expect(
      synchronizationRequest({
        inputs: {
          expected_sha: sha('a'),
          source_pr: '301',
          source_head_sha: sha('b'),
        },
      }),
    ).toEqual({
      mode: 'workflow-dispatch',
      mainSha: sha('a'),
      sourcePr: 301,
      sourceHeadSha: sha('b'),
    });
  });

  it('拒绝缺少来源Head的手动恢复请求', () => {
    expect(() =>
      synchronizationRequest({
        inputs: {
          expected_sha: sha('a'),
          source_pr: '301',
          source_head_sha: '',
        },
      }),
    ).toThrow('source_head_sha');
  });
});
