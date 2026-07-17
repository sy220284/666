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

async function emit(path: string, transform: (source: string) => string): Promise<void> {
  const source = await readFile(path, 'utf8');
  const patched = await format(transform(source), { ...prettier, filepath: path });
  console.log(`M203_PATCH:${path}:${Buffer.from(patched, 'utf8').toString('base64')}`);
}

describe('M2-03 contract patch output', () => {
  it('emits Candidate provenance and contract exports', async () => {
    await emit('packages/contracts/src/candidate.ts', (source) => {
      let result = replaceOnce(
        source,
        '    logicalBlockId: DraftEntityIdSchema.nullable().optional(),\n    blockType:',
        '    logicalBlockId: DraftEntityIdSchema.nullable().optional(),\n    sourceLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).optional(),\n    blockType:',
        'packages/contracts/src/candidate.ts',
      );
      result = replaceOnce(
        result,
        '    logicalBlockId: DraftEntityIdSchema,\n    orderKey:',
        '    logicalBlockId: DraftEntityIdSchema,\n    sourceLogicalBlockIds: z.array(DraftEntityIdSchema).max(50_000).optional(),\n    orderKey:',
        'packages/contracts/src/candidate.ts',
      );
      return result;
    });

    await emit('packages/contracts/src/index.ts', (source) =>
      replaceOnce(
        source,
        "export * from './candidate.js';\n",
        "export * from './candidate.js';\nexport * from './candidate-apply.js';\n",
        'packages/contracts/src/index.ts',
      ),
    );
  });
});
