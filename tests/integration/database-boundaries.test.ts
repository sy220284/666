import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('database process boundary', () => {
  it('keeps SQLite imports inside Core Service', async () => {
    const privilegedAppSources = await Promise.all([
      readFile('apps/desktop/main/src/index.ts', 'utf8'),
      readFile('apps/desktop/preload/src/index.ts', 'utf8'),
      readFile('apps/desktop/renderer/src/index.ts', 'utf8'),
    ]);

    const sources = privilegedAppSources.join('\n');
    expect(sources).not.toContain('node:sqlite');
    expect(sources).not.toContain('DatabaseSync');
    expect(sources).not.toContain('@worldforge/core-service');
    expect(sources).not.toContain('better-sqlite3');
  });
});
