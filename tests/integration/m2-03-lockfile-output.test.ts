import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const before = `      '@worldforge/domain':
        specifier: workspace:*
        version: link:../domain
      iconv-lite:`;

const after = `      '@worldforge/domain':
        specifier: workspace:*
        version: link:../domain
      '@worldforge/editor-core':
        specifier: workspace:*
        version: link:../editor-core
      iconv-lite:`;

describe('M2-03 workspace lock output', () => {
  it('emits the complete lockfile with the declared editor-core dependency', async () => {
    const lockfile = await readFile('pnpm-lock.yaml', 'utf8');
    expect(lockfile.match(new RegExp(before.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'gu'))).toHaveLength(1);
    const patched = lockfile.replace(before, after);
    console.log(`M203_LOCKFILE:${Buffer.from(patched, 'utf8').toString('base64')}`);
  });
});
