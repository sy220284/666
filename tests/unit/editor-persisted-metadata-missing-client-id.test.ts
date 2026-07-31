import { beforeEach, describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import {
  rememberPendingDraftSnapshot,
  resetPendingDraftSnapshotsForTests,
  synchronizePersistedBlockMetadata,
} from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

function persisted(logicalBlockId: string, text: string): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked: false,
    contentHash: `hash-${logicalBlockId}`,
  };
}

function editorFor(
  blocks: ReadonlyArray<{
    readonly logicalBlockId: string | null;
    readonly clientBlockId: string | null;
    readonly text: string;
  }>,
) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: 'paragraph',
        attrs: {
          logicalBlockId: block.logicalBlockId,
          clientBlockId: block.clientBlockId,
          source: 'manual',
          locked: false,
          contentHash: block.logicalBlockId ? `old-${block.logicalBlockId}` : null,
        },
        content: block.text ? [{ type: 'text', text: block.text }] : undefined,
      })),
    }),
  });
  const editor = contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
    get state() {
      return state;
    },
    view: {
      dispatch(transaction: Parameters<typeof state.apply>[0]) {
        state = state.apply(transaction);
      },
    },
  });
  return { editor, state: () => state };
}

beforeEach(() => resetPendingDraftSnapshotsForTests());

describe('persisted metadata synchronization for paste-created blocks', () => {
  it('attaches identity to a semantically unique node that still lacks a client id', () => {
    const target = editorFor([
      { logicalBlockId: 'stable-1', clientBlockId: 'stable-1', text: '已有正文' },
      { logicalBlockId: null, clientBlockId: null, text: '粘贴的新正文' },
    ]);
    rememberPendingDraftSnapshot([
      {
        logicalBlockId: 'stable-1',
        clientBlockId: 'stable-1',
        blockType: 'paragraph',
        text: '已有正文',
        attributes: {},
      },
      {
        logicalBlockId: null,
        clientBlockId: 'temporary-paste-1',
        blockType: 'paragraph',
        text: '粘贴的新正文',
        attributes: {},
      },
    ]);

    synchronizePersistedBlockMetadata(target.editor, [
      persisted('stable-1', '已有正文'),
      persisted('server-paste-1', '粘贴的新正文'),
    ]);

    expect(target.state().doc.child(1).attrs).toMatchObject({
      logicalBlockId: 'server-paste-1',
      clientBlockId: 'server-paste-1',
      contentHash: 'hash-server-paste-1',
    });
  });

  it('does not guess identity for duplicate missing-id nodes with identical semantics', () => {
    const target = editorFor([
      { logicalBlockId: 'stable-1', clientBlockId: 'stable-1', text: '已有正文' },
      { logicalBlockId: null, clientBlockId: null, text: '相同新段落' },
      { logicalBlockId: null, clientBlockId: null, text: '相同新段落' },
    ]);
    rememberPendingDraftSnapshot([
      {
        logicalBlockId: 'stable-1',
        clientBlockId: 'stable-1',
        blockType: 'paragraph',
        text: '已有正文',
        attributes: {},
      },
      {
        logicalBlockId: null,
        clientBlockId: 'temporary-duplicate-1',
        blockType: 'paragraph',
        text: '相同新段落',
        attributes: {},
      },
      {
        logicalBlockId: null,
        clientBlockId: 'temporary-duplicate-2',
        blockType: 'paragraph',
        text: '相同新段落',
        attributes: {},
      },
    ]);

    synchronizePersistedBlockMetadata(target.editor, [
      persisted('stable-1', '已有正文'),
      persisted('server-duplicate-1', '相同新段落'),
      persisted('server-duplicate-2', '相同新段落'),
    ]);

    expect(target.state().doc.child(1).attrs.logicalBlockId).toBeNull();
    expect(target.state().doc.child(2).attrs.logicalBlockId).toBeNull();
  });
});
