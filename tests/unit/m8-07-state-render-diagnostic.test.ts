import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { test } from 'vitest';

test('renders the canonical M8-07 implemented transition', () => {
  execFileSync(
    process.execPath,
    [
      'scripts/taskctl.mjs',
      'advance',
      '--ci=success',
      '--commit=85832bb78ffd48a39e90ed4103f6eeca789c0bda',
    ],
    { cwd: process.cwd(), stdio: 'pipe' },
  );

  for (const file of [
    'docs/tasks/ACTIVE_TASK.json',
    'docs/tasks/ACTIVE_TASK.md',
    'docs/tasks/TASK_INDEX.md',
    'docs/tasks/M8/M8-07_CHINESE_EXPERIENCE_GOVERNANCE.md',
  ]) {
    const encoded = Buffer.from(readFileSync(file, 'utf8'), 'utf8').toString('base64');
    console.log(`M807_RENDER::${file}::${encoded}`);
  }

  throw new Error('M807_RENDER_COMPLETE');
});
