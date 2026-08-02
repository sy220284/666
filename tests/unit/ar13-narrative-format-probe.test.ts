import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'packages/core-service/src/narrative-planning.ts',
  'packages/core-service/src/narrative/narrative-model.ts',
  'packages/core-service/src/narrative/narrative-catalog.ts',
  'packages/core-service/src/narrative/foreshadowing-operations.ts',
  'packages/core-service/src/narrative/character-arc-operations.ts',
  'packages/core-service/src/narrative/narrative-planning-service.ts',
  'tests/unit/ar13-narrative-boundaries.test.ts',
] as const;

describe('AR-13 Narrative format probe', () => {
  it('exports repository-formatted Narrative split files', async () => {
    const destination = 'test-results/unit/ar13-narrative-formatted';
    await mkdir(destination, { recursive: true });

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const config = (await resolveConfig(file)) ?? {};
      const formatted = await format(source, { ...config, filepath: file });
      expect(formatted.length).toBeGreaterThan(0);
      await writeFile(path.join(destination, path.basename(file)), formatted, 'utf8');
    }

    throw new Error('AR13_NARRATIVE_FORMAT_READY');
  });
});
