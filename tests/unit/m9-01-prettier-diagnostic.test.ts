import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M9-01 Prettier diagnostic', () => {
  it('prints the repository formatter output for the two new source files', async () => {
    const script = await readFile('scripts/check-source-structure.mjs', 'utf8');
    const test = await readFile('tests/unit/source-structure-policy.test.ts', 'utf8');

    console.log('M9_FORMATTED_SCRIPT_START');
    console.log(await format(script, { parser: 'babel' }));
    console.log('M9_FORMATTED_SCRIPT_END');
    console.log('M9_FORMATTED_TEST_START');
    console.log(await format(test, { parser: 'typescript' }));
    console.log('M9_FORMATTED_TEST_END');

    expect(script.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
  });
});
