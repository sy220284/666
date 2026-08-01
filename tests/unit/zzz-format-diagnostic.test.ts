import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { format, resolveConfig } from 'prettier';

describe('格式诊断', () => {
  it('输出规范化候选测试', async () => {
    const filepath = 'tests/unit/writing-candidate-regressions.test.ts';
    const source = await readFile(filepath, 'utf8');
    const config = (await resolveConfig(filepath)) ?? {};
    const formatted = await format(source, {
      ...config,
      filepath,
    });
    console.log('FORMAT_OUTPUT_START');
    console.log(formatted);
    console.log('FORMAT_OUTPUT_END');
    expect(formatted).toBe(source);
  });
});
