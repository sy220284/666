import { describe, expect, it, vi } from 'vitest';

import {
  EditorState,
  TextSelection,
  createWorldforgeEditorExtensions,
  createWorldforgeEditorSchema,
} from '../../packages/editor-core/src/draft-document.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

const schema = createWorldforgeEditorSchema();
const lockedAttributes = {
  logicalBlockId: 'locked-block',
  clientBlockId: 'locked-block',
  source: 'manual',
  locked: true,
  contentHash: 'locked-hash',
};
const unlockedAttributes = {
  logicalBlockId: 'open-block',
  clientBlockId: 'open-block',
  source: 'manual',
  locked: false,
  contentHash: 'open-hash',
};

type EditorPlugin = NonNullable<Parameters<typeof EditorState.create>[0]['plugins']>[number];

function paragraph(text: string, attributes: Record<string, unknown>) {
  return schema.node('paragraph', attributes, text.length > 0 ? schema.text(text) : undefined);
}

function heading(text: string, attributes: Record<string, unknown>) {
  return schema.node(
    'heading',
    { ...attributes, headingLevel: 2 },
    text.length > 0 ? schema.text(text) : undefined,
  );
}

function lockPlugin(): EditorPlugin {
  const extension = createWorldforgeEditorExtensions().find(
    (candidate) => candidate.name === 'worldforgeLockGuard',
  );
  if (!extension) throw new Error('LOCK_GUARD_EXTENSION_MISSING');
  const factory = (extension.config as { addProseMirrorPlugins?: () => unknown[] })
    .addProseMirrorPlugins;
  if (!factory) throw new Error('LOCK_GUARD_PLUGIN_FACTORY_MISSING');
  return contractInput<EditorPlugin>(factory.call(extension)[0]);
}

function editingKeymapPlugin() {
  const extension = createWorldforgeEditorExtensions(() => 'split-client').find(
    (candidate) => candidate.name === 'worldforgeEditingHistory',
  );
  if (!extension) throw new Error('EDITING_HISTORY_EXTENSION_MISSING');
  const factory = (extension.config as { addProseMirrorPlugins?: () => Array<{ props?: object }> })
    .addProseMirrorPlugins;
  if (!factory) throw new Error('EDITING_HISTORY_PLUGIN_FACTORY_MISSING');
  const plugin = factory
    .call(extension)
    .find((candidate) =>
      Boolean((candidate.props as { handleKeyDown?: unknown } | undefined)?.handleKeyDown),
    );
  if (!plugin) throw new Error('EDITOR_KEYMAP_PLUGIN_MISSING');
  return plugin as {
    props: {
      handleKeyDown: (view: unknown, event: unknown) => boolean;
    };
  };
}

function guardedState(first = paragraph('锁定正文', lockedAttributes)) {
  const doc = schema.node('chapterDocument', null, [
    first,
    paragraph('开放正文', unlockedAttributes),
  ]);
  return EditorState.create({ schema, doc, plugins: [lockPlugin()] });
}

function accepted(state: EditorState, transaction: EditorState['tr']) {
  const result = state.applyTransaction(transaction);
  return { accepted: result.transactions.length > 0, state: result.state };
}

describe('Editor Lock Guard plugin regression coverage', () => {
  it('rejects deleting or editing locked content', () => {
    const state = guardedState();
    const lockedSize = state.doc.child(0).nodeSize;

    expect(accepted(state, state.tr.delete(0, lockedSize)).accepted).toBe(false);
    expect(accepted(state, state.tr.insertText('改', 1, 2)).accepted).toBe(false);
  });

  it('rejects changing locked type, source, heading level or lock state without command metadata', () => {
    const state = guardedState(heading('锁定标题', lockedAttributes));
    const attributes = state.doc.child(0).attrs;

    expect(
      accepted(
        state,
        state.tr.setNodeMarkup(0, schema.nodes.paragraph, {
          ...attributes,
          headingLevel: undefined,
        }),
      ).accepted,
    ).toBe(false);
    expect(
      accepted(state, state.tr.setNodeMarkup(0, undefined, { ...attributes, source: 'ai' }))
        .accepted,
    ).toBe(false);
    expect(
      accepted(state, state.tr.setNodeMarkup(0, undefined, { ...attributes, headingLevel: 3 }))
        .accepted,
    ).toBe(false);
    expect(
      accepted(state, state.tr.setNodeMarkup(0, undefined, { ...attributes, locked: false }))
        .accepted,
    ).toBe(false);
  });

  it('rejects moving a locked block across another persisted block', () => {
    const state = guardedState();
    const locked = state.doc.child(0);
    const transaction = state.tr.delete(0, locked.nodeSize);
    transaction.insert(transaction.doc.content.size, locked);
    expect(accepted(state, transaction).accepted).toBe(false);
  });

  it('allows explicit lock toggles and ordinary edits to unlocked blocks', () => {
    const state = guardedState();
    const unlockedStart = state.doc.child(0).nodeSize + 1;
    const edited = accepted(state, state.tr.insertText('改', unlockedStart, unlockedStart + 1));
    expect(edited.accepted).toBe(true);
    expect(edited.state.doc.child(1).textContent).toContain('改');

    const attributes = state.doc.child(0).attrs;
    const toggle = state.tr
      .setNodeMarkup(0, undefined, { ...attributes, locked: false })
      .setMeta('worldforgeLockCommand', true);
    const toggled = accepted(state, toggle);
    expect(toggled.accepted).toBe(true);
    expect(toggled.state.doc.child(0).attrs.locked).toBe(false);
  });
});

describe('Editor composition-safe keymap plugin regression coverage', () => {
  function event(key: string, keyCode: number) {
    return {
      key,
      keyCode,
      which: keyCode,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    };
  }

  function view(composing: boolean) {
    const doc = schema.node('chapterDocument', null, [
      paragraph('甲乙', {
        ...unlockedAttributes,
        logicalBlockId: 'block-1',
        clientBlockId: 'block-1',
      }),
    ]);
    let state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, 2),
    });
    return {
      get state() {
        return state;
      },
      composing,
      dispatch(transaction: EditorState['tr']) {
        state = state.apply(transaction);
      },
    };
  }

  it.each([
    ['Enter', 13],
    ['Backspace', 8],
    ['Delete', 46],
  ] as const)('defers %s while the editor view is composing', (key, keyCode) => {
    const editorView = view(true);
    const handled = editingKeymapPlugin().props.handleKeyDown(editorView, event(key, keyCode));
    expect(handled).toBe(false);
    expect(editorView.state.doc.childCount).toBe(1);
    expect(editorView.state.doc.textContent).toBe('甲乙');
  });

  it('executes Enter normally after composition ends and resets split metadata', () => {
    const editorView = view(false);
    const handled = editingKeymapPlugin().props.handleKeyDown(editorView, event('Enter', 13));
    expect(handled).toBe(true);
    expect(editorView.state.doc.childCount).toBe(2);
    expect(editorView.state.doc.child(1).attrs).toMatchObject({
      logicalBlockId: null,
      clientBlockId: 'split-client',
      locked: false,
      contentHash: null,
    });
  });
});
