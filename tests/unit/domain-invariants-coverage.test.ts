import { describe, expect, it } from 'vitest';

import {
  AppSettingsSchema,
  ProviderBaseUrlSchema,
  ProviderOptionsSchema,
} from '@worldforge/contracts';
import {
  ORDER_KEY_INTERVAL,
  SQLITE_INTEGER_MAX,
  SQLITE_INTEGER_MIN,
  assertAuthorAuthority,
  chapterRangeContains,
  comparableTimeRange,
  compareChapterPosition,
  dependencyDefinitelyOutOfOrder,
  eventTimeRange,
  normalizeContinuityKey,
  normalizeEntityAliases,
  normalizeEntityName,
  normalizeFactKey,
  planOrderKey,
  timeRangesOverlap,
} from '@worldforge/domain';

describe('continuity domain invariants', () => {
  it('normalizes valid keys and rejects empty, oversized and control-character keys', () => {
    expect(normalizeContinuityKey('  角色   状态  ')).toBe('角色 状态');
    expect(() => normalizeContinuityKey('   ')).toThrow('CONTINUITY_KEY_INVALID');
    expect(() => normalizeContinuityKey('abcd', 3)).toThrow('CONTINUITY_KEY_INVALID');
    expect(() => normalizeContinuityKey('角色\u001f状态')).toThrow('CONTINUITY_KEY_INVALID');
    expect(() => normalizeContinuityKey('角色\u007f状态')).toThrow('CONTINUITY_KEY_INVALID');
  });

  it('covers exact and imprecise timeline values with strict calendar validation', () => {
    expect(comparableTimeRange('ignored', 'approximate')).toBeNull();
    expect(comparableTimeRange('ignored', 'unknown')).toBeNull();
    expect(comparableTimeRange('2026-07-23T01:02:03.000Z', 'exact')).toEqual({
      startMs: Date.parse('2026-07-23T01:02:03.000Z'),
      endMs: Date.parse('2026-07-23T01:02:03.000Z') + 1,
    });
    expect(() => comparableTimeRange('invalid', 'exact')).toThrow('TIMELINE_VALUE_INVALID');

    expect(comparableTimeRange('2026', 'year')).toEqual({
      startMs: Date.UTC(2026, 0, 1),
      endMs: Date.UTC(2027, 0, 1),
    });
    expect(comparableTimeRange('2026-02', 'month')).toEqual({
      startMs: Date.UTC(2026, 1, 1),
      endMs: Date.UTC(2026, 2, 1),
    });
    expect(comparableTimeRange('2024-02-29', 'day')).toEqual({
      startMs: Date.UTC(2024, 1, 29),
      endMs: Date.UTC(2024, 1, 30),
    });

    for (const [value, precision] of [
      ['26', 'year'],
      ['2026-2', 'month'],
      ['2026-02-2', 'day'],
      ['2026-00', 'month'],
      ['2026-13', 'month'],
      ['2023-02-29', 'day'],
      ['2026', 'invalid'],
    ] as const) {
      expect(() => comparableTimeRange(value, precision as never)).toThrow(
        'TIMELINE_VALUE_INVALID',
      );
    }
  });

  it('builds event ranges and rejects reversed or zero-length ranges', () => {
    expect(eventTimeRange('unknown', null, 'unknown')).toBeNull();
    expect(eventTimeRange('2026-01-02', null, 'day')).toEqual({
      startMs: Date.UTC(2026, 0, 2),
      endMs: Date.UTC(2026, 0, 3),
    });
    expect(eventTimeRange('2026-01-02', '2026-01-04', 'day')).toEqual({
      startMs: Date.UTC(2026, 0, 2),
      endMs: Date.UTC(2026, 0, 5),
    });
    expect(() => eventTimeRange('2026-01-04', '2026-01-02', 'day')).toThrow(
      'TIMELINE_RANGE_INVALID',
    );
  });

  it('compares temporal and chapter ranges at every boundary', () => {
    const first = { startMs: 10, endMs: 20 };
    const overlap = { startMs: 15, endMs: 25 };
    expect(timeRangesOverlap(first, overlap)).toBe(true);
    expect(timeRangesOverlap(first, { startMs: 20, endMs: 30 })).toBe(false);
    expect(timeRangesOverlap(first, { startMs: 0, endMs: 10 })).toBe(false);
    expect(dependencyDefinitelyOutOfOrder({ startMs: 20, endMs: 30 }, first)).toBe(true);
    expect(dependencyDefinitelyOutOfOrder({ startMs: 19, endMs: 30 }, first)).toBe(false);

    expect(compareChapterPosition([1, 9], [2, 0])).toBeLessThan(0);
    expect(compareChapterPosition([2, 1], [2, 3])).toBeLessThan(0);
    expect(compareChapterPosition([2, 3], [2, 3])).toBe(0);
    expect(chapterRangeContains([2, 1], null, [99, 99])).toBe(true);
    expect(chapterRangeContains([2, 1], [3, 1], [2, 1])).toBe(true);
    expect(chapterRangeContains([2, 1], [3, 1], [3, 1])).toBe(false);
    expect(chapterRangeContains([2, 1], [3, 1], [1, 9])).toBe(false);
  });
});

describe('canon normalization invariants', () => {
  it('normalizes names, aliases and fact keys while rejecting invalid values', () => {
    expect(normalizeEntityName('  Ａlice  ')).toBe('Alice');
    expect(() => normalizeEntityName('')).toThrow('ENTITY_NAME_INVALID');
    expect(() => normalizeEntityName('x'.repeat(241))).toThrow('ENTITY_NAME_INVALID');

    expect(normalizeEntityAliases(['', ' Alice ', 'alice', 'Ｂob'])).toEqual(['Alice', 'Bob']);
    expect(() => normalizeEntityAliases(['x'.repeat(241)])).toThrow('ENTITY_ALIAS_INVALID');

    expect(normalizeFactKey('  Current   Location  ')).toBe('current-location');
    expect(() => normalizeFactKey('')).toThrow('CANON_FACT_KEY_INVALID');
    expect(() => normalizeFactKey('x'.repeat(121))).toThrow('CANON_FACT_KEY_INVALID');
    expect(() => normalizeFactKey('current\u007flocation')).toThrow('CANON_FACT_KEY_INVALID');
  });

  it('requires author authority for canonical mutations', () => {
    expect(() => assertAuthorAuthority('author')).not.toThrow();
    expect(() => assertAuthorAuthority('ai')).toThrow('CANON_AUTHOR_REQUIRED');
  });
});

describe('order key planning invariants', () => {
  const siblings = [
    { id: 'b', orderKey: 2n * ORDER_KEY_INTERVAL },
    { id: 'a', orderKey: ORDER_KEY_INTERVAL },
  ] as const;

  it('places empty, start, end, before and after entries without rebalancing when space exists', () => {
    expect(planOrderKey([], { kind: 'start' })).toEqual({
      orderKey: ORDER_KEY_INTERVAL,
      rebalanced: [],
    });
    expect(planOrderKey(siblings, { kind: 'start' })).toEqual({ orderKey: 0n, rebalanced: [] });
    expect(planOrderKey(siblings, { kind: 'end' })).toEqual({
      orderKey: 3n * ORDER_KEY_INTERVAL,
      rebalanced: [],
    });
    expect(planOrderKey(siblings, { kind: 'before', siblingId: 'b' })).toEqual({
      orderKey: 1536n,
      rebalanced: [],
    });
    expect(planOrderKey(siblings, { kind: 'after', siblingId: 'a' })).toEqual({
      orderKey: 1536n,
      rebalanced: [],
    });
    expect(() => planOrderKey(siblings, { kind: 'before', siblingId: 'missing' })).toThrow(
      'ORDER_PLACEMENT_SIBLING_NOT_FOUND',
    );
  });

  it('rebalances at adjacent and SQLite integer boundaries', () => {
    expect(
      planOrderKey(
        [
          { id: 'a', orderKey: 1n },
          { id: 'b', orderKey: 2n },
        ],
        { kind: 'after', siblingId: 'a' },
      ),
    ).toEqual({
      orderKey: 2n * ORDER_KEY_INTERVAL,
      rebalanced: [
        { id: 'a', orderKey: ORDER_KEY_INTERVAL },
        { id: 'b', orderKey: 3n * ORDER_KEY_INTERVAL },
      ],
    });
    expect(
      planOrderKey([{ id: 'min', orderKey: SQLITE_INTEGER_MIN }], { kind: 'start' }),
    ).toEqual({
      orderKey: ORDER_KEY_INTERVAL,
      rebalanced: [{ id: 'min', orderKey: 2n * ORDER_KEY_INTERVAL }],
    });
    expect(
      planOrderKey([{ id: 'max', orderKey: SQLITE_INTEGER_MAX }], { kind: 'end' }),
    ).toEqual({
      orderKey: 2n * ORDER_KEY_INTERVAL,
      rebalanced: [{ id: 'max', orderKey: ORDER_KEY_INTERVAL }],
    });
    expect(
      planOrderKey(
        [
          { id: 'same-a', orderKey: ORDER_KEY_INTERVAL },
          { id: 'same-b', orderKey: ORDER_KEY_INTERVAL },
        ],
        { kind: 'end' },
      ).orderKey,
    ).toBe(2n * ORDER_KEY_INTERVAL);
  });
});

describe('application configuration contracts', () => {
  const settings = {
    schemaVersion: 1,
    language: 'zh-CN',
    startupBehavior: 'show-home',
    defaultMode: 'beginner',
    themeId: 'theme-a',
    themeVariant: 'light',
    reduceMotion: false,
  } as const;

  it('enforces the Theme B variant restriction without restricting Theme A', () => {
    expect(AppSettingsSchema.safeParse(settings).success).toBe(true);
    expect(
      AppSettingsSchema.safeParse({ ...settings, themeId: 'theme-a', themeVariant: 'eye-care' })
        .success,
    ).toBe(true);
    expect(
      AppSettingsSchema.safeParse({ ...settings, themeId: 'theme-b', themeVariant: 'light' })
        .success,
    ).toBe(true);
    expect(
      AppSettingsSchema.safeParse({ ...settings, themeId: 'theme-b', themeVariant: 'dark' }).success,
    ).toBe(true);
    expect(
      AppSettingsSchema.safeParse({ ...settings, themeId: 'theme-b', themeVariant: 'eye-care' })
        .success,
    ).toBe(false);
  });

  it('rejects credentials at any nested provider option path', () => {
    expect(
      ProviderOptionsSchema.safeParse({
        temperature: 0.7,
        enabled: true,
        nullable: null,
        nested: [{ mode: 'strict' }, false],
      }).success,
    ).toBe(true);
    const result = ProviderOptionsSchema.safeParse({
      nested: [{ access_token: 'secret' }],
      password: 'secret',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path)).toEqual(
        expect.arrayContaining([['nested', 0, 'access_token'], ['password']]),
      );
    }
  });

  it('accepts credential-free HTTP(S) URLs and rejects other protocols or embedded credentials', () => {
    expect(ProviderBaseUrlSchema.safeParse('https://localhost:1234/v1').success).toBe(true);
    expect(ProviderBaseUrlSchema.safeParse('http://127.0.0.1:8080').success).toBe(true);
    expect(ProviderBaseUrlSchema.safeParse('ftp://localhost/model').success).toBe(false);
    expect(ProviderBaseUrlSchema.safeParse('https://user:pass@localhost/v1').success).toBe(false);
  });
});
