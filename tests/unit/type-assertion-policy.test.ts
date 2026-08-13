import { describe, expect, it } from 'vitest';

import {
  countDoubleAssertions,
  inspectTypeAssertionPolicy,
} from '../../scripts/type-assertion-policy.mjs';

describe('type assertion boundary policy', () => {
  it('keeps reviewed production double assertions bounded and removes SQLite row double casts', async () => {
    await expect(inspectTypeAssertionPolicy()).resolves.toEqual({
      total: 5,
      allowlistedFiles: 5,
    });
  });

  it('counts only explicit unknown-to-type double assertions', () => {
    expect(countDoubleAssertions('value as unknown as Row; other as Row;')).toBe(1);
  });
});
