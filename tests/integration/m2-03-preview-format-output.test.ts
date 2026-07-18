import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('M2-03 Candidate action format output', () => {
  it('emits exact Candidate action source formatting', async () => {
    for (const [label, path] of [
      ['UI', 'apps/desktop/renderer/src/candidate-apply-ui.ts'],
      ['FIXTURE', 'tests/integration/candidate-apply-fixture.ts'],
      ['TRANSACTION', 'tests/integration/candidate-apply-transaction.test.ts'],
    ] as const) {
      const source = await readFile(path, 'utf8');
      const output = await format(source, {
        filepath: path,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
      });
      console.log(`M203_CANDIDATE_ACTION_${label}_BASE64=${Buffer.from(output).toString('base64')}`);
    }
  });
});
