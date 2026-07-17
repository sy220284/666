import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const targets = ['apps/desktop/preload/src/index.ts', 'apps/desktop/renderer/src/global.d.ts'] as const;

describe('M2-03 bridge formatting', () => {
  it('emits repository-configured formatting', async () => {
    const config = (await resolveConfig(process.cwd())) ?? {};
    for (const target of targets) {
      const source = await readFile(target, 'utf8');
      const formatted = await format(source, { ...config, filepath: target });
      console.log(`M203_FORMAT:${target}:${Buffer.from(formatted, 'utf8').toString('base64')}`);
      expect(formatted.length).toBeGreaterThan(0);
    }
  });
});
