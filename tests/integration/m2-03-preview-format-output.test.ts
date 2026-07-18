import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M2-03 Candidate action source format', () => {
  it('keeps Candidate action sources repository-formatted', async () => {
    for (const path of [
      'apps/desktop/renderer/src/candidate-apply-ui.ts',
      'tests/integration/candidate-apply-fixture.ts',
      'tests/integration/candidate-apply-transaction.test.ts',
    ]) {
      const source = await readFile(path, 'utf8');
      const output = await format(source, {
        filepath: path,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
      });
      expect(output).toBe(source);
    }
  });
});
