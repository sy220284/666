import { mkdir, readFile, writeFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const target = 'packages/core-service/src/utility-control-router.ts';

describe('AR-13 temporary format probe', () => {
  it('exports the repository formatter result', async () => {
    const source = await readFile(target, 'utf8');
    const config = await resolveConfig(target);
    expect(config).not.toBeNull();
    const formatted = await format(source, { ...config, filepath: target });
    await mkdir('test-results/unit', { recursive: true });
    await writeFile('test-results/unit/utility-control-router.ts', formatted, 'utf8');
    expect(source).toBe(formatted);
  });
});
