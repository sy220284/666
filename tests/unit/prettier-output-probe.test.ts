import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { format, resolveConfig } from 'prettier';
import { it } from 'vitest';

it('prints the repository Prettier output for the DOM boundary test', async () => {
  const file = path.join(process.cwd(), 'tests/unit/renderer-runtime-dom-boundaries.test.ts');
  const source = await readFile(file, 'utf8');
  const config = (await resolveConfig(file)) ?? {};
  const formatted = await format(source, { ...config, filepath: file });
  console.log(`BEGIN_PRETTIER_OUTPUT\n${formatted}END_PRETTIER_OUTPUT`);
});
