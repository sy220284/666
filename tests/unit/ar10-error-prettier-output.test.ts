import { readFile } from 'node:fs/promises';

import prettier from 'prettier';
import { describe, it } from 'vitest';

describe('AR-10 rejection matrix formatter output', () => {
  it('prints the repository-formatted rejection coverage test', async () => {
    const file = 'tests/unit/ar10-main-ipc-error-coverage.test.ts';
    const source = await readFile(file, 'utf8');
    const config = (await prettier.resolveConfig(file)) ?? {};
    const formatted = await prettier.format(source, {
      ...config,
      filepath: file,
    });
    console.log('===AR10_ERROR_FORMATTED_BEGIN===');
    console.log(formatted);
    console.log('===AR10_ERROR_FORMATTED_END===');
    throw new Error('AR10_ERROR_FORMATTED_OUTPUT_READY');
  });
});
