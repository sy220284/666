import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { format } from 'prettier';
import { expect, it } from 'vitest';

it('emits the Prettier-formatted Provider coverage test as a diagnostic artifact', async () => {
  const sourcePath = 'tests/security/provider-branch-coverage.test.ts';
  const outputPath = 'test-results/unit/provider-branch-coverage.formatted.ts';
  const source = await readFile(sourcePath, 'utf8');
  const corrected = source.replace(
    "    warnings: ['请求仅发送到当前设备上的用户配置服务。'],\n",
    """    warnings: [
      '请求仅发送到当前设备上的用户配置服务。',
      '当前连接未使用TLS，仅允许本机或受信局域网端点。',
    ],
""",
  );
  const formatted = await format(corrected, { parser: 'typescript' });

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, formatted);

  expect(formatted).toContain('当前连接未使用TLS');
  throw new Error('Formatted Provider coverage artifact emitted.');
});
