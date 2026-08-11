import { describe, expect, it } from 'vitest';

import {
  assertSynchronizedIntegrationRef,
  synchronizationDecision,
  synchronizationRequest,
} from '../../.github/governance/work-synchronization.mjs';

const sha = (value: string): string => value.repeat(40);

describe('集成分支安全同步决策', () => {
  it('允许来源Head未移动时重置到已验证main', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
        isSourceBranch: true,
      }),
    ).toEqual({ action: 'reset', reason: 'verified-squash-complete' });
  });

  it('来源分支已经等于main时保持不动', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('a'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
        isSourceBranch: true,
      }),
    ).toEqual({ action: 'keep', reason: 'already-synchronized' });
  });

  it('来源分支出现新提交时拒绝覆盖', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('c'),
        sourceHeadSha: sha('b'),
        openPulls: 0,
        branchName: 'governance',
        isSourceBranch: true,
      }),
    ).toEqual({ action: 'blocked', reason: 'governance-advanced-after-merge' });
  });

  it('来源分支存在新的合并请求时拒绝重置', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('b'),
        openPulls: 1,
        branchName: 'governance',
        isSourceBranch: true,
      }),
    ).toEqual({ action: 'blocked', reason: 'new-governance-pull-request-open' });
  });

  it('治理合并后自动快进空闲work到已验证main', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('c'),
        openPulls: 0,
        branchName: 'work',
        isSourceBranch: false,
        comparison: { ahead_by: 1, behind_by: 0 },
      }),
    ).toEqual({ action: 'fast-forward', reason: 'idle-branch-behind-verified-main' });
  });

  it('产品合并后自动快进空闲governance到已验证main', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('c'),
        openPulls: 0,
        branchName: 'governance',
        isSourceBranch: false,
        comparison: { ahead_by: 2, behind_by: 0 },
      }),
    ).toEqual({ action: 'fast-forward', reason: 'idle-branch-behind-verified-main' });
  });

  it('另一条lane存在开放PR时保留其工作并跳过同步', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('c'),
        openPulls: 1,
        branchName: 'work',
        isSourceBranch: false,
        comparison: { ahead_by: 1, behind_by: 0 },
      }),
    ).toEqual({ action: 'skip', reason: 'active-work-pull-request-open' });
  });

  it('另一条lane含独有提交时拒绝强制覆盖', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: sha('b'),
        sourceHeadSha: sha('c'),
        openPulls: 0,
        branchName: 'work',
        isSourceBranch: false,
        comparison: { ahead_by: 1, behind_by: 1 },
      }),
    ).toEqual({ action: 'blocked', reason: 'work-not-fast-forwardable-to-main' });
  });

  it('缺失的空闲集成分支允许从main重建', () => {
    expect(
      synchronizationDecision({
        mainSha: sha('a'),
        branchSha: null,
        sourceHeadSha: sha('b'),
        openPulls: 0,
        branchName: 'governance',
        isSourceBranch: false,
      }),
    ).toEqual({ action: 'create', reason: 'governance-missing' });
  });

  it('复读最终集成Ref并要求与main完全一致', () => {
    expect(assertSynchronizedIntegrationRef({ object: { sha: sha('a') } }, sha('a'))).toBe(
      sha('a'),
    );
    const governanceRef = assertSynchronizedIntegrationRef(
      { object: { sha: sha('a') } },
      sha('a'),
      'governance',
    );
    expect(governanceRef).toBe(sha('a'));
    expect(() =>
      assertSynchronizedIntegrationRef({ object: { sha: sha('b') } }, sha('a')),
    ).toThrow('postcondition failed');
  });
});

describe('集成分支同步请求来源', () => {
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
