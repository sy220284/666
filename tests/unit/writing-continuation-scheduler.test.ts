import { describe, expect, it, vi } from 'vitest';

import { cancelScheduledContinuationSave } from '../../apps/desktop/renderer/src/features/writing/use-writing-continuation.js';

describe('writing continuation scheduler', () => {
  it('cancels a pending continuation timer before an explicit save can enter the same lane', () => {
    vi.useFakeTimers();
    try {
      const callback = vi.fn();
      const timer = { current: setTimeout(callback, 500) };

      cancelScheduledContinuationSave(timer);
      vi.advanceTimersByTime(500);

      expect(timer.current).toBeNull();
      expect(callback).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
