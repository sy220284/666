import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M2-03 Core dependency boundary', () => {
  it('keeps core-service independent from editor-core', async () => {
    const packageJson = await readFile('packages/core-service/package.json', 'utf8');
    const tsconfig = await readFile('packages/core-service/tsconfig.json', 'utf8');

    expect(packageJson).not.toContain('@worldforge/editor-core');
    expect(tsconfig).not.toContain('../editor-core');
  });
});
