import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { format } from 'prettier';

const root = process.cwd();
const target = path.join(
  root,
  'apps/desktop/renderer/src/features/research/research-workbench.tsx',
);
const outputDirectory = path.join(root, 'test-results/unit');
const output = path.join(outputDirectory, 'm12-04-prettier-research-workbench.tsx');

describe('M12-04 formatter diagnostic', () => {
  it('captures the repository Prettier output and formatter package', async () => {
    const source = await readFile(target, 'utf8');
    const formatted = await format(source, { filepath: target });
    const prettierRoot = path.dirname(fileURLToPath(import.meta.resolve('prettier')));

    await mkdir(outputDirectory, { recursive: true });
    await writeFile(output, formatted, 'utf8');
    await cp(prettierRoot, path.join(outputDirectory, 'prettier-3.9.6'), { recursive: true });

    expect(formatted).toContain('export function ResearchWorkbench');
  });
});
