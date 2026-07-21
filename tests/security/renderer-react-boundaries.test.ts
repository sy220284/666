import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('React renderer security boundaries', () => {
  it('blocks preload bypass, command DOM and persisted business authority', () => {
    expect(() =>
      execFileSync('node', ['apps/desktop/renderer/check-react-boundaries.mjs'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  it('boots through one React root and one explicit legacy compatibility import', async () => {
    const entry = await readFile('apps/desktop/renderer/src/react-entry.tsx', 'utf8');
    const lifecycle = await readFile(
      'apps/desktop/renderer/src/foundation/legacy-surface.ts',
      'utf8',
    );
    expect(entry).toContain('createRoot');
    expect(entry).toContain('mountLegacySurface');
    expect(lifecycle.match(/import\('\.\.\/entry\.js'\)/gu)).toHaveLength(1);
  });
});
