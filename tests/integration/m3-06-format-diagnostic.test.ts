import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.join(process.cwd(), 'packages/contracts/src/state-proposal.ts');
const outputPath = path.join(
  process.cwd(),
  'test-results/integration/state-proposal.formatted.ts',
);

describe('M3-06 locked formatter diagnostic', () => {
  it('emits the exact repository-formatted contract and stops the temporary run', async () => {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readFile(sourcePath));
    const result = spawnSync('pnpm', ['exec', 'prettier', '--write', outputPath], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error(`Formatter failed:\n${result.stdout}\n${result.stderr}`);
    }
    expect.fail('Formatted contract emitted for one-shot retrieval.');
  });
});
