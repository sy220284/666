import { describe, expect, it } from 'vitest';

import { verifiedTaskIds } from '../../scripts/verified-evidence-scan.mjs';

describe('verified evidence scan', () => {
  it('returns every Verified task once and ignores other states', () => {
    const source = `
| ID | 任务卡 | 依赖 | 状态 |
|---|---|---|---|
| M0-01 | [A](M0/A.md) | 无 | Verified |
| M0-02 | [B](M0/B.md) | M0-01 | Implemented |
| M1-01 | [C](M1/C.md) | M0 | Verified |
| M0-01 | [A](M0/A.md) | 无 | Verified |
`;
    expect(verifiedTaskIds(source)).toEqual(['M0-01', 'M1-01']);
  });

  it('does not treat text outside task rows as a Verified task', () => {
    expect(verifiedTaskIds('M2-04 is Verified in prose.')).toEqual([]);
  });
});
