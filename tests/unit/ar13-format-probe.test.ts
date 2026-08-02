import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, it } from 'vitest';

const targets = [
  'packages/core-service/src/search/replace-preview.ts',
  'tests/unit/ar13-search-candidate.test.ts',
] as const;

describe('AR-13 format probe', () => {
  it('exports repository formatter results', async () => {
    for (const target of targets) {
      const config = await resolveConfig(target);
      const formatted = await format(await readFile(target, 'utf8'), {
        ...(config ?? {}),
        filepath: target,
      });
      const destination = path.join('test-results', 'unit', 'ar13-format-probe', target);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, formatted, 'utf8');
    }
    throw new Error('AR13_FORMAT_PROBE_READY');
  });
});
