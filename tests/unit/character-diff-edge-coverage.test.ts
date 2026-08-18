import { describe, expect, it } from 'vitest';

import { diffChineseCharacters } from '../../packages/editor-core/src/character-diff.js';

describe('Character diff edge coverage', () => {
  it('backtracks through an unchanged middle snake between replacements', () => {
    expect(diffChineseCharacters('甲中乙', '丙中丁')).toEqual({
      segments: [
        { type: 'delete', text: '甲' },
        { type: 'insert', text: '丙' },
        { type: 'equal', text: '中' },
        { type: 'delete', text: '乙' },
        { type: 'insert', text: '丁' },
      ],
      coarse: false,
    });
  });

  it('counts shared characters before deciding whether a large replacement is unrelated', () => {
    const before = '甲乙'.repeat(300);
    const after = '丙乙'.repeat(300);
    const result = diffChineseCharacters(before, after, { maximumEditDistance: 0 });
    expect(result.coarse).toBe(true);
    expect(result.segments).toEqual([
      { type: 'delete', text: before.slice(0, -1) },
      { type: 'insert', text: after.slice(0, -1) },
      { type: 'equal', text: '乙' },
    ]);
  });

  it('falls back when the work budget expires during a shared middle snake', () => {
    expect(diffChineseCharacters('甲中乙', '丙中丁', { maximumWorkUnits: 5 })).toMatchObject({
      coarse: true,
    });
  });

  it('crosses the periodic work probe while searching a bounded exact diff', () => {
    let probes = 0;
    const signal = {
      get aborted() {
        probes += 1;
        return false;
      },
    };
    const result = diffChineseCharacters('甲'.repeat(30), '乙'.repeat(30), {
      signal,
      maximumWorkUnits: 10_000,
    });
    expect(result.coarse).toBe(false);
    expect(probes).toBeGreaterThan(2);
  });

  it('crosses a periodic work probe while following a long internal equality snake', () => {
    let probes = 0;
    const signal = {
      get aborted() {
        probes += 1;
        return false;
      },
    };
    const before = `${'甲'.repeat(24)}${'中'.repeat(1200)}${'乙'.repeat(24)}`;
    const after = `${'丙'.repeat(24)}${'中'.repeat(1200)}${'丁'.repeat(24)}`;
    const result = diffChineseCharacters(before, after, {
      signal,
      maximumWorkUnits: 20_000,
    });
    expect(result.coarse).toBe(false);
    expect(result.segments).toContainEqual({ type: 'equal', text: '中'.repeat(1200) });
    expect(probes).toBeGreaterThan(2);
  });
});
