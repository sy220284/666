import { readFile } from 'node:fs/promises';

import { format, resolveConfig } from 'prettier';
import { describe, expect, it } from 'vitest';

const target = 'tests/unit/m11-home-page-render-coverage.test.ts';

describe('格式探针', () => {
  it('打印首页覆盖测试的标准格式', async () => {
    const source = await readFile(target, 'utf8');
    const config = (await resolveConfig(target)) ?? {};
    const formatted = await format(source, { ...config, filepath: target });
    expect(formatted.length).toBeGreaterThan(0);
    console.log(`PRETTIER_OUTPUT_BEGIN\n${formatted}PRETTIER_OUTPUT_END`);
  });
});
