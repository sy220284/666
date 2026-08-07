import { describe, expect, it } from 'vitest';

import { recoveryOverviewAvailability } from '../../apps/desktop/renderer/src/features/data-tools/recovery-overview-state.js';

describe('M10-13 Recovery概览可用性', () => {
  it('区分加载、读取不可用与真实可用数据', () => {
    expect(recoveryOverviewAvailability('loading', false)).toBe('loading');
    expect(recoveryOverviewAvailability('failure', false)).toBe('unavailable');
    expect(recoveryOverviewAvailability('cancelled', false)).toBe('unavailable');
    expect(recoveryOverviewAvailability('success', false)).toBe('unavailable');
    expect(recoveryOverviewAvailability('success', true)).toBe('available');
  });
});
