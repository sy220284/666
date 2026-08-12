import { describe, expect, it } from 'vitest';

import { interactionLocked } from '../../apps/desktop/renderer/src/runtime/interaction-locks.js';

describe('interactionLocked', () => {
  it('keeps an interaction available when every blocking condition is false', () => {
    expect(interactionLocked()).toBe(false);
    expect(interactionLocked(false, false, false)).toBe(false);
  });

  it('locks the interaction when any blocking condition is true', () => {
    expect(interactionLocked(true)).toBe(true);
    expect(interactionLocked(false, true, false)).toBe(true);
    expect(interactionLocked(false, false, true)).toBe(true);
  });
});
