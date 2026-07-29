import { describe, expect, it } from 'vitest';

import { mixesWholeBookFinalsWithOtherVersions } from '../../packages/core-service/src/export-selection-guard.js';

const versions = [
  { versionId: 'final-1', finalized: true },
  { versionId: 'old-1', finalized: false },
  { versionId: 'final-2', finalized: true },
];

describe('整书导出服务端集合守卫', () => {
  it('允许全部且仅包含当前定稿版本', () => {
    expect(
      mixesWholeBookFinalsWithOtherVersions(['final-1', 'final-2'], versions),
    ).toBe(false);
  });

  it('拒绝全部定稿版本混入旧历史版本', () => {
    expect(
      mixesWholeBookFinalsWithOtherVersions(['final-1', 'old-1', 'final-2'], versions),
    ).toBe(true);
  });

  it('普通所选版本导出不被误判为整书模式', () => {
    expect(mixesWholeBookFinalsWithOtherVersions(['old-1'], versions)).toBe(false);
    expect(
      mixesWholeBookFinalsWithOtherVersions(['final-1', 'old-1'], versions),
    ).toBe(false);
  });
});
