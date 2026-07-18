import { describe, expect, it } from 'vitest';

import {
  EditorState,
  NodeSelection,
  TextSelection,
  createWorldforgeHistoryPlugin,
  createWorldforgeEditorSchema,
  documentToTiptapJson,
  isDestructiveKeyDeferred,
  joinWorldforgeBlockBackward,
  plainTextToTiptapContent,
  redoWorldforgeCommand,
  splitWorldforgeBlock,
  tiptapJsonToDraftSnapshot,
  toggleWorldforgeBlockLock,
  undoWorldforgeCommand,
} from '../../packages/editor-core/src/index.js';

const firstId = '550e8400-e29b-41d4-a716-446655440000';
const secondId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

describe('M1-04 WorldForge editor document', () => {
  it('maps the four persisted DraftBlock types to and from the Tiptap document', () => {
    const json = documentToTiptapJson([
      {
        logicalBlockId: firstId,
        blockType: 'heading',
        text: '第一节',
        attributes: { headingLevel: 2 },
        source: 'manual',
        locked: false,
        contentHash: null,
      },
      {
        logicalBlockId: secondId,
        blockType: 'dialogue',
        text: '“我回来了。”',
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: null,
      },
      {
        logicalBlockId: '931b82aa-9c6f-4fc8-b7fd-2d201ceaa95d',
        blockType: 'separator',
        text: '',
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: null,
      },
      {
        logicalBlockId: '48ee4f14-d049-401a-8f21-991c769b1b86',
        blockType: 'paragraph',
        text: '雨落在旧站台。',
        attributes: {},
        source: 'imported',
        locked: false,
        contentHash: null,
      },
    ]);

    expect(json.content?.map((node) => node.type)).toEqual([
      'heading',
      'dialogue',
      'separator',
      'paragraph',
    ]);
    expect(tiptapJsonToDraftSnapshot(json)).toEqual([
      expect.objectContaining({ logicalBlockId: firstId, blockType: 'heading', text: '第一节' }),
      expect.objectContaining({
        logicalBlockId: secondId,
        blockType: 'dialogue',
        text: '“我回来了。”',
      }),
      expect.objectContaining({ blockType: 'separator', text: '' }),
      expect.objectContaining({ blockType: 'paragraph', text: '雨落在旧站台。' }),
    ]);
    expect(() =>
      tiptapJsonToDraftSnapshot({ type: 'chapterDocument', content: [{ type: 'blockquote' }] }),
    ).toThrow(/Unsupported editor block/);
  });

  it('keeps the left logicalBlockId on Enter and gives the right block a temporary identity', () => {
    const schema = createWorldforgeEditorSchema();
    const paragraph = schema.nodes.paragraph;
    const document = schema.nodes.chapterDocument;
    if (!paragraph || !document) throw new Error('Editor schema is incomplete.');
    let state = EditorState.create({
      doc: document.create(null, [
        paragraph.create(
          {
            logicalBlockId: firstId,
            clientBlockId: firstId,
            source: 'manual',
            locked: false,
            contentHash: null,
          },
          schema.text('甲乙'),
        ),
      ]),
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));

    expect(
      splitWorldforgeBlock(() => 'temporary-right')(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(0).attrs.logicalBlockId).toBe(firstId);
    expect(state.doc.child(1).attrs.logicalBlockId).toBeNull();
    expect(state.doc.child(1).attrs.clientBlockId).toBe('temporary-right');
    expect(state.doc.child(0).textContent).toBe('甲');
    expect(state.doc.child(1).textContent).toBe('乙');
  });

  it('keeps the preceding logicalBlockId when Backspace merges adjacent text blocks', () => {
    const schema = createWorldforgeEditorSchema();
    const paragraph = schema.nodes.paragraph;
    const document = schema.nodes.chapterDocument;
    if (!paragraph || !document) throw new Error('Editor schema is incomplete.');
    let state = EditorState.create({
      doc: document.create(null, [
        paragraph.create(
          {
            logicalBlockId: firstId,
            clientBlockId: firstId,
            source: 'manual',
            locked: false,
            contentHash: null,
          },
          schema.text('前'),
        ),
        paragraph.create(
          {
            logicalBlockId: secondId,
            clientBlockId: secondId,
            source: 'manual',
            locked: false,
            contentHash: null,
          },
          schema.text('后'),
        ),
      ]),
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)));

    expect(
      joinWorldforgeBlockBackward(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(state.doc.child(0).attrs.logicalBlockId).toBe(firstId);
    expect(state.doc.child(0).textContent).toBe('前后');
  });

  it('keeps Core-assigned metadata through local undo and redo after a saved split', () => {
    const schema = createWorldforgeEditorSchema();
    const paragraph = schema.nodes.paragraph;
    const document = schema.nodes.chapterDocument;
    if (!paragraph || !document) throw new Error('Editor schema is incomplete.');
    let state = EditorState.create({
      doc: document.create(null, [
        paragraph.create(
          {
            logicalBlockId: firstId,
            clientBlockId: firstId,
            source: 'manual',
            locked: false,
            contentHash: null,
          },
          schema.text('甲乙'),
        ),
      ]),
      plugins: [createWorldforgeHistoryPlugin()],
    });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    splitWorldforgeBlock(() => 'temporary-right')(state, (transaction) => {
      state = state.apply(transaction);
    });
    const rightPosition = state.doc.child(0).nodeSize;
    state = state.apply(
      state.tr
        .setNodeMarkup(rightPosition, undefined, {
          ...state.doc.child(1).attrs,
          logicalBlockId: secondId,
          clientBlockId: secondId,
        })
        .setMeta('addToHistory', false),
    );

    expect(
      undoWorldforgeCommand(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.childCount).toBe(1);
    expect(
      redoWorldforgeCommand(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.childCount).toBe(2);
    expect(state.doc.child(1).attrs.logicalBlockId).toBe(secondId);
    expect(state.doc.child(1).attrs.clientBlockId).toBe(secondId);
  });

  it('defers destructive keys during composition and normalizes plain-text paste', () => {
    for (const key of ['Enter', 'Backspace', 'Delete']) {
      expect(isDestructiveKeyDeferred(key, true, false)).toBe(true);
      expect(isDestructiveKeyDeferred(key, false, true)).toBe(true);
      expect(isDestructiveKeyDeferred(key, false, false)).toBe(false);
    }
    expect(isDestructiveKeyDeferred('ArrowLeft', true, true)).toBe(false);
    expect(plainTextToTiptapContent('甲\r\n乙\n\n丙').map((node) => node.type)).toEqual([
      'paragraph',
      'paragraph',
      'paragraph',
      'paragraph',
    ]);
  });

  it('toggles a selected separator block lock without requiring a text cursor', () => {
    const schema = createWorldforgeEditorSchema();
    const separator = schema.nodes.separator;
    const document = schema.nodes.chapterDocument;
    if (!separator || !document) throw new Error('Editor schema is incomplete.');
    let state = EditorState.create({
      doc: document.create(null, [
        separator.create({
          logicalBlockId: firstId,
          clientBlockId: firstId,
          source: 'manual',
          locked: false,
          contentHash: null,
        }),
      ]),
    });
    state = state.apply(state.tr.setSelection(NodeSelection.create(state.doc, 0)));

    expect(
      toggleWorldforgeBlockLock(state, (transaction) => {
        state = state.apply(transaction);
      }),
    ).toBe(true);
    expect(state.doc.child(0).attrs.locked).toBe(true);
  });

  it('round-trips one long continuous Chinese paragraph without loss or duplication', () => {
    const longText = '雨落旧站台风穿长街'.repeat(20_000);
    const json = documentToTiptapJson([
      {
        logicalBlockId: firstId,
        blockType: 'paragraph',
        text: longText,
        attributes: {},
        source: 'manual',
        locked: false,
        contentHash: null,
      },
    ]);
    const snapshot = tiptapJsonToDraftSnapshot(json);
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toMatchObject({
      logicalBlockId: firstId,
      blockType: 'paragraph',
      text: longText,
    });
    expect(snapshot[0]?.text.length).toBe(longText.length);
  });
});
