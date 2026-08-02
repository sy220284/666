import { readFile } from 'node:fs/promises';

import prettier from 'prettier';
import { describe, it } from 'vitest';

describe('AR-10 formatter output', () => {
  it('prints the repository-formatted boundary test', async () => {
    const file = 'tests/unit/ar10-main-ipc-boundaries.test.ts';
    const source = await readFile(file, 'utf8');
    const config = (await prettier.resolveConfig(file)) ?? {};
    const formatted = await prettier.format(source, {
      ...config,
      filepath: file,
    });
    console.log('===AR10_FORMATTED_BEGIN===');
    console.log(formatted);
    console.log('===AR10_FORMATTED_END===');
    throw new Error('AR10_FORMATTED_OUTPUT_READY');
  });
});
