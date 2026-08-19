import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import type { Chapter, DraftDocument } from '@worldforge/contracts';

import {
  capturePersistedRewriteSelectionAnchor,
  persistEditorSelectionRange,
} from '../../apps/desktop/renderer/src/features/writing/editor-selection.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const chapterId = '22222222-2222-4222-8222-222222222222';
const draftId = '33333333-3333-4333-8333-333333333333';
const firstBlockId = '44444444-4444-4444-8444-444444444444';
const secondBlockId = '55555555-5555-4555-8555-555555555555';
const separatorId = '66666666-6666-4666-8666-666666666666';

const chapter = {
  id: chapterId,
} as Chapter;

function draft(secondLocked = false): DraftDocument {
  return {
    projectId,
    chapterId,
    draftId,
    status: 'active',
    revision: 7,
    blocks: [
      {
        logicalBlockId: firstBlockId,
        orderKey: '1024',
        blockType: 'paragraph',
        text: '前文',
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: 'a'.repeat(64),
      },
      {
        logicalBlockId: separatorId,
        orderKey: '2048',
        blockType: 'separator',
        text: '',
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: 'b'.repeat(64),
      },
      {
        logicalBlockId: secondBlockId,
        orderKey: '3072',
        blockType: 'paragraph',
        text: '清河落雨',
        attributes: {},
        source: 'manual',
        locked: secondLocked,
        contentHash: 'c'.repeat(64),
      },
    ],
  };
}

describe('persisted rewrite selection reconstruction', () => {
  it('rebuilds a precise selection anchor from saved draft positions after editor unmount', async () => {
    // 第一段 nodeSize=4，分隔线 nodeSize=1，因此第二段正文从 ProseMirror 位置 6 开始。
    persistEditorSelectionRange(projectId, chapterId, 7, 9);
    const anchor = await capturePersistedRewriteSelectionAnchor(projectId, chapter, draft());

    expect(anchor).toEqual({
      projectId,
      chapterId,
      draftId,
      baseRevision: 7,
      logicalBlockId: secondBlockId,
      expectedBlockHash: 'c'.repeat(64),
      selectionStart: 1,
      selectionEnd: 3,
      selectedTextHash: createHash('sha256').update('河落').digest('hex'),
    });
  });

  it('rejects cross-block, locked and empty remembered selections instead of widening the rewrite scope', async () => {
    persistEditorSelectionRange(projectId, chapterId, 2, 7);
    await expect(
      capturePersistedRewriteSelectionAnchor(projectId, chapter, draft()),
    ).resolves.toBeNull();

    persistEditorSelectionRange(projectId, chapterId, 7, 9);
    await expect(
      capturePersistedRewriteSelectionAnchor(projectId, chapter, draft(true)),
    ).resolves.toBeNull();

    persistEditorSelectionRange(projectId, chapterId, 7, 7);
    await expect(
      capturePersistedRewriteSelectionAnchor(projectId, chapter, draft()),
    ).resolves.toBeNull();
  });
});
