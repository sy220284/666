import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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

describe('coverage formatter diagnostic without ignore rules', () => {
  it('emits the exact Prettier CLI output without consulting .prettierignore', () => {
    const formatted: Record<string, string> = {};
    for (const path of targets) {
      formatted[path] = execFileSync(
        'pnpm',
        ['exec', 'prettier', '--ignore-path', '/dev/null', '--stdin-filepath', path],
        {
          input: readFileSync(path, 'utf8'),
          encoding: 'utf8',
        },
      );
    }
    const payload = gzipSync(Buffer.from(JSON.stringify(formatted), 'utf8')).toString('base64');
    console.log(`COVERAGE_FORMAT_DUMP_NO_IGNORE:${payload}`);
    expect(Object.keys(formatted)).toHaveLength(targets.length);
  });
});
