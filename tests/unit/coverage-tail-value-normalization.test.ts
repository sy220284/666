import type { PlotNode } from '@worldforge/contracts';
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
    const projectId = '00000000-0000-4000-8000-000000000001';
    const plotNode = (id: string, parentId: string | null, orderKey: string): PlotNode => ({
      id,
      projectId,
      parentId,
      nodeType: 'chapter',
      title: `节点 ${id}`,
      goal: '',
      coreConflict: '',
      expectedResult: '',
      orderKey,
      status: 'pending',
    });
    const nodes: PlotNode[] = [
      plotNode('00000000-0000-4000-8000-00000000000b', null, '2'),
      plotNode('00000000-0000-4000-8000-00000000000c', null, '1'),
      plotNode('00000000-0000-4000-8000-00000000000a', null, '2'),
      plotNode('00000000-0000-4000-8000-00000000000d', '00000000-0000-4000-8000-00000000000e', '0'),
    ];

    expect(sortedPlotNodes(nodes, null).map((node) => node.id)).toEqual([
      '00000000-0000-4000-8000-00000000000c',
      '00000000-0000-4000-8000-00000000000a',
      '00000000-0000-4000-8000-00000000000b',
    ]);
  });
});
