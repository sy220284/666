import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { format } from 'prettier';

describe('temporary M8-07 formatting diagnostic', () => {
  it('prints the exact formatted UI acceptance gate source', async () => {
    const file = path.join(process.cwd(), 'scripts/ui-acceptance-gate.mjs');
    const source = await readFile(file, 'utf8');
    const formatted = await format(source, { parser: 'babel' });
    if (source !== formatted) {
      console.log(`M8_07_FORMATTED_BEGIN\n${formatted}M8_07_FORMATTED_END`);
    }
    expect(source).toBe(formatted);
  });
});
