import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

describe('M2-03 Core-local diff import output', () => {
  it('emits the Candidate apply plan with the Core-local diff module', async () => {
    const path = 'packages/core-service/src/candidate-apply-plan.ts';
    const source = await readFile(path, 'utf8');
    const before = "import { computeCandidateDiff, type StructureDiffEntry } from '@worldforge/editor-core';";
    expect(source.split(before)).toHaveLength(2);
    const output = await format(
      source.replace(
        before,
        "import { computeCandidateDiff, type StructureDiffEntry } from './candidate-apply-diff.js';",
      ),
      {
        filepath: path,
        printWidth: 100,
        singleQuote: true,
        trailingComma: 'all',
      },
    );
    console.log(`M203_CORE_PLAN:${Buffer.from(output, 'utf8').toString('base64')}`);
  });
});
