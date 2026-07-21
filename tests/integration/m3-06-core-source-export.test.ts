import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const sourcePath = path.join(process.cwd(), 'packages/core-service/src/state-proposal.ts');
const outputPath = path.join(
  process.cwd(),
  'test-results/integration/state-proposal.core-source.ts',
);

describe('M3-06 core source export', () => {
  it('exports the exact Core source and stops the temporary run', async () => {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, await readFile(sourcePath));
    expect.fail('Core source emitted for one-shot repair.');
  });
});
