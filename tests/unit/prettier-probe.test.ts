import { readFile } from 'node:fs/promises';

import { format } from 'prettier';
import { describe, it } from 'vitest';

describe('格式探针', () => {
  it('打印首页覆盖测试的标准格式', async () => {
    const source = await readFile('tests/unit/m11-home-page-render-coverage.test.ts', 'utf8');
    const formatted = await format(source, { parser: 'typescript' });
    console.log(`PRETTIER_OUTPUT_BEGIN\n${formatted}PRETTIER_OUTPUT_END`);
  });
});
