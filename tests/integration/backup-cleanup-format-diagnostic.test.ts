import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, expect, it } from 'vitest';

const targetPath = 'tests/integration/backup-cleanup-high-risk-coverage.test.ts';

describe('backup cleanup format diagnostic', () => {
  it('prints the exact machine-formatted target', async () => {
    const source = await readFile(targetPath, 'utf8');
    const formatted = await format(source, { filepath: targetPath });
    const encoded = Buffer.from(formatted, 'utf8').toString('base64');
    console.log(`BACKUP_CLEANUP_FORMAT_BASE64:${encoded}`);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
