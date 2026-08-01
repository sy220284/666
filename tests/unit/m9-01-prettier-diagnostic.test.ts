import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M9-01 Prettier diagnostic', () => {
  it('prints the configured formatter output for the two new source files', async () => {
    const scriptPath = 'scripts/check-source-structure.mjs';
    const testPath = 'tests/unit/source-structure-policy.test.ts';
    const [script, test, scriptConfig, testConfig] = await Promise.all([
      readFile(scriptPath, 'utf8'),
      readFile(testPath, 'utf8'),
      resolveConfig(scriptPath),
      resolveConfig(testPath),
    ]);

    console.log('M9_FORMAT_CONFIG', scriptConfig, testConfig);
    console.log('M9_FORMATTED_SCRIPT_START');
    console.log(
      await format(script, {
        ...scriptConfig,
        filepath: scriptPath,
        parser: 'babel',
      }),
    );
    console.log('M9_FORMATTED_SCRIPT_END');
    console.log('M9_FORMATTED_TEST_START');
    console.log(
      await format(test, {
        ...testConfig,
        filepath: testPath,
        parser: 'typescript',
      }),
    );
    console.log('M9_FORMATTED_TEST_END');

    expect(script.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
  });
});
