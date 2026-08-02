import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

const target = 'packages/core-service/src/utility-control-router.ts';

describe('AR-13 temporary format probe', () => {
  it('prints the repository formatter result', async () => {
    const source = await readFile(target, 'utf8');
    const formatted = await format(source, { filepath: target });
    console.log(`AR13_FORMATTED_BASE64:${Buffer.from(formatted).toString('base64')}`);
  });
});
