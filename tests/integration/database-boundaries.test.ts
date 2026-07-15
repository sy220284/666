import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('database process boundary', () => {
  it('keeps SQLite imports inside Core Service', async () => {
    const privilegedAppSources = await Promise.all([
      readFile('apps/desktop/main/src/index.ts', 'utf8'),
      readFile('apps/desktop/preload/src/index.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/index.ts', 'utf8'),
    ]);

    expect(privilegedAppSources.join('\n')).not.toContain('node:sqlite');
    expect(privilegedAppSources.join('\n')).not.toMatch(/(?:app|project)\.sqlite/);
  });
});
