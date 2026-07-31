import { beforeEach, describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import {
  rememberPendingDraftSnapshot,
  resetPendingDraftSnapshotsForTests,
  synchronizePersistedBlockMetadata,
} from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

function snapshot(clientBlockId: string, text: string): DraftSnapshotEditorBlock {
  return {
    clientBlockId,
    logicalBlockId: null,
    blockType: 'paragraph',
    text,
    attributes: {},
    locked: false,
  };
}

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

function editorFor(clientBlockId: string, text: string) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: [
        {
          type: 'paragraph',
          attrs: {
            logicalBlockId: null,
            clientBlockId,
            source: 'manual',
            locked: false,
            contentHash: null,
          },
          content: [{ type: 'text', text }],
        },
      ],
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

describe('delayed autosave snapshot isolation', () => {
  it('selects the snapshot whose client identity belongs to the active editor', () => {
    rememberPendingDraftSnapshot([snapshot('chapter-a-block', '相同正文')]);
    rememberPendingDraftSnapshot([snapshot('chapter-b-block', '相同正文')]);
    const active = editorFor('chapter-b-block', '相同正文');

    synchronizePersistedBlockMetadata(active.editor, [persisted('server-b', '相同正文')]);

    expect(active.state().doc.firstChild?.attrs).toMatchObject({
      clientBlockId: 'chapter-b-block',
      logicalBlockId: 'server-b',
      contentHash: 'hash-server-b',
    });
  });

  it('does not consume or bind a same-content snapshot from another chapter', () => {
    rememberPendingDraftSnapshot([snapshot('chapter-a-block', '相同正文')]);
    const active = editorFor('chapter-b-block', '相同正文');

    synchronizePersistedBlockMetadata(active.editor, [persisted('server-a', '相同正文')]);

    expect(active.state().doc.firstChild?.attrs).toMatchObject({
      clientBlockId: 'chapter-b-block',
      logicalBlockId: null,
      contentHash: null,
    });
  });

  it('prefers the newest response-compatible snapshot when client identities tie', () => {
    rememberPendingDraftSnapshot([snapshot('stable-client', '相同正文')]);
    rememberPendingDraftSnapshot([snapshot('stable-client', '相同正文')]);
    const active = editorFor('stable-client', '相同正文');

    synchronizePersistedBlockMetadata(active.editor, [persisted('server-newest', '相同正文')]);

    expect(active.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-newest');
  });
});
