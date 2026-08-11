import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

const temporaryDirectories: string[] = [];
const taskctlPath = path.resolve('.github/governance/single-work-taskctl.mjs');

const authorization = {
  schemaVersion: 2,
  mode: 'single-work-pr',
  baseBranch: 'main',
  workBranch: 'work',
  governanceBranch: 'governance',
  allowDirectMainCommits: false,
  allowAdditionalBranches: false,
  maxOpenWorkPullRequests: 1,
  maxOpenGovernancePullRequests: 1,
  mainWriteMode: 'serialized',
  mergeMethod: 'squash',
  verificationClosure: 'main-status',
  workSynchronization: 'verified-reset',
  governanceSynchronization: 'verified-reset',
  taskRuntimeDirectory: 'docs/tasks/runtime',
  prTaskMarker: 'worldforge-task',
};

async function createFixture(overrides: Record<string, unknown> = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-schema2-task-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'docs/tasks'), { recursive: true });
  const state = { ...authorization, ...overrides };
  await writeFile(
    path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json'),
    `${JSON.stringify(state, null, 2)}\n`,
    'utf8',
  );
  return { root, state };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Schema 2 task lifecycle', () => {
  it('validates work and governance integration authorization', async () => {
    const { root } = await createFixture();
    const output = execFileSync(process.execPath, [taskctlPath, 'status'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain(
      'Task authorization is valid for work and governance integration lanes.',
    );
    expect(output).toContain('"mode": "single-work-pr"');
    expect(output).toContain('"workBranch": "work"');
    expect(output).toContain('"governanceBranch": "governance"');
    expect(output).toContain('"verificationClosure": "main-status"');
  });

  it.each([
    ['allowAdditionalBranches', true],
    ['mainWriteMode', 'parallel'],
    ['workBranch', 'work/task'],
    ['governanceBranch', 'governance/task'],
  ] as const)('rejects invalid authorization field %s', async (field, value) => {
    const { root } = await createFixture({ [field]: value });
    expect(() =>
      execFileSync(process.execPath, [taskctlPath, 'validate'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).toThrow();
  });

  it.each(['activate', 'advance', 'close', 'close-deferred', 'reopen', 'sync'])(
    'rejects the retired %s command and preserves authorization',
    async (command) => {
      const { root } = await createFixture();
      const before = await readFile(path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8');

      expect(() =>
        execFileSync(process.execPath, [taskctlPath, command], {
          cwd: root,
          stdio: 'pipe',
        }),
      ).toThrow();

      expect(await readFile(path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json'), 'utf8')).toBe(
        before,
      );
    },
  );
});
