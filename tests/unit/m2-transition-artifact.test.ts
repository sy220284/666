import { execFileSync } from 'node:child_process';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const implementationCommit = '08fb04a1c228bae96de712f52a09b0e89ac6fbfb';
const transitionFiles = [
  'docs/tasks/ACTIVE_TASK.json',
  'docs/tasks/ACTIVE_TASK.md',
  'docs/tasks/TASK_INDEX.md',
  'docs/tasks/M2/M2-01_LOCK_GUARD.md',
  'docs/tasks/M2/M2-02_CANDIDATE_VERSION_MODEL.md',
] as const;

describe('M2 implementation task transition', () => {
  it('uses taskctl to record M2-01 and activate M2-02', async () => {
    const output = execFileSync(
      process.execPath,
      ['scripts/taskctl.mjs', 'advance', '--ci=success', `--commit=${implementationCommit}`],
      { encoding: 'utf8' },
    );
    expect(output).toContain('Recorded M2-01 as Implemented');
    expect(output).toContain('advanced to M2-02');

    for (const file of transitionFiles) {
      const target = path.join('test-results/unit/m2-transition', file);
      await mkdir(path.dirname(target), { recursive: true });
      await copyFile(file, target);
    }
  });
});
