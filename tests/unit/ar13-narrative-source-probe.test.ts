import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, it } from 'vitest';

describe('AR-13 Narrative source probe', () => {
  it('exports the current Narrative source for deterministic splitting', async () => {
    const source = await readFile('packages/core-service/src/narrative-planning.ts', 'utf8');
    const destination = path.join(
      'test-results',
      'unit',
      'ar13-narrative-source',
      'narrative-planning.ts',
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');
    throw new Error('AR13_NARRATIVE_SOURCE_READY');
  });
});
