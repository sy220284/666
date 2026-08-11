import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  effectiveTaskStatus,
  hasSuccessfulCommitStatus,
  isMainEffectivelyVerified,
  isRuntimeEffectivelyVerified,
  mergeCurrentAndHistoricalTaskStatuses,
  resolveRuntimeMergeCommit,
} from '../../.github/governance/effective-task-status.mjs';

const temporaryDirectories: string[] = [];

function git(root: string, ...argumentsList: string[]): string {
  return execFileSync('git', argumentsList, { cwd: root, encoding: 'utf8' }).trim();
}

async function historyFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'worldforge-task-history-'));
  temporaryDirectories.push(root);
  git(root, 'init');
  git(root, 'config', 'user.email', 'ci@example.invalid');
  git(root, 'config', 'user.name', 'CI Fixture');
  await writeFile(path.join(root, 'state.txt'), 'base\n');
  git(root, 'add', 'state.txt');
  git(root, 'commit', '-m', 'base');
  await writeFile(path.join(root, 'state.txt'), 'm10-04\n');
  git(root, 'add', 'state.txt');
  git(root, 'commit', '-m', '治理：兼容面收敛 (#312)');
  const m1004 = git(root, 'rev-parse', 'HEAD');
  await writeFile(path.join(root, 'state.txt'), 'm10-05\n');
  git(root, 'add', 'state.txt');
  git(root, 'commit', '-m', '治理：闭环一致性 (#313)');
  await writeFile(path.join(root, 'state.txt'), 'm11-01\n');
  git(root, 'add', 'state.txt');
  git(root, 'commit', '-m', 'Merge pull request #346 from sy220284/work');
  const m1101 = git(root, 'rev-parse', 'HEAD');
  return { root, m1004, m1101, head: m1101 };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('任务有效状态计算', () => {
  it('冻结Schema 1历史静态Verified保持有效', () => {
    expect(isRuntimeEffectivelyVerified({ schemaVersion: 1, status: 'VERIFIED' }, [])).toBe(true);
    expect(isRuntimeEffectivelyVerified(null, [], 'Verified')).toBe(true);
  });

  it('Schema 2 Implemented通过任务提交状态后视为有效Verified', () => {
    const task = {
      schemaVersion: 2,
      status: 'IMPLEMENTED',
      verificationBinding: { taskContext: 'task-verification/M10-03' },
    };
    const statuses = [{ context: 'task-verification/M10-03', state: 'success' }];
    expect(isRuntimeEffectivelyVerified(task, statuses)).toBe(true);
    expect(effectiveTaskStatus(task, statuses, 'Implemented')).toBe('VERIFIED');
  });

  it('Schema 2拒绝缺失、失败或错误上下文', () => {
    const task = {
      schemaVersion: 2,
      status: 'IMPLEMENTED',
      verificationBinding: { taskContext: 'task-verification/M10-03' },
    };
    expect(isRuntimeEffectivelyVerified(task, [])).toBe(false);
    expect(
      isRuntimeEffectivelyVerified(task, [
        { context: 'task-verification/M10-03', state: 'failure' },
      ]),
    ).toBe(false);
    expect(
      isRuntimeEffectivelyVerified(task, [
        { context: 'task-verification/M10-04', state: 'success' },
      ]),
    ).toBe(false);
  });

  it('只继承历史任务Context，不继承旧主线Context', () => {
    const statuses = mergeCurrentAndHistoricalTaskStatuses(
      [{ context: 'main-verification', state: 'failure' }],
      [
        { context: 'main-verification', state: 'success' },
        { context: 'task-verification/M10-04', state: 'success' },
      ],
    );
    expect(hasSuccessfulCommitStatus(statuses, 'task-verification/M10-04')).toBe(true);
    expect(isMainEffectivelyVerified(statuses)).toBe(false);
  });

  it('优先从当前祖先链解析Runtime来源PR的受控收口提交', async () => {
    const fixture = await historyFixture();
    const task = {
      id: 'M10-04',
      verificationBinding: { sourcePr: 312, taskContext: 'task-verification/M10-04' },
    };
    expect(resolveRuntimeMergeCommit(task, fixture.head, fixture.root)).toBe(fixture.m1004);
    expect(() =>
      resolveRuntimeMergeCommit(
        { ...task, verificationBinding: { ...task.verificationBinding, sourcePr: 999 } },
        fixture.head,
        fixture.root,
      ),
    ).toThrow('exactly one controlled main commit');
  });

  it('受控收口格式不存在时精确继承唯一的GitHub标准merge commit', async () => {
    const fixture = await historyFixture();
    const task = {
      id: 'M11-01',
      verificationBinding: { sourcePr: 346, taskContext: 'task-verification/M11-01' },
    };
    expect(resolveRuntimeMergeCommit(task, fixture.head, fixture.root)).toBe(fixture.m1101);

    await writeFile(path.join(fixture.root, 'state.txt'), 'duplicate merge\n');
    git(fixture.root, 'add', 'state.txt');
    git(fixture.root, 'commit', '-m', 'Merge pull request #346 from fixture/work');
    const ambiguousHead = git(fixture.root, 'rev-parse', 'HEAD');
    expect(() => resolveRuntimeMergeCommit(task, ambiguousHead, fixture.root)).toThrow(
      'exactly one controlled main commit',
    );
  });

  it('统一判断当前主线验证Context', () => {
    const statuses = [{ context: 'main-verification', state: 'success' }];
    expect(hasSuccessfulCommitStatus(statuses, 'main-verification')).toBe(true);
    expect(isMainEffectivelyVerified(statuses)).toBe(true);
    expect(isMainEffectivelyVerified([])).toBe(false);
  });
});
