import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('AR-13 Draft source probe', () => {
  it('exports the current Draft source for deterministic splitting', async () => {
    const source = await readFile('packages/core-service/src/draft.ts', 'utf8');
    const destination = path.join(
      'test-results',
      'unit',
      'ar13-draft-source',
      'draft.ts',
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');
    expect(source).toContain('export class DraftService');
    throw new Error('AR13_DRAFT_SOURCE_READY');
  });
});
