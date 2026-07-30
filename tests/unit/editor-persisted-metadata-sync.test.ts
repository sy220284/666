import { describe, expect, it } from 'vitest';

import {
  EditorState,
  createWorldforgeEditorSchema,
  type PersistedEditorBlock,
  type WorldforgeBlockSource,
} from '../../packages/editor-core/src/draft-document.js';
import { synchronizePersistedBlockMetadata } from '../../packages/editor-core/src/persisted-metadata-sync.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();

function persisted(
  logicalBlockId: string,
  text: string,
  overrides: Partial<PersistedEditorBlock> = {},
): PersistedEditorBlock {
  return {
    logicalBlockId,
    blockType: 'paragraph',
    text,
    attributes: {},
    source: 'manual',
    locked: false,
    contentHash: `hash-${logicalBlockId}`,
    ...overrides,
  };
}

function editorFor(
  blocks: ReadonlyArray<{
    logicalBlockId: string | null;
    clientBlockId: string;
    text: string;
    blockType?: 'paragraph' | 'dialogue' | 'heading';
    source?: WorldforgeBlockSource;
    locked?: boolean;
  }>,
) {
  let state = EditorState.create({
    doc: schema.nodeFromJSON({
      type: 'chapterDocument',
      content: blocks.map((block) => ({
        type: block.blockType ?? 'paragraph',
        attrs: {
          logicalBlockId: block.logicalBlockId,
          clientBlockId: block.clientBlockId,
          source: block.source ?? 'manual',
          locked: block.locked ?? false,
          contentHash: block.logicalBlockId ? `old-${block.logicalBlockId}` : null,
          ...(block.blockType === 'heading' ? { headingLevel: 2 } : {}),
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

describe('persisted metadata synchronization during delayed autosave', () => {
  it('assigns a new server identity only when the current block still matches the saved content', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-1', text: '保存快照' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '保存快照')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.textContent).toBe('保存快照');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-1',
      clientBlockId: 'temporary-1',
      contentHash: 'hash-server-1',
    });
  });

  it('keeps new text untouched when the editor advanced after the save request', () => {
    const target = editorFor([
      { logicalBlockId: null, clientBlockId: 'temporary-1', text: '保存后继续输入' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '保存快照')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.textContent).toBe('保存后继续输入');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: null,
      clientBlockId: 'temporary-1',
      contentHash: null,
    });
  });

  it('updates the base hash without overwriting later text, type, source or lock changes', () => {
    const target = editorFor([
      {
        logicalBlockId: 'server-1',
        clientBlockId: 'server-1',
        text: '保存期间改成对白',
        blockType: 'dialogue',
        source: 'mixed',
        locked: true,
      },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '旧段落')]),
    ).toBe(true);
    expect(target.state().doc.firstChild?.type.name).toBe('dialogue');
    expect(target.state().doc.firstChild?.textContent).toBe('保存期间改成对白');
    expect(target.state().doc.firstChild?.attrs).toMatchObject({
      contentHash: 'hash-server-1',
      source: 'mixed',
      locked: true,
    });
  });

  it('partially synchronizes stable blocks after a split and leaves the new block for the next save', () => {
    const target = editorFor([
      { logicalBlockId: 'server-1', clientBlockId: 'server-1', text: '原段落前半' },
      { logicalBlockId: null, clientBlockId: 'split-1', text: '后半' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [persisted('server-1', '原段落')]),
    ).toBe(true);
    expect(target.state().doc.childCount).toBe(2);
    expect(target.state().doc.child(0).textContent).toBe('原段落前半');
    expect(target.state().doc.child(0).attrs.contentHash).toBe('hash-server-1');
    expect(target.state().doc.child(1).textContent).toBe('后半');
    expect(target.state().doc.child(1).attrs.logicalBlockId).toBeNull();
    expect(target.state().doc.child(1).attrs.clientBlockId).toBe('split-1');
  });

  it('does not rebind reordered duplicate text by position when stable identities exist', () => {
    const target = editorFor([
      { logicalBlockId: 'server-2', clientBlockId: 'server-2', text: '相同' },
      { logicalBlockId: 'server-1', clientBlockId: 'server-1', text: '相同' },
    ]);

    expect(
      synchronizePersistedBlockMetadata(target.editor, [
        persisted('server-1', '相同'),
        persisted('server-2', '相同'),
      ]),
    ).toBe(true);
    expect(target.state().doc.child(0).attrs.logicalBlockId).toBe('server-2');
    expect(target.state().doc.child(0).attrs.contentHash).toBe('hash-server-2');
    expect(target.state().doc.child(1).attrs.logicalBlockId).toBe('server-1');
    expect(target.state().doc.child(1).attrs.contentHash).toBe('hash-server-1');
  });
});
