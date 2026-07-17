import { describe, expect, it } from 'vitest';

import {
  buildDraftPatchOperations,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/index.js';

const firstId = '550e8400-e29b-41d4-a716-446655440000';
const hash = 'a'.repeat(64);

function persisted(locked: boolean): PersistedEditorBlock {
  return {
    logicalBlockId: firstId,
    blockType: 'paragraph',
    text: '原文',
    attributes: {},
    source: 'manual',
    locked,
    contentHash: hash,
  };
}

function current(text: string, locked: boolean): DraftSnapshotEditorBlock {
  return {
    clientBlockId: firstId,
    logicalBlockId: firstId,
    blockType: 'paragraph',
    text,
    attributes: {},
    locked,
  };
}

describe('M2-01 editor lock Patch generation', () => {
  it('unlocks before editing a previously locked block', () => {
    expect(buildDraftPatchOperations([persisted(true)], [current('解锁后修改', false)])).toEqual([
      {
        type: 'set-lock',
        logicalBlockId: firstId,
        expectedHash: hash,
        locked: false,
      },
      {
        type: 'update',
        logicalBlockId: firstId,
        expectedHash: hash,
        content: '解锁后修改',
      },
    ]);
  });

  it('locks only after pending content changes are applied', () => {
    expect(buildDraftPatchOperations([persisted(false)], [current('修改后锁定', true)])).toEqual([
      {
        type: 'update',
        logicalBlockId: firstId,
        expectedHash: hash,
        content: '修改后锁定',
      },
      {
        type: 'set-lock',
        logicalBlockId: firstId,
        expectedHash: hash,
        locked: true,
      },
    ]);
  });
});
