import { describe, expect, it } from 'vitest';

import {
  lifecycleStatusLabel,
  lineValues,
  nullableString,
  sortedPlotNodes,
} from '../../apps/desktop/renderer/src/features/planning/planning-form-values.js';
import { persistedEditorBlocks } from '../../apps/desktop/renderer/src/features/writing/draft-blocks.js';

describe('renderer pure helpers previously missing direct coverage', () => {
  it('normalizes planning form values and lifecycle labels', () => {
    expect(lineValues(' 第一行\r\n\n 第二行 ')).toEqual(['第一行', '第二行']);
    expect(lineValues(null)).toEqual([]);
    expect(nullableString('  内容  ')).toBe('内容');
    expect(nullableString('   ')).toBeNull();
    expect(
      ['pending', 'outlined', 'writing', 'reviewing', 'finalized'].map((status) =>
        lifecycleStatusLabel(status as Parameters<typeof lifecycleStatusLabel>[0]),
      ),
    ).toEqual(['待规划', '已规划', '写作中', '审阅中', '已定稿']);
  });

  it('sorts only direct plot-node children by large order keys and stable id', () => {
    const nodes = [
      { id: 'b', parentId: null, orderKey: '9007199254740994' },
      { id: 'child', parentId: 'parent', orderKey: '1' },
      { id: 'a', parentId: null, orderKey: '9007199254740994' },
      { id: 'first', parentId: null, orderKey: '9007199254740993' },
    ] as Parameters<typeof sortedPlotNodes>[0];

    expect(sortedPlotNodes(nodes, null).map((node) => node.id)).toEqual(['first', 'a', 'b']);
    expect(sortedPlotNodes(nodes, 'parent').map((node) => node.id)).toEqual(['child']);
  });

  it('maps a Draft document to the complete persisted editor block surface', () => {
    const document = {
      draftId: 'draft-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      revision: 3,
      status: 'active',
      blocks: [
        {
          logicalBlockId: 'block-1',
          clientBlockId: undefined,
          blockType: 'paragraph',
          text: '正文',
          attributes: { speaker: '甲' },
          source: 'author',
          locked: true,
          contentHash: 'hash-1',
        },
      ],
    } as Parameters<typeof persistedEditorBlocks>[0];

    expect(persistedEditorBlocks(document)).toEqual([
      {
        logicalBlockId: 'block-1',
        clientBlockId: null,
        blockType: 'paragraph',
        text: '正文',
        attributes: { speaker: '甲' },
        source: 'author',
        locked: true,
        contentHash: 'hash-1',
      },
    ]);
  });
});
