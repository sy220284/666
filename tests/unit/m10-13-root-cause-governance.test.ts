import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('M10-13 root-cause governance', () => {
  it('keeps the repository authority focused on preserving mature cores and rewriting weak boundaries', async () => {
    const agents = await readFile('AGENTS.md', 'utf8');

    expect(agents).toContain('## 8.1 根因治理与局部重写原则');
    expect(agents).toContain(
      '保留成熟且已验证的数据与业务内核，局部重写脆弱的进程通信和异步交互边界',
    );
    expect(agents).toContain('通过统一机制消灭一整类问题');
    expect(agents).toContain('禁止针对每个现象反复打补丁');
    expect(agents).toContain('根因位于公共边界时，建立单一公共机制并迁移所有受影响调用点');
    expect(agents).toContain('把局部重写扩大为无边界的全仓翻新');
  });
});
