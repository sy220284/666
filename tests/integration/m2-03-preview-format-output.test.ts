import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('M2-03 Candidate action format output', () => {
  it('emits exact Candidate action UI formatting', async () => {
    const path = 'apps/desktop/renderer/src/candidate-apply-ui.ts';
    const source = await readFile(path, 'utf8');
    const output = await format(source, {
      filepath: path,
      singleQuote: true,
      trailingComma: 'all',
      printWidth: 100,
    });
    console.log(`M203_CANDIDATE_ACTION_UI_BASE64=${Buffer.from(output).toString('base64')}`);
  });
});
