import { describe, expect, it } from 'vitest';

import {
  renderCompatibilityMirror,
  validateSingleWorkState,
} from '../../.github/governance/single-work-taskctl.mjs';

describe('Schema 2本地任务控制', () => {
  const authorization = {
    schemaVersion: 2,
    mode: 'single-work-pr',
    baseBranch: 'main',
    workBranch: 'work',
    allowDirectMainCommits: false,
    allowAdditionalBranches: false,
    maxOpenWorkPullRequests: 1,
  };
  const activeState = {
    authorization: { mode: 'implementation-pr' },
    activeTask: {
      id: 'M8-09',
      status: 'VERIFIED_HOLD',
      source: 'docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md',
      branch: 'work',
      executionBranch: 'work',
    },
  };

  it('接受Schema 2授权和work兼容锚点', () => {
    expect(validateSingleWorkState(authorization, activeState)).toEqual([]);
  });

  it('拒绝任务专属分支', () => {
    expect(
      validateSingleWorkState(authorization, {
        ...activeState,
        activeTask: { ...activeState.activeTask, branch: 'work/m8-09' },
      }),
    ).not.toEqual([]);
  });

  it('生成标明全局与兼容模式的镜像', () => {
    const mirror = renderCompatibilityMirror(authorization, activeState);
    expect(mirror).toContain('全局授权模式：`single-work-pr`');
    expect(mirror).toContain('兼容状态机模式：`implementation-pr`');
    expect(mirror).toContain('Work Synchronization受控重置work到main');
  });
});
