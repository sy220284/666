import { describe, expect, it } from 'vitest';

import { sanitizeLogFields } from '../../apps/desktop/main/src/privacy-logger.js';
import {
  lifecycleStatusLabel,
  lineValues,
  nullableString,
  sortedPlotNodes,
} from '../../apps/desktop/renderer/src/features/planning/planning-form-values.js';

describe('coverage tail value normalization', () => {
  it('preserves allowed non-string privacy log scalars', () => {
    expect(
      sanitizeLogFields({
        durationMs: 42,
        retryable: false,
        exitCode: null,
      }),
    ).toEqual({
      durationMs: 42,
      retryable: false,
      exitCode: null,
    });
  });

  it('normalizes absent and blank planning form values', () => {
    expect(lineValues(null)).toEqual([]);
    expect(nullableString(null)).toBeNull();
    expect(nullableString('   ')).toBeNull();
    expect(nullableString('  章节目标  ')).toBe('章节目标');
  });

  it('keeps non-empty lines and exposes every lifecycle label', () => {
    expect(lineValues(' 第一行 \n\n 第二行 ')).toEqual(['第一行', '第二行']);
    expect([
      lifecycleStatusLabel('pending'),
      lifecycleStatusLabel('outlined'),
      lifecycleStatusLabel('writing'),
      lifecycleStatusLabel('reviewing'),
      lifecycleStatusLabel('finalized'),
    ]).toEqual(['待规划', '已规划', '写作中', '审阅中', '已定稿']);
  });

  it('sorts plot siblings by order key and then stable id', () => {
    const nodes = [
      { id: 'b', parentId: null, orderKey: '2' },
      { id: 'c', parentId: null, orderKey: '1' },
      { id: 'a', parentId: null, orderKey: '2' },
      { id: 'child', parentId: 'parent', orderKey: '0' },
    ];

    expect(sortedPlotNodes(nodes as never, null).map((node) => node.id)).toEqual(['c', 'a', 'b']);
  });
});
