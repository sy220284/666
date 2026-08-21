import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { format } from 'prettier';

const root = process.cwd();
const target = path.join(
  root,
  'apps/desktop/renderer/src/features/research/research-workbench.tsx',
);
const output = path.join(root, 'test-results/unit/m12-04-prettier-research-workbench.tsx');

describe('M12-04 formatter diagnostic', () => {
  it('captures the repository Prettier output for the research workbench', async () => {
    const source = await readFile(target, 'utf8');
    const formatted = await format(source, { filepath: target });
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, formatted, 'utf8');
    expect(formatted).toContain('export function ResearchWorkbench');
  });
});
