import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('M2-03 Preview source format output', () => {
  it('emits exact Renderer bootstrap and Electron E2E formatting', async () => {
    for (const [label, path] of [
      ['BOOTSTRAP', 'apps/desktop/renderer/src/candidate-preview-bootstrap.ts'],
      ['E2E', 'tests/e2e/candidate-preview.spec.ts'],
    ] as const) {
      const source = await readFile(path, 'utf8');
      const output = await format(source, {
        filepath: path,
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
      });
      console.log(`M203_PREVIEW_${label}_BASE64=${Buffer.from(output).toString('base64')}`);
    }
  });
});
