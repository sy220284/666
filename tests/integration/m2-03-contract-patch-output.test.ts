import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const prettier = {
  printWidth: 100,
  singleQuote: true,
  trailingComma: 'all' as const,
};

function replaceOnce(source: string, before: string, after: string, path: string): string {
  const first = source.indexOf(before);
  expect(first, `missing patch anchor in ${path}`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(before, first + before.length), `duplicate patch anchor in ${path}`).toBe(-1);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

describe('M2-03 contract barrel patch output', () => {
  it('emits Candidate contract exports', async () => {
    const path = 'packages/contracts/src/index.ts';
    const source = await readFile(path, 'utf8');
    const patched = replaceOnce(
      source,
      "export * from './draft.js';\n",
      "export * from './draft.js';\nexport * from './candidate.js';\nexport * from './candidate-apply.js';\n",
      path,
    );
    const formatted = await format(patched, { ...prettier, filepath: path });
    console.log(`M203_PATCH:${path}:${Buffer.from(formatted, 'utf8').toString('base64')}`);
  });
});
