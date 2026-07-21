import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const files = [
  'docs/database/DATABASE_SCHEMA.md',
  'docs/database/DATA_DICTIONARY.md',
  'docs/contracts/IPC_CONTRACTS.md',
  'docs/product/V1.0_TRACEABILITY_MATRIX.md',
] as const;

describe('M3-06 documentation export', () => {
  it('exports exact documentation sources and stops the temporary run', async () => {
    const output = path.join(process.cwd(), 'test-results/integration/m3-06-docs');
    await mkdir(output, { recursive: true });
    for (const file of files) {
      await writeFile(path.join(output, path.basename(file)), await readFile(file));
    }
    expect.fail('Documentation sources emitted for one-shot synchronization.');
  });
});
