import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { renderActiveTask } from '../../scripts/task-control-lib.mjs';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('continuous task lifecycle', () => {
  it('closes an implemented task and activates the next dependency-ready task', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-task-'));
    temporaryDirectories.push(root);
    await Promise.all([
      mkdir(path.join(root, 'docs/tasks/M0'), { recursive: true }),
      mkdir(path.join(root, 'docs/test-evidence/M0-01'), { recursive: true }),
    ]);

    const state = {
      schemaVersion: 1,
      authorization: { mode: 'continuous-mainline', branch: 'main' },
      activeTask: {
        id: 'M0-01',
        status: 'IMPLEMENTED',
        source: 'docs/tasks/M0/M0-01.md',
        branch: 'main',
        startedAt: '2026-07-15',
        allowedPaths: ['scripts/'],
        forbiddenPaths: [],
        requiredDocs: [],
        verification: ['pnpm test'],
      },
    };
    const index = `| ID | 任务卡 | 依赖 | 状态 |\n|---|---|---|---|\n| M0-01 | [基础](M0/M0-01.md) | 无 | Implemented |\n| M0-02 | [运行时](M0/M0-02.md) | M0-01 | Planned |\n`;
    const currentCard = '# M0-01\n\n> 状态：Implemented（等待CI）\n';
    const nextCard =
      '# M0-02\n\n> 状态：Planned  \n\n## 必读文档\n\n- `AGENTS.md`\n\n## 主要影响范围\n\n- `apps/desktop/main/`\n';

    await Promise.all([
      writeFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), JSON.stringify(state), 'utf8'),
      writeFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), renderActiveTask(state), 'utf8'),
      writeFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), index, 'utf8'),
      writeFile(path.join(root, 'docs/tasks/M0/M0-01.md'), currentCard, 'utf8'),
      writeFile(path.join(root, 'docs/tasks/M0/M0-02.md'), nextCard, 'utf8'),
      writeFile(path.join(root, 'AGENTS.md'), '# fixture', 'utf8'),
      writeFile(path.join(root, 'docs/test-evidence/M0-01/summary.md'), '# pass', 'utf8'),
      writeFile(path.join(root, 'docs/test-evidence/M0-01/commands.txt'), 'exit 0', 'utf8'),
      writeFile(path.join(root, 'docs/test-evidence/M0-01/known-risks.md'), '# none', 'utf8'),
    ]);

    execFileSync(
      process.execPath,
      [path.resolve('scripts/taskctl.mjs'), 'close', '--ci=success', '--commit=abcdef1'],
      { cwd: root },
    );

    const updatedState = JSON.parse(
      await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8'),
    );
    const updatedIndex = await readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8');
    expect(updatedState.lastVerifiedTask).toMatchObject({ id: 'M0-01', commit: 'abcdef1' });
    expect(updatedState.activeTask).toMatchObject({ id: 'M0-02', status: 'IN_PROGRESS' });
    expect(updatedIndex).toContain('| M0-01 | [基础](M0/M0-01.md) | 无 | Verified |');
    expect(updatedIndex).toContain('| M0-02 | [运行时](M0/M0-02.md) | M0-01 | In Progress |');
  });
});

describe('implementation-first task lifecycle', () => {
  it('records deferred verification and advances after code and CI complete', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-implementation-task-'));
    temporaryDirectories.push(root);
    await mkdir(path.join(root, 'docs/tasks/M1'), { recursive: true });

    const state = {
      schemaVersion: 1,
      authorization: {
        mode: 'implementation-mainline',
        branch: 'main',
        deferVerificationUntilBatch: true,
      },
      activeTask: {
        id: 'M1-01',
        status: 'IN_PROGRESS',
        source: 'docs/tasks/M1/M1-01.md',
        branch: 'main',
        startedAt: '2026-07-16',
        allowedPaths: ['packages/core-service/'],
        forbiddenPaths: [],
        requiredDocs: [],
        verification: ['pnpm test'],
      },
      deferredVerification: [],
    };
    const index = `| ID | 任务卡 | 依赖 | 状态 |\n|---|---|---|---|\n| M1-01 | [设置](M1/M1-01.md) | M0 | In Progress |\n| M1-02 | [项目](M1/M1-02.md) | M1-01 | Planned |\n`;
    const currentCard = '# M1-01\n\n> 状态：In Progress  \n';
    const nextCard =
      '# M1-02\n\n> 状态：Planned  \n\n## 必读文档\n\n- `AGENTS.md`\n\n## 主要影响范围\n\n- `packages/core-service/`\n';

    await Promise.all([
      writeFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), JSON.stringify(state), 'utf8'),
      writeFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), renderActiveTask(state), 'utf8'),
      writeFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), index, 'utf8'),
      writeFile(path.join(root, 'docs/tasks/M1/M1-01.md'), currentCard, 'utf8'),
      writeFile(path.join(root, 'docs/tasks/M1/M1-02.md'), nextCard, 'utf8'),
      writeFile(path.join(root, 'AGENTS.md'), '# fixture', 'utf8'),
    ]);

    execFileSync(
      process.execPath,
      [path.resolve('scripts/taskctl.mjs'), 'advance', '--ci=success', '--commit=abcdef1'],
      { cwd: root },
    );

    const updatedState = JSON.parse(
      await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8'),
    );
    const updatedIndex = await readFile(path.join(root, 'docs/tasks/TASK_INDEX.md'), 'utf8');
    const updatedCard = await readFile(path.join(root, 'docs/tasks/M1/M1-01.md'), 'utf8');
    expect(updatedState.lastImplementedTask).toMatchObject({ id: 'M1-01', commit: 'abcdef1' });
    expect(updatedState.deferredVerification).toEqual([
      expect.objectContaining({ id: 'M1-01', implementationCommit: 'abcdef1' }),
    ]);
    expect(updatedState.activeTask).toMatchObject({ id: 'M1-02', status: 'IN_PROGRESS' });
    expect(updatedState.activeTask.allowedPaths).toContain('docs/tasks/M1/M1-01.md');
    expect(updatedIndex).toContain('| M1-01 | [设置](M1/M1-01.md) | M0 | Implemented |');
    expect(updatedIndex).toContain('| M1-02 | [项目](M1/M1-02.md) | M1-01 | In Progress |');
    expect(updatedCard).toContain('> 状态：Implemented  ');
  });
});
