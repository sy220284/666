import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const target = 'tests/unit/m11-home-page-render-coverage.test.ts';

describe('一次性格式探针', () => {
  it('打印仓库配置下的标准格式', async () => {
    const source = await readFile(target, 'utf8');
    const config = (await resolveConfig(target)) ?? {};
    const formatted = await format(source, { ...config, filepath: target });

    console.log(`PRETTIER_CONFIG=${JSON.stringify(config)}`);
    console.log(`PRETTIER_MATCH=${String(source === formatted)}`);
    console.log(`PRETTIER_BASE64=${Buffer.from(formatted, 'utf8').toString('base64')}`);

    expect(formatted.length).toBeGreaterThan(0);
  });
});
