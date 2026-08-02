import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const target = 'packages/core-service/src/utility-control-router.ts';

describe('AR-13 temporary format probe', () => {
  it('prints the repository formatter result', async () => {
    const source = await readFile(target, 'utf8');
    const config = await resolveConfig(target);
    expect(config).not.toBeNull();
    const formatted = await format(source, { ...config, filepath: target });
    console.log(`AR13_FORMATTED_BASE64:${Buffer.from(formatted).toString('base64')}`);
  });
});
