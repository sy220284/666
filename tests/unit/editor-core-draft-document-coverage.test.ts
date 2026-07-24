import { describe, expect, it, vi } from 'vitest';

import {
  EditorState,
  TextSelection,
  assertEditorNodeMetadata,
  createWorldforgeEditorExtensions,
  createWorldforgeEditorSchema,
  documentToTiptapJson,
  isDestructiveKeyDeferred,
  joinWorldforgeBlockBackward,
  plainTextToTiptapContent,
  redoWorldforgeEditor,
  selectedWorldforgeBlockLocked,
  splitWorldforgeBlock,
  synchronizePersistedBlockMetadata,
  tiptapJsonToDraftSnapshot,
  toggleWorldforgeBlockLock,
  toggleWorldforgeEditorBlockLock,
  undoWorldforgeEditor,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const persisted = (
  logicalBlockId: string,
  overrides: Partial<PersistedEditorBlock> = {},
): PersistedEditorBlock => ({
  logicalBlockId,
  blockType: 'paragraph',
  text: '正文',
  attributes: {},
  source: 'manual',
  locked: false,
  contentHash: null,
  ...overrides,
});

describe('Editor Core draft document conversion coverage', () => {
  it('creates fallback and complete Tiptap JSON for every block type', () => {
    const empty = documentToTiptapJson([]);
    expect(empty.type).toBe('chapterDocument');
    expect(empty.content).toHaveLength(1);
    expect(empty.content?.[0]).toMatchObject({ type: 'paragraph', attrs: { locked: false } });

    const document = documentToTiptapJson([
      persisted('p', { text: '段落' }),
      persisted('d', { blockType: 'dialogue', text: '对白', source: 'ai' }),
      persisted('h', {
        blockType: 'heading',
        text: '标题',
        attributes: { headingLevel: 4 },
        source: 'mixed',
        locked: true,
        contentHash: 'hash',
      }),
      persisted('s', { blockType: 'separator', text: 'ignored', source: 'imported' }),
    ]);
    expect(document.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'dialogue',
      'heading',
      'separator',
    ]);
    expect(document.content?.[2]?.attrs).toMatchObject({ headingLevel: 4, locked: true });
    expect(document.content?.[3]?.content).toBeUndefined();
  });

  it('round-trips supported blocks and repairs missing client IDs and heading metadata', () => {
    let generated = 0;
    const snapshot = tiptapJsonToDraftSnapshot(
      {
        type: 'chapterDocument',
        content: [
          {
            type: 'heading',
            attrs: { logicalBlockId: 'h', headingLevel: 6, locked: true },
            content: [{ type: 'text', text: '题' }],
          },
          {
            type: 'paragraph',
            attrs: { clientBlockId: '', logicalBlockId: '' },
            content: [
              { type: 'text', text: '甲' },
              { type: 'span', content: [{ type: 'text', text: '乙' }] },
            ],
          },
          {
            type: 'separator',
            attrs: { clientBlockId: 'separator-client', headingLevel: 99 },
            content: [{ type: 'text', text: 'ignored' }],
          },
        ],
      },
      () => `generated-${++generated}`,
    );
    expect(snapshot).toEqual([
      {
        clientBlockId: 'h',
        logicalBlockId: 'h',
        blockType: 'heading',
        text: '题',
        attributes: { headingLevel: 6 },
        locked: true,
      },
      {
        clientBlockId: 'generated-1',
        logicalBlockId: null,
        blockType: 'paragraph',
        text: '甲乙',
        attributes: {},
        locked: false,
      },
      {
        clientBlockId: 'separator-client',
        logicalBlockId: null,
        blockType: 'separator',
        text: '',
        attributes: {},
        locked: false,
      },
    ]);
  });

  it('rejects empty, wrong-root and unsupported editor documents', () => {
    expect(() => tiptapJsonToDraftSnapshot({ type: 'paragraph', content: [] })).toThrow(
      'must contain at least one supported block',
    );
    expect(() => tiptapJsonToDraftSnapshot({ type: 'chapterDocument' })).toThrow(RangeError);
    expect(() =>
      tiptapJsonToDraftSnapshot({
        type: 'chapterDocument',
        content: [{ type: 'table' }],
      }),
    ).toThrow('Unsupported editor block: table');
    expect(() =>
      tiptapJsonToDraftSnapshot({
        type: 'chapterDocument',
        content: [{ attrs: {} }],
      }),
    ).toThrow('Unsupported editor block: unknown');
  });

  it('normalizes CRLF, CR, empty text and deterministic client IDs', () => {
    let index = 0;
    const content = plainTextToTiptapContent('甲\r\n乙\r丙\n', () => `client-${++index}`);
    expect(content.map((node) => node.content?.[0]?.text ?? '')).toEqual(['甲', '乙', '丙', '']);
    expect(content.map((node) => node.attrs?.clientBlockId)).toEqual([
      'client-1',
      'client-2',
      'client-3',
      'client-4',
    ]);
  });

  it('validates block, source and locked metadata independently', () => {
    expect(() => assertEditorNodeMetadata({ type: 'chapterDocument' })).not.toThrow();
    expect(() =>
      assertEditorNodeMetadata({ type: 'chapterDocument', content: [{ type: 'unknown' }] }),
    ).toThrow('Unsupported editor block');
    expect(() =>
      assertEditorNodeMetadata({
        type: 'chapterDocument',
        content: [{ type: 'paragraph', attrs: { source: 'cloud' } }],
      }),
    ).toThrow('Unsupported editor source');
    expect(() =>
      assertEditorNodeMetadata({
        type: 'chapterDocument',
        content: [{ type: 'paragraph', attrs: { source: 'manual', locked: 'yes' } }],
      }),
    ).toThrow('locked metadata must be boolean');
    expect(() =>
      assertEditorNodeMetadata({
        type: 'chapterDocument',
        content: [{ type: 'paragraph', attrs: { source: 'ai', locked: false } }],
      }),
    ).not.toThrow();
  });
});

describe('Editor Core draft command and metadata coverage', () => {
  const schema = createWorldforgeEditorSchema();

  function stateFor(
    options: {
      id?: string | null;
      locked?: boolean;
      source?: string;
      text?: string;
      blockType?: 'paragraph' | 'dialogue' | 'heading';
    } = {},
  ) {
    const blockType = options.blockType ?? 'paragraph';
    const doc = schema.nodeFromJSON({
      type: 'chapterDocument',
      content: [
        {
          type: blockType,
          attrs: {
            logicalBlockId: options.id === undefined ? 'block-1' : options.id,
            clientBlockId: 'client-1',
            source: options.source ?? 'manual',
            locked: options.locked ?? false,
            contentHash: 'hash',
            ...(blockType === 'heading' ? { headingLevel: 2 } : {}),
          },
          content: [{ type: 'text', text: options.text ?? '正文' }],
        },
      ],
    });
    return EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
  }

  it('builds schema and editor extensions with all block nodes and plugins', () => {
    expect(schema.topNodeType.name).toBe('chapterDocument');
    expect(Object.keys(schema.nodes)).toEqual(
      expect.arrayContaining(['paragraph', 'dialogue', 'heading', 'separator', 'text']),
    );
    const extensions = createWorldforgeEditorExtensions(() => 'split-client');
    expect(extensions).toHaveLength(8);
  });

  it('toggles a selected persisted block with and without dispatch', () => {
    const state = stateFor();
    expect(toggleWorldforgeBlockLock(state)).toBe(true);
    let next = state;
    expect(
      toggleWorldforgeBlockLock(state, (transaction) => {
        next = state.apply(transaction);
      }),
    ).toBe(true);
    expect(next.doc.firstChild?.attrs.locked).toBe(true);
    expect(
      selectedWorldforgeBlockLocked(
        contractInput<Parameters<typeof selectedWorldforgeBlockLocked>[0]>({ state: next }),
      ),
    ).toBe(true);

    const editor = {
      state: next,
      view: {
        dispatch: vi.fn((transaction) => {
          next = next.apply(transaction);
        }),
      },
    };
    expect(
      toggleWorldforgeEditorBlockLock(
        contractInput<Parameters<typeof toggleWorldforgeEditorBlockLock>[0]>(editor),
      ),
    ).toBe(true);
    expect(next.doc.firstChild?.attrs.locked).toBe(false);
  });

  it('returns false/null when selection has no persisted supported block', () => {
    const state = stateFor({ id: null });
    expect(toggleWorldforgeBlockLock(state)).toBe(false);
    expect(
      selectedWorldforgeBlockLocked(
        contractInput<Parameters<typeof selectedWorldforgeBlockLocked>[0]>({ state }),
      ),
    ).toBeNull();
  });

  it('defers destructive keys only during composition', () => {
    expect(isDestructiveKeyDeferred('Enter', true, false)).toBe(true);
    expect(isDestructiveKeyDeferred('Backspace', false, true)).toBe(true);
    expect(isDestructiveKeyDeferred('Delete', true, true)).toBe(true);
    expect(isDestructiveKeyDeferred('a', true, true)).toBe(false);
    expect(isDestructiveKeyDeferred('Enter', false, false)).toBe(false);
  });

  it('splits supported text blocks with reset metadata and rejects invalid selection state', () => {
    const state = stateFor({ source: 'ai', text: '甲乙' });
    const selectionState = EditorState.create({
      doc: state.doc,
      selection: TextSelection.create(state.doc, 2),
    });
    let next = selectionState;
    const split = splitWorldforgeBlock(() => 'split-client');
    expect(
      split(selectionState, (transaction) => {
        next = selectionState.apply(transaction);
      }),
    ).toBe(true);
    expect(next.doc.childCount).toBe(2);
    expect(next.doc.child(1).attrs).toMatchObject({
      logicalBlockId: null,
      clientBlockId: 'split-client',
      source: 'mixed',
      locked: false,
      contentHash: null,
    });

    const nonEmptySelection = EditorState.create({
      doc: state.doc,
      selection: TextSelection.create(state.doc, 1, 2),
    });
    expect(joinWorldforgeBlockBackward(nonEmptySelection)).toBe(false);
  });

  it('synchronizes persisted metadata and rejects count/type mismatches', () => {
    let state = stateFor();
    const editor = {
      get state() {
        return state;
      },
      view: {
        dispatch(transaction: Parameters<typeof state.apply>[0]) {
          state = state.apply(transaction);
        },
      },
    };
    const synchronizedEditor = contractInput<
      Parameters<typeof synchronizePersistedBlockMetadata>[0]
    >(editor);
    expect(
      synchronizePersistedBlockMetadata(synchronizedEditor, [
        persisted('server-id', { source: 'imported', locked: true, contentHash: 'server-hash' }),
      ]),
    ).toBe(true);
    expect(state.doc.firstChild?.attrs).toMatchObject({
      logicalBlockId: 'server-id',
      clientBlockId: 'server-id',
      source: 'imported',
      locked: true,
      contentHash: 'server-hash',
    });
    expect(synchronizePersistedBlockMetadata(synchronizedEditor, [])).toBe(false);
    expect(
      synchronizePersistedBlockMetadata(synchronizedEditor, [
        persisted('server-id', { blockType: 'heading' }),
      ]),
    ).toBe(false);
  });

  it('wraps history commands without requiring a history item', () => {
    const state = stateFor();
    const editor = { state, view: { dispatch: vi.fn() } };
    expect(
      undoWorldforgeEditor(contractInput<Parameters<typeof undoWorldforgeEditor>[0]>(editor)),
    ).toBe(false);
    expect(
      redoWorldforgeEditor(contractInput<Parameters<typeof redoWorldforgeEditor>[0]>(editor)),
    ).toBe(false);
  });
});
