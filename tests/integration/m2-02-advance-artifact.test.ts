import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const implementationCommit = '5f6b05f3193f57dec5ed63ea4a6f8fd1099ab2d7';
const generatedFiles = [
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md',
  'docs/tasks/M2/M2-03_DIFF_APPLY_CONFLICT_UNDO.md',
] as const;

describe('M2-02 to M2-03 task transition artifact', () => {
  it('runs taskctl advance in an isolated git worktree and exports the generated state', async () => {
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'worldforge-m2-02-advance-'));
    const worktree = path.join(temporaryRoot, 'repository');
    try {
      execFileSync('git', ['worktree', 'add', '--detach', worktree, 'HEAD'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });
      execFileSync(
        process.execPath,
        ['scripts/taskctl.mjs', 'advance', '--ci=success', `--commit=${implementationCommit}`],
        { cwd: worktree, stdio: 'pipe' },
      );

      for (const file of generatedFiles) {
        const target = path.join('test-results/integration/m2-02-advance', file);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(path.join(worktree, file), target);
      }

      const active = JSON.parse(
        await readFile(
          path.join(worktree, 'docs/tasks/ACTIVE_TASK.json'),
          'utf8',
        ),
      ) as { readonly activeTask: { readonly id: string; readonly branch: string } };
      expect(active.activeTask).toEqual(
        expect.objectContaining({
          id: 'M2-03',
          branch: 'work/m2-03-diff-apply-conflict-undo',
        }),
      );
    } finally {
      try {
        execFileSync('git', ['worktree', 'remove', '--force', worktree], {
          cwd: process.cwd(),
          stdio: 'pipe',
        });
      } catch {
        // The worktree may not have been created if setup failed.
      }
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
