import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const targetPath = 'tests/integration/backup-cleanup-high-risk-coverage.test.ts';

describe('backup cleanup repository format diagnostic', () => {
  it('prints the exact repository-formatted target', async () => {
    const source = await readFile(targetPath, 'utf8');
    const config = (await resolveConfig(targetPath)) ?? {};
    const formatted = await format(source, { ...config, filepath: targetPath });
    console.log(`BACKUP_CLEANUP_REPO_FORMAT_BASE64:${Buffer.from(formatted).toString('base64')}`);
    expect(formatted.length).toBeGreaterThan(0);
  });
});
