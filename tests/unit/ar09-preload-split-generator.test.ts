import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const outputDirectory = path.resolve('test-results/unit/ar09-generated/apps/desktop/preload/src');

describe('AR-09 preload split generator', () => {
  it('exports the generated split for review', () => {
    rmSync(path.resolve('test-results/unit/ar09-generated'), { force: true, recursive: true });
    const result = spawnSync(
      process.execPath,
      ['scripts/ar09-generate-preload-split.mjs', outputDirectory],
      { encoding: 'utf8' },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    throw new Error('AR09_GENERATED_OUTPUT_READY');
  });
});
