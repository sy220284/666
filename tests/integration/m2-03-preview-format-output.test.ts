import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M2-03 Preview source format', () => {
  it('keeps Preview boundary and E2E sources repository-formatted', async () => {
    for (const path of [
      'packages/contracts/src/candidate-preview-core.ts',
      'apps/desktop/main/src/candidate-preview-ipc.ts',
      'apps/desktop/renderer/src/candidate-preview-bootstrap.ts',
      'tests/e2e/candidate-preview.spec.ts',
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
