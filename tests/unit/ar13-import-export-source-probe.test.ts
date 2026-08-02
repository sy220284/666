import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

describe('AR-13 Import/Export source probe', () => {
  it('exports the current Import/Export source for deterministic splitting', async () => {
    const source = await readFile('packages/core-service/src/import-export.ts', 'utf8');
    const destination = path.join(
      'test-results',
      'unit',
      'ar13-import-export-source',
      'import-export.ts',
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, source, 'utf8');
    expect(source).toContain('export class ImportExportService');
    throw new Error('AR13_IMPORT_EXPORT_SOURCE_READY');
  });
});
