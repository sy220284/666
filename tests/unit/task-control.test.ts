import { describe, expect, it } from 'vitest';

import { mainVerificationDispatchBody } from '../../scripts/automerge.mjs';
import {
  dependenciesSatisfied,
  extractBacktickBullets,
  findNextReadyTask,
  isGovernanceOnlyPullRequest,
  isPathInside,
  parseTaskIndex,
  replaceTaskCardStatus,
  replaceTaskIndexStatus,
  stageClosureErrors,
  taskBranchFor,
  validateChangedPaths,
  verificationForTask,
} from '../../scripts/task-control-lib.mjs';
import { validateMainVerification } from '../../scripts/main-verification.mjs';

const indexFixture = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | In Progress |
| M0-02 | [Electron](M0/M0-02_ELECTRON_CORE_LIFECYCLE.md) | M0-01 | Planned |
`;

describe('Schema 2共享任务控制', () => {
  it('解析任务索引并规范任务卡状态', () => {
    const tasks = parseTaskIndex(indexFixture);
    expect(tasks.get('M0-01')).toMatchObject({
      source: 'docs/tasks/M0/M0-01_MONOREPO_QUALITY_CI.md',
      status: 'In Progress',
    });
    expect(replaceTaskCardStatus('> 状态：Planned\n', 'Planned', 'In Progress')).toBe(
      '> 状态：In Progress  \n',
    );
  });

  it('使用目录边界校验允许路径和禁止路径', () => {
    expect(isPathInside('packages/domain/src/index.ts', 'packages/')).toBe(true);
    expect(isPathInside('package-lock.json', 'package.json')).toBe(false);
    expect(
      validateChangedPaths(
        ['packages/domain/src/index.ts', 'docs/tasks/M1/example.md', 'random.txt'],
        ['packages/'],
        ['docs/tasks/M1/'],
      ),
    ).toEqual([
      'docs/tasks/M1/example.md: forbidden by active task',
      'random.txt: outside active task allowed paths',
    ]);
  });

  it('只在唯一work分支识别治理范围', () => {
    const files = ['scripts/main-verification.mjs', 'tests/unit/task-control.test.ts'];
    expect(isGovernanceOnlyPullRequest('work', files)).toBe(true);
    expect(isGovernanceOnlyPullRequest('policy/governance', files)).toBe(false);
    expect(
      isGovernanceOnlyPullRequest('work', [...files, 'apps/desktop/renderer/src/main.tsx']),
    ).toBe(false);
  });

  it('所有任务统一返回work分支', () => {
    expect(taskBranchFor()).toBe('work');
  });

  it('提取任务卡路径并按依赖推进', () => {
    const card = `## 必读文档\n\n- \`AGENTS.md\`\n\n## 主要影响范围\n\n- \`apps/\`\n- \`packages/\`\n`;
    expect(extractBacktickBullets(card, '必读文档')).toEqual(['AGENTS.md']);
    expect(extractBacktickBullets(card, '主要影响范围')).toEqual(['apps/', 'packages/']);

    const pending = parseTaskIndex(indexFixture);
    expect(dependenciesSatisfied(pending.get('M0-02')!, pending)).toBe(false);

    const verified = parseTaskIndex(indexFixture.replace('In Progress', 'Verified'));
    expect(dependenciesSatisfied(verified.get('M0-02')!, verified)).toBe(true);
    expect(findNextReadyTask(verified)?.id).toBe('M0-02');
  });

  it('阶段切换要求上一阶段全部Verified', () => {
    const tasks = parseTaskIndex(`
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M3-01 | [一](M3/M3-01.md) | M2 | Implemented |
| M3-10 | [十](M3/M3-10.md) | M3-09 | Implemented |
| M4-01 | [四](M4/M4-01.md) | M3 | Planned |
`);
    expect(
      stageClosureErrors(tasks.get('M4-01')!, tasks, {
        deferredVerification: [{ id: 'M3-01' }],
      }),
    ).toEqual(
      expect.arrayContaining([
        'M3-01 must be Verified before M4-01 activation',
        'M3-10 must be Verified before M4-01 activation',
        'M3 deferredVerification must be empty before M4-01: M3-01',
      ]),
    );
  });

  it('更新任务索引并生成风险相关验证命令', () => {
    expect(replaceTaskIndexStatus(indexFixture, 'M0-01', 'Verified')).toContain(
      '| M0-01 | [Monorepo](M0/M0-01_MONOREPO_QUALITY_CI.md) | 无 | Verified |',
    );
    expect(verificationForTask('涉及SQLite、IPC与性能')).toEqual(
      expect.arrayContaining([
        'pnpm test:migration',
        'pnpm test:integration',
        'pnpm test:security',
        'pnpm test:e2e',
        'pnpm test:perf',
      ]),
    );
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

  it('接受已合并的work来源与成功永久检查', () => {
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
          head: { ref: 'work', sha: sourceHeadSha },
          merge_commit_sha: expectedSha,
        },
        requiredChecks,
        checkRuns,
      }),
    ).not.toThrow();
  });

  it('拒绝任务专属来源分支', () => {
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
          head: { ref: 'work/task', sha: sourceHeadSha },
          merge_commit_sha: expectedSha,
        },
        requiredChecks,
        checkRuns,
      }),
    ).toThrow('must originate from work');
  });
});
