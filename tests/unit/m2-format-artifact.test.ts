import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const changedFiles = [
  'packages/contracts/src/draft.ts',
  'packages/core-service/src/draft.ts',
  'packages/editor-core/src/draft-document.ts',
  'packages/editor-core/src/draft-patch.ts',
  'tests/integration/draft-lock-guard.test.ts',
  'tests/unit/editor-lock-patch.test.ts',
  'tests/unit/m2-format-artifact.test.ts',
] as const;

const repositoryFormat = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

describe('M2-01 formatting diagnostics', () => {
  it('emits the repository Prettier result for changed files', async () => {
    for (const file of changedFiles) {
      const formatted = await prettier.format(await readFile(file, 'utf8'), {
        filepath: file,
        ...repositoryFormat,
      });
      const output = path.join('test-results/unit/m2-formatted', file);
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, formatted, 'utf8');
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});
