import { describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type DraftSnapshotEditorBlock,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { synchronizePersistedBlockMetadata } from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();
const snapshot = (clientBlockId: string, text: string): DraftSnapshotEditorBlock => ({
  clientBlockId,
  logicalBlockId: null,
  blockType: 'paragraph',
  text,
  attributes: {},
  locked: false,
});
const persisted = (logicalBlockId: string, text: string): PersistedEditorBlock => ({
  logicalBlockId,
  blockType: 'paragraph',
  text,
  attributes: {},
  source: 'manual',
  locked: false,
  contentHash: `hash-${logicalBlockId}`,
});

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
  return {
    editor: contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
      get state() {
        return state;
      },
      view: {
        dispatch(transaction: Parameters<typeof state.apply>[0]) {
          state = state.apply(transaction);
        },
      },
    }),
    state: () => state,
  };
}

describe('save request isolation', () => {
  it('does not bind another chapter request with identical content', () => {
    const target = editorFor('chapter-b', '相同正文');
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted('server-a', '相同正文')],
        [snapshot('chapter-a', '相同正文')],
      ),
    ).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('binds the exact active chapter request', () => {
    const target = editorFor('chapter-b', '相同正文');
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted('server-b', '相同正文')],
        [snapshot('chapter-b', '相同正文')],
      ),
    ).toBe(true);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-b');
  });
});
