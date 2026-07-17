import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, it } from 'vitest';

const targets = [
  'apps/desktop/preload/src/index.ts',
  'apps/desktop/renderer/src/global.d.ts',
  'packages/core-service/src/candidate-apply-diff.ts',
  'packages/core-service/src/candidate-apply-plan-core.ts',
  'tests/integration/m2-03-contract-patch-output.test.ts',
  'tests/integration/m2-03-core-plan-output.test.ts',
  'tests/integration/m2-03-format-output.test.ts',
  'tests/integration/m2-03-lockfile-output.test.ts',
] as const;

describe('M2-03 final format snapshots', () => {
  it.each(targets)('emits repository formatting for %s', async (path) => {
    const source = await readFile(path, 'utf8');
    const config = (await resolveConfig(path)) ?? {};
    const output = await format(source, { ...config, filepath: path });
    console.log(`M203_FINAL_FORMAT:${path}:${Buffer.from(output, 'utf8').toString('base64')}`);
  });
});
