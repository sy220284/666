import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';
import { format } from 'prettier';

describe('格式诊断', () => {
  it('输出规范化候选测试', async () => {
    const path = 'tests/unit/writing-candidate-regressions.test.ts';
    const source = await readFile(path, 'utf8');
    const formatted = await format(source, {
      parser: 'typescript',
    });
    console.log('FORMAT_OUTPUT_START');
    console.log(formatted);
    console.log('FORMAT_OUTPUT_END');
    expect(formatted).toBe(source);
  });
});
