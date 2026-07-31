import { describe, expect, it } from 'vitest';

import {
  MAX_GENERATION_POLL_FAILURES,
  generationPollingDelay,
  registerGenerationPollingFailure,
} from '../../apps/desktop/renderer/src/features/checks/generation-polling-policy.js';

describe('generation polling failure policy', () => {
  it('backs off with an upper bound', () => {
    expect([0, 1, 2, 3, 20].map(generationPollingDelay)).toEqual([1000, 2000, 4000, 5000, 5000]);
  });

  it('stops after the bounded consecutive failure budget', () => {
    let failures = 0;
    let terminal = false;
    for (let index = 0; index < MAX_GENERATION_POLL_FAILURES; index += 1) {
      const decision = registerGenerationPollingFailure(failures);
      failures = decision.failureCount;
      terminal = decision.terminal;
    }
    expect(failures).toBe(MAX_GENERATION_POLL_FAILURES);
    expect(terminal).toBe(true);
  });
});
