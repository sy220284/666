import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputDirectory = path.resolve('test-results/unit/ar09-generated/apps/desktop/preload/src');

describe('AR-09 preload split generator', () => {
  it('exports the formatted generated split for review', () => {
    rmSync(path.resolve('test-results/unit/ar09-generated'), { force: true, recursive: true });
    const generated = spawnSync(
      process.execPath,
      ['scripts/ar09-generate-preload-split.mjs', outputDirectory],
      { encoding: 'utf8' },
    );
    expect(generated.status, `${generated.stdout}\n${generated.stderr}`).toBe(0);

    const formatted = spawnSync('pnpm', ['exec', 'prettier', '--write', outputDirectory], {
      encoding: 'utf8',
    });
    expect(formatted.status, `${formatted.stdout}\n${formatted.stderr}`).toBe(0);
    throw new Error('AR09_FORMATTED_OUTPUT_READY');
  });
});
