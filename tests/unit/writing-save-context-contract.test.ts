import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('writing save request contract', () => {
  it('carries immutable request context into metadata synchronization', async () => {
    const source = await readFile(
      'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx',
      'utf8',
    );
    expect(source).toContain('const saveContext = {');
    expect(source).toContain('editorGeneration: editorGeneration.current');
    expect(source).toContain('blockIdentityMap: new Map');
    expect(source).toContain('saveContext.requestSnapshot');
    expect(source).not.toContain('if (!synchronized)');
  });
});
