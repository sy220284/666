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

function saved(
  clientBlockId: string,
  logicalBlockId: string | null,
  text: string,
): DraftSnapshotEditorBlock {
  return {
    clientBlockId,
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    locked: false,
  };
}

function persisted(
  logicalBlockId: string,
  text: string,
  clientBlockId?: string,
): PersistedEditorBlock {
  return {
    logicalBlockId,
    ...(clientBlockId ? { clientBlockId } : {}),
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked: false,
    contentHash: `hash-${logicalBlockId}`,
  };
}

function editorFor(blocks: readonly DraftSnapshotEditorBlock[]) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: block.blockType,
        attrs: {
          logicalBlockId: block.logicalBlockId,
          clientBlockId: block.clientBlockId,
          source: 'manual',
          locked: block.locked,
          contentHash: block.logicalBlockId ? `old-${block.logicalBlockId}` : null,
        },
        content: block.text ? [{ type: 'text', text: block.text }] : undefined,
      })),
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

describe('request-bound persisted metadata synchronization', () => {
  it('maps duplicate reordered text by the exact request client identity', () => {
    const request = [saved('client-a', null, '相同'), saved('client-b', null, '相同')];
    const target = editorFor([saved('client-b', null, '相同'), saved('client-a', null, '相同')]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted('server-a', '相同', 'client-a'), persisted('server-b', '相同', 'client-b')],
        request,
      ),
    ).toBe(true);
    expect(target.state().doc.child(0).attrs.logicalBlockId).toBe('server-b');
    expect(target.state().doc.child(1).attrs.logicalBlockId).toBe('server-a');
  });

  it('keeps later text while attaching the persisted identity from the same request', () => {
    const request = [saved('client-a', null, '保存快照')];
    const target = editorFor([saved('client-a', null, '保存后继续输入')]);
    synchronizePersistedBlockMetadata(
      target.editor,
      [persisted('server-a', '保存快照', 'client-a')],
      request,
    );
    expect(target.state().doc.firstChild?.textContent).toBe('保存后继续输入');
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBe('server-a');
  });

  it('rejects a response that does not match the explicit request snapshot', () => {
    const target = editorFor([saved('client-new', null, '新请求')]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted('server-old', '旧请求', 'client-old')],
        [saved('client-old', null, '旧请求')],
      ),
    ).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });

  it('does not guess an identity for a node without a stable client id', () => {
    const target = editorFor([saved('', null, '粘贴正文')]);
    expect(
      synchronizePersistedBlockMetadata(
        target.editor,
        [persisted('server-a', '粘贴正文', 'request-client')],
        [saved('request-client', null, '粘贴正文')],
      ),
    ).toBe(false);
    expect(target.state().doc.firstChild?.attrs.logicalBlockId).toBeNull();
  });
});
