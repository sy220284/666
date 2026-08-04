import { describe, expect, it } from 'vitest';

import { attachStaleMarkFailure } from '../../packages/core-service/src/search/search-model.js';

describe('safe replacement secondary error diagnostics', () => {
  it('attaches the stale-mark failure without replacing the original error', () => {
    const original = Object.assign(new Error('replace failed'), {
      code: 'SEARCH_REPLACE_STALE',
    });
    const staleMarkError = new Error('stale mark failed');

    attachStaleMarkFailure(original, staleMarkError);

    expect(original).toMatchObject({ code: 'SEARCH_REPLACE_STALE', message: 'replace failed' });
    expect((original as Error & { readonly staleMarkError?: unknown }).staleMarkError).toBe(
      staleMarkError,
    );
    expect(Object.keys(original)).not.toContain('staleMarkError');
  });
});
