import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('M2-03 Preview format output', () => {
  it('emits repository-formatted Preview contract and IPC files', async () => {
    for (const [label, path] of [
      ['CONTRACT', 'packages/contracts/src/candidate-preview-core.ts'],
      ['IPC', 'apps/desktop/main/src/candidate-preview-ipc.ts'],
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
