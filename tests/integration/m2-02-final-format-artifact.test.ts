import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const formatFiles = ['apps/desktop/renderer/src/global.d.ts'] as const;

const repositoryFormat = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

async function emit(file: string, source: string): Promise<void> {
  const formatted = await prettier.format(source, { filepath: file, ...repositoryFormat });
  const output = path.join('test-results/integration/m2-02-final-format', file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, formatted, 'utf8');
}

describe('M2-02 final format artifact', () => {
  it('emits the repository-formatted renderer bridge declaration', async () => {
    for (const file of formatFiles) {
      await emit(file, await readFile(file, 'utf8'));
    }
    expect(formatFiles).toHaveLength(1);
  });
});
