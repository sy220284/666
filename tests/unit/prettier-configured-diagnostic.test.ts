import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'apps/desktop/renderer/src/runtime/capability-matrix.ts',
  'apps/desktop/renderer/src/runtime/capability-runtime.ts',
  'packages/editor-core/src/persisted-metadata-sync.ts',
  'tests/unit/editor-persisted-metadata-sync.test.ts',
] as const;

describe('temporary configured Prettier diagnostic', () => {
  it('exports exact formatted files using the repository configuration', async () => {
    const outputDirectory = 'test-results/unit/prettier-configured';
    await mkdir(outputDirectory, { recursive: true });
    const differences: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const config = (await resolveConfig(file)) ?? {};
      const formatted = await format(source, { ...config, filepath: file });
      await writeFile(path.join(outputDirectory, path.basename(file)), formatted, 'utf8');
      if (source !== formatted) differences.push(file);
    }
    expect(differences).toEqual([]);
  });
});
