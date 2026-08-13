import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('temporary Prettier probe', () => {
  it('prints the authoritative formatted single-flight regression source', async () => {
    const file = new URL('./renderer-generation-single-flight.test.ts', import.meta.url);
    const source = await readFile(file, 'utf8');
    const formatted = await format(source, { filepath: file.pathname });
    throw new Error(`PRETTIER_RESULT_BASE64:${Buffer.from(formatted).toString('base64')}`);
  });
});
