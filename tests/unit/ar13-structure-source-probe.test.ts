import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('AR-13 Structure source probe', () => {
  it('exports the current Structure Operations source for deterministic splitting', async () => {
    const source = await readFile('packages/core-service/src/structure-operations.ts', 'utf8');
    const destination = path.join(
      'test-results',
      'unit',
      'ar13-structure-source',
      'structure-operations.ts',
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');
    expect(source).toContain('export class StructureOperationService');
    throw new Error('AR13_STRUCTURE_SOURCE_READY');
  });
});
