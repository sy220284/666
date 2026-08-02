import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const relativePath =
  'tests/unit/ar12-project-workspace-path-policy-branches.test.ts';
const outputPath = path.join(
  root,
  'test-results/unit/ar12-path-policy-test-format',
  relativePath,
);

describe('AR-12 path-policy test formatting checkpoint', () => {
  it('exports the test using the repository Prettier configuration', async () => {
    await rm(path.dirname(outputPath), { recursive: true, force: true });
    const sourcePath = path.join(root, relativePath);
    const config = (await prettier.resolveConfig(sourcePath)) ?? {};
    const formatted = await prettier.format(await readFile(sourcePath, 'utf8'), {
      ...config,
      filepath: sourcePath,
    });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, formatted, 'utf8');
    expect(formatted.length).toBeGreaterThan(0);
    throw new Error('AR-12 path-policy test formatting artifact checkpoint.');
  });
});
