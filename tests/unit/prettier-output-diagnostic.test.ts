import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'apps/desktop/main/src/credential-broker.ts',
  'apps/desktop/main/src/provider-ipc-handlers.ts',
  'packages/core-service/src/provider-adapter-runtime.ts',
  'packages/core-service/src/search-index-hardening.ts',
  'tests/integration/m4-search-constraint-hardening.test.ts',
] as const;

const outputRoot = 'test-results/unit/prettier-output';

describe('temporary Prettier output diagnostic', () => {
  it('materializes exact Prettier 3.9.5 output for audited files', async () => {
    await mkdir(outputRoot, { recursive: true });
    const manifest: Record<string, string> = {};
    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const formatted = await format(source, {
        filepath: file,
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'all',
      });
      const outputName = `${file.replaceAll('/', '__')}.txt`;
      await writeFile(path.join(outputRoot, outputName), formatted, 'utf8');
      manifest[file] = outputName;
    }
    await writeFile(
      path.join(outputRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    expect.fail('PRETTIER_OUTPUT_READY');
  });
});
