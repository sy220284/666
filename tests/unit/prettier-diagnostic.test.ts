import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'apps/desktop/renderer/src/runtime/capability-matrix.ts',
  'apps/desktop/renderer/src/runtime/capability-runtime.ts',
  'tests/unit/capability-matrix.test.ts',
  'tests/unit/capability-runtime-navigation.test.ts',
  'tests/unit/checks-generation-polling.test.ts',
] as const;

describe('temporary Prettier diagnostic', () => {
  it('exports exact formatted files for the current toolchain', async () => {
    const outputDirectory = 'test-results/unit/prettier';
    await mkdir(outputDirectory, { recursive: true });
    const differences: string[] = [];
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const formatted = await format(source, { filepath: file });
      await writeFile(path.join(outputDirectory, path.basename(file)), formatted, 'utf8');
      if (source !== formatted) differences.push(file);
    }
    expect(differences).toEqual([]);
  });
});
