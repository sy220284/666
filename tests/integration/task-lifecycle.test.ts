import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { renderCompatibilityMirror } from '../../.github/governance/single-work-taskctl.mjs';

const temporaryDirectories: string[] = [];
const taskctlPath = path.resolve('scripts/taskctl.mjs');

const authorization = {
  schemaVersion: 2,
  mode: 'single-work-pr',
  baseBranch: 'main',
  workBranch: 'work',
  allowDirectMainCommits: false,
  allowAdditionalBranches: false,
  maxOpenWorkPullRequests: 1,
  mainWriteMode: 'serialized',
  mergeMethod: 'squash',
  verificationClosure: 'main-status',
  workSynchronization: 'verified-reset',
  taskRuntimeDirectory: 'docs/tasks/runtime',
  prTaskMarker: 'worldforge-task',
};

const activeState = {
  schemaVersion: 1,
  authorization: {
    mode: 'implementation-pr',
    compatibilityOnly: true,
    supersededBy: 'docs/tasks/TASK_AUTHORIZATION.json',
    executionModel: 'single-work-pr',
    workBranch: 'work',
    branch: 'main',
    allowDirectMainCommits: false,
  },
  activeTask: {
    id: 'M8-09',
    status: 'VERIFIED_HOLD',
    source: 'docs/tasks/M8/M8-09_V1_STABILITY_HARDENING.md',
    branch: 'work',
    executionBranch: 'work',
  },
};

async function createFixture({ staleMirror = false, branch = 'work' } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'worldforge-schema2-task-'));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'docs/tasks'), { recursive: true });
  const state = {
    ...activeState,
    activeTask: {
      ...activeState.activeTask,
      branch,
      executionBranch: branch,
    },
  };
  await Promise.all([
    writeFile(
      path.join(root, 'docs/tasks/TASK_AUTHORIZATION.json'),
      `${JSON.stringify(authorization, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(root, 'docs/tasks/ACTIVE_TASK.json'),
      `${JSON.stringify(state, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(root, 'docs/tasks/ACTIVE_TASK.md'),
      staleMirror ? '# stale\n' : renderCompatibilityMirror(authorization, state),
      'utf8',
    ),
  ]);
  return { root, state };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe('Schema 2 task lifecycle', () => {
  it('validates the unique work authorization and compatibility mirror', async () => {
    const { root } = await createFixture();
    const output = execFileSync(process.execPath, [taskctlPath, 'status'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toContain('Single work task state and compatibility mirror are valid.');
    expect(output).toContain('"mode": "single-work-pr"');
    expect(output).toContain('"workBranch": "work"');
    expect(output).toContain('"activeStatus": "VERIFIED_HOLD"');
  });

  it('repairs a stale compatibility mirror through the Schema 2 sync command', async () => {
    const { root, state } = await createFixture({ staleMirror: true });
    expect(() =>
      execFileSync(process.execPath, [taskctlPath, 'validate'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).toThrow();

    execFileSync(process.execPath, [taskctlPath, 'sync'], { cwd: root });
    const mirror = await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), 'utf8');
    expect(mirror).toBe(renderCompatibilityMirror(authorization, state));
    expect(() =>
      execFileSync(process.execPath, [taskctlPath, 'validate'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it.each(['activate', 'advance', 'close', 'close-deferred', 'reopen'])(
    'rejects the retired %s mutation and preserves state files',
    async (command) => {
      const { root } = await createFixture();
      const activeBefore = await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8');
      const mirrorBefore = await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), 'utf8');

      expect(() =>
        execFileSync(process.execPath, [taskctlPath, command], {
          cwd: root,
          stdio: 'pipe',
        }),
      ).toThrow();

      expect(await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.json'), 'utf8')).toBe(
        activeBefore,
      );
      expect(await readFile(path.join(root, 'docs/tasks/ACTIVE_TASK.md'), 'utf8')).toBe(
        mirrorBefore,
      );
    },
  );

  it('rejects a task-specific compatibility branch', async () => {
    const { root } = await createFixture({ branch: 'work/m8-09' });
    expect(() =>
      execFileSync(process.execPath, [taskctlPath, 'validate'], {
        cwd: root,
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});
