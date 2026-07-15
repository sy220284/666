import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('repository data-exclusion policy', () => {
  it('excludes local projects, databases, credentials and packaged output', async () => {
    const source = await readFile('.gitignore', 'utf8');
    for (const pattern of [
      '*.sqlite',
      '*.sqlite-wal',
      '*.worldforge/',
      '*.wfproj',
      'backups/',
      'recovery/',
      '.env',
      '*.key',
      '*.p12',
      'credentials.json',
      '*.dmg',
      '*.AppImage',
    ]) {
      expect(source.split(/\r?\n/)).toContain(pattern);
    }
  });
});
