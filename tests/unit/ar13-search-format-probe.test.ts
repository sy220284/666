import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const targets = [
  'packages/core-service/src/search/replace-preview.ts',
  'tests/unit/ar13-search-candidate.test.ts',
] as const;

describe('AR-13 Search format probe', () => {
  it('exports the exact Prettier-normalized Search checkpoint files', async () => {
    const repositoryRoot = process.cwd();
    const outputRoot = path.join(repositoryRoot, 'test-results', 'unit', 'ar13-search-format');
    expect(targets).toHaveLength(2);
    for (const relativePath of targets) {
      const sourcePath = path.join(repositoryRoot, relativePath);
      const outputPath = path.join(outputRoot, relativePath);
      const formatted = await format(await readFile(sourcePath, 'utf8'), {
        ...((await resolveConfig(sourcePath)) ?? {}),
        filepath: sourcePath,
      });
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, formatted, 'utf8');
    }
    throw new Error('AR-13_SEARCH_FORMAT_READY');
  });
});
