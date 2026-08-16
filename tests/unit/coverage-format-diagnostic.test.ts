import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const targets = [
  'tests/integration/generation-source-resolver-extra-coverage.test.ts',
  'tests/unit/app-shell-m3-coverage.test.ts',
  'tests/unit/app-shell-wrapper-coverage.test.ts',
  'tests/unit/data-tools-workbench-coverage.test.ts',
  'tests/unit/react-entry-coverage.test.ts',
  'tests/unit/search-panel-full-coverage.test.ts',
  'tests/unit/search-panel-pending-coverage.test.ts',
  'tests/unit/utility-errors-full-coverage.test.ts',
  'tests/unit/writing-workbench-wrapper-coverage.test.ts',
] as const;

describe('coverage formatter diagnostic', () => {
  it('emits the exact Prettier output for the first coverage batch', async () => {
    const formatted: Record<string, string> = {};
    for (const path of targets) {
      formatted[path] = await format(readFileSync(path, 'utf8'), { filepath: path });
    }
    const payload = gzipSync(Buffer.from(JSON.stringify(formatted), 'utf8')).toString('base64');
    console.log(`COVERAGE_FORMAT_DUMP:${payload}`);
    expect(Object.keys(formatted)).toHaveLength(targets.length);
  });
});
