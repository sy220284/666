import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const TARGETS = [
  'tests/unit/m11-state-proposal-author-edit-coverage.test.ts',
  'tests/unit/m11-author-form-render-coverage.test.ts',
] as const;

describe('M11 temporary locked Prettier export', () => {
  it('writes exact repository formatter output into ignored unit artifacts', async () => {
    const outputRoot = path.join(process.cwd(), 'test-results/unit/m11-prettier-output');
    for (const target of TARGETS) {
      const source = await readFile(target, 'utf8');
      const config = (await resolveConfig(target)) ?? {};
      const formatted = await format(source, { ...config, filepath: target });
      const outputPath = path.join(outputRoot, target);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, formatted, 'utf8');
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});
