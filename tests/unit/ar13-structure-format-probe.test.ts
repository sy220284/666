import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const files = [
  'packages/core-service/src/structure-operations.ts',
  'packages/core-service/src/structure-operations/structure-operation-model.ts',
  'packages/core-service/src/structure-operations/structure-operation-preview-service.ts',
  'packages/core-service/src/structure-operations/structure-operation-execution-service.ts',
  'packages/core-service/src/structure-operations/structure-trash-operation-service.ts',
  'packages/core-service/src/structure-operations/structure-operation-service.ts',
  'tests/unit/ar13-structure-operations-boundaries.test.ts',
] as const;

describe('AR-13 Structure format probe', () => {
  it('exports repository-formatted Structure split files', async () => {
    const destination = 'test-results/unit/ar13-structure-formatted';
    await mkdir(destination, { recursive: true });

    for (const file of files) {
      const source = await readFile(file, 'utf8');
      const config = (await resolveConfig(file)) ?? {};
      const formatted = await format(source, { ...config, filepath: file });
      expect(formatted.length).toBeGreaterThan(0);
      await writeFile(path.join(destination, path.basename(file)), formatted, 'utf8');
    }

    throw new Error('AR13_STRUCTURE_FORMAT_READY');
  });
});
