import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.join(process.cwd(), 'packages/contracts/src/state-proposal.ts');
const outputDirectory = path.join(process.cwd(), 'test-results/integration');
const originalPath = path.join(outputDirectory, 'state-proposal.original.ts');
const formattedPath = path.join(outputDirectory, 'state-proposal.formatted.ts');
const diffPath = path.join(outputDirectory, 'state-proposal-format.diff');

describe('M3-06 locked formatter diagnostic', () => {
  it('emits the exact formatter diff and stops the temporary run', async () => {
    await mkdir(outputDirectory, { recursive: true });
    const source = await readFile(sourcePath);
    await Promise.all([writeFile(originalPath, source), writeFile(formattedPath, source)]);
    const format = spawnSync('pnpm', ['exec', 'prettier', '--write', formattedPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    if (format.status !== 0) {
      throw new Error(`Formatter failed:\n${format.stdout}\n${format.stderr}`);
    }
    const difference = spawnSync('diff', ['-u', originalPath, formattedPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    await writeFile(diffPath, difference.stdout);
    expect.fail('Formatter diff emitted for one-shot retrieval.');
  });
});
