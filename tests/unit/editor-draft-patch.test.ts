import { describe, expect, it } from 'vitest';

import {
  buildDraftPatchOperations,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/index.js';

const firstId = '550e8400-e29b-41d4-a716-446655440000';
const secondId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const thirdId = '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d';
const firstHash = '1'.repeat(64);
const secondHash = '2'.repeat(64);
const thirdHash = '3'.repeat(64);

function persisted(
  logicalBlockId: string,
  text: string,
  contentHash: string,
  blockType: PersistedEditorBlock['blockType'] = 'paragraph',
): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType,
    text,
    attributes: blockType === 'heading' ? { headingLevel: 2 } : {},
    source: 'manual',
    locked: false,
    contentHash,
  };
}

function current(
  clientBlockId: string,
  logicalBlockId: string | null,
  text: string,
  blockType: DraftSnapshotEditorBlock['blockType'] = 'paragraph',
): DraftSnapshotEditorBlock {
  return {
    clientBlockId,
    logicalBlockId,
    blockType,
    text,
    attributes: blockType === 'heading' ? { headingLevel: 2 } : {},
  };
}

describe('M1-05 editor Patch generation', () => {
  it('uses stable anchors and reverse insertion for consecutive new blocks', () => {
    const operations = buildDraftPatchOperations(
      [persisted(firstId, '甲', firstHash), persisted(secondId, '乙', secondHash)],
      [
        current(firstId, firstId, '甲改'),
        current('temporary-one', null, '新一'),
        current('temporary-two', null, '新二'),
        current(secondId, secondId, '乙'),
      ],
    );

    expect(operations).toEqual([
      {
        type: 'insert',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新二', attributes: {} },
      },
      {
        type: 'insert',
        afterLogicalBlockId: firstId,
        block: { blockType: 'paragraph', content: '新一', attributes: {} },
      },
      {
        type: 'update',
        logicalBlockId: firstId,
        expectedHash: firstHash,
        content: '甲改',
      },
    ]);
  });

  it('emits deterministic moves before content updates', () => {
    const operations = buildDraftPatchOperations(
      [
        persisted(firstId, '甲', firstHash),
        persisted(secondId, '乙', secondHash),
        persisted(thirdId, '丙', thirdHash),
      ],
      [
        current(thirdId, thirdId, '丙'),
        current(firstId, firstId, '甲'),
        current(secondId, secondId, '乙改'),
      ],
    );

    expect(operations).toEqual([
      {
        type: 'move',
        logicalBlockId: thirdId,
        expectedHash: thirdHash,
        afterLogicalBlockId: null,
      },
      {
        type: 'update',
        logicalBlockId: secondId,
        expectedHash: secondHash,
        content: '乙改',
      },
    ]);
  });

  it('preserves logical identity when a block type changes', () => {
    const operations = buildDraftPatchOperations(
      [persisted(firstId, '旧正文', firstHash)],
      [current(firstId, firstId, '新标题', 'heading')],
    );

    expect(operations).toEqual([
      {
        type: 'update',
        logicalBlockId: firstId,
        expectedHash: firstHash,
        blockType: 'heading',
        content: '新标题',
        attributes: { headingLevel: 2 },
      },
    ]);
  });

  it('rejects persisted blocks without an authoritative contentHash', () => {
    expect(() =>
      buildDraftPatchOperations(
        [{ ...persisted(firstId, '甲', firstHash), contentHash: null }],
        [current(firstId, firstId, '甲改')],
      ),
    ).toThrow(/missing its content hash/);
  });
});
