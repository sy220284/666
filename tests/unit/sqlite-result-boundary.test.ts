import { describe, expect, it } from 'vitest';

import { sqliteResult } from '../../packages/core-service/src/database/sqlite-result.js';

describe('SQLite result boundary', () => {
  it('accepts row objects, row arrays and missing get results', () => {
    expect(sqliteResult<{ readonly id: string }>({ id: 'row-1' })).toEqual({ id: 'row-1' });
    expect(sqliteResult<readonly { readonly id: string }[]>([{ id: 'row-1' }])).toEqual([
      { id: 'row-1' },
    ]);
    expect(sqliteResult<{ readonly id: string } | undefined>(undefined)).toBeUndefined();
  });

  it('rejects primitive results and arrays containing non-row values', () => {
    expect(() => sqliteResult<number>(1, 'primitive probe')).toThrow(
      'primitive probe returned a non-row value',
    );
    expect(() => sqliteResult<unknown[]>([{ id: 'row-1' }, 2], 'array probe')).toThrow(
      'array probe returned a non-row array entry',
    );
  });
});
