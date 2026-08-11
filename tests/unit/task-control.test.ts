import { describe, expect, it } from 'vitest';

import { mainVerificationDispatchBody } from '../../scripts/automerge.mjs';
import { parseTaskIndex } from '../../scripts/task-control-lib.mjs';
import { validateMainVerification } from '../../scripts/main-verification.mjs';

const indexFixture = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | In Progress |
| M0-02 | [Electron](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Planned |
`;

describe('Schema 2任务索引解析', () => {
  it('解析任务索引并保留依赖与状态', () => {
    const tasks = parseTaskIndex(indexFixture);
    expect(tasks.get('M0-01')).toMatchObject({
      source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
      dependencyText: '无',
      status: 'In Progress',
    });
    expect(tasks.get('M0-02')).toMatchObject({
      dependencyText: 'M0-01',
      status: 'Planned',
    });
  });
});

describe('主分支验证来源', () => {
  const expectedSha = 'a'.repeat(40);
  const sourceHeadSha = 'b'.repeat(40);
  const requiredChecks = ['pr-policy', 'task-governance'];
  const checkRuns = requiredChecks.map((name, index) => ({
    id: index + 1,
    name,
    status: 'completed',
    conclusion: 'success',
    created_at: `2026-08-03T00:0${index}:00Z`,
  }));

  it('生成固定Main Verification调度输入', () => {
    expect(
      mainVerificationDispatchBody(
        { baseBranch: 'main', mainVerificationWorkflow: 'main-verification.yml' },
        expectedSha,
        301,
        sourceHeadSha,
      ),
    ).toEqual({
      ref: 'main',
      inputs: {
        expected_sha: expectedSha,
        source_pr: '301',
        source_head_sha: sourceHeadSha,
      },
    });
  });

  it.each(['work', 'governance'])('接受已合并的%s来源与成功永久检查', (sourceBranch) => {
    expect(() =>
      validateMainVerification({
        repository: 'sy220284/666',
        baseBranch: 'main',
        expectedSha,
        sourcePr: 301,
        sourceHeadSha,
        githubRef: 'refs/heads/main',
        githubSha: expectedSha,
        pull: {
          merged: true,
          merged_at: '2026-08-03T00:00:00Z',
          base: { ref: 'main' },
          head: { ref: sourceBranch, sha: sourceHeadSha },
          merge_commit_sha: expectedSha,
        },
        requiredChecks,
        checkRuns,
      }),
    ).not.toThrow();
  });

  it('拒绝未声明来源分支', () => {
    expect(() =>
      validateMainVerification({
        repository: 'sy220284/666',
        baseBranch: 'main',
        expectedSha,
        sourcePr: 301,
        sourceHeadSha,
        githubRef: 'refs/heads/main',
        githubSha: expectedSha,
        pull: {
          merged: true,
          merged_at: '2026-08-03T00:00:00Z',
          base: { ref: 'main' },
          head: { ref: 'governance/task', sha: sourceHeadSha },
          merge_commit_sha: expectedSha,
        },
        requiredChecks,
        checkRuns,
      }),
    ).toThrow('must originate from work or governance');
  });
});
