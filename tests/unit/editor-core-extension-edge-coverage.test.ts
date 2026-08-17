import { describe, expect, it, vi } from 'vitest';

import {
  EditorState,
  NodeSelection,
  TextSelection,
  createWorldforgeClientIdentityPlugin,
  createWorldforgeEditorExtensions,
  createWorldforgeEditorSchema,
  documentToTiptapJson,
  synchronizePersistedBlockMetadata,
  assertEditorNodeMetadata,
  tiptapJsonToDraftSnapshot,
  type PersistedEditorBlock,
} from '../../packages/editor-core/src/draft-document.js';
import { contractInput } from '../testkit/strict-test-doubles.js';

interface AttributeDefinition {
  readonly parseHTML?: (element: {
    getAttribute(name: string): string | null;
    tagName?: string;
  }) => unknown;
  readonly renderHTML?: (attributes: Record<string, unknown>) => Record<string, string>;
}

interface NodeExtensionConfig {
  readonly addAttributes?: () => Record<string, AttributeDefinition>;
  readonly parseHTML?: () => unknown;
  readonly renderHTML?: (input: {
    node: { attrs: Record<string, unknown> };
    HTMLAttributes: Record<string, unknown>;
  }) => unknown;
  readonly addProseMirrorPlugins?: () => Array<{
    readonly spec: {
      readonly filterTransaction?: (transaction: EditorState['tr'], state: EditorState) => boolean;
    };
  }>;
}

function extension(name: string) {
  const value = createWorldforgeEditorExtensions(() => 'factory-client').find(
    (candidate) => candidate.name === name,
  );
  if (!value) throw new Error(`Missing extension: ${name}`);
  return value;
}

function config(name: string): NodeExtensionConfig {
  return contractInput<NodeExtensionConfig>(extension(name).config);
}

function attributes(name: string): Record<string, AttributeDefinition> {
  const value = extension(name);
  const addAttributes = contractInput<NodeExtensionConfig>(value.config).addAttributes;
  if (!addAttributes) throw new Error(`Missing attributes: ${name}`);
  return addAttributes.call(value);
}

describe('editor core extension edge coverage', () => {
  it('executes every block attribute parser and renderer with present and missing metadata', () => {
    const attrs = attributes('paragraph');
    const element = {
      getAttribute: vi.fn((name: string) => {
        const values: Record<string, string> = {
          'data-logical-block-id': 'logical',
          'data-client-block-id': 'client',
          'data-source': 'ai',
          'data-locked': 'true',
          'data-content-hash': 'hash',
        };
        return values[name] ?? null;
      }),
    };

    expect(attrs.logicalBlockId?.parseHTML?.(element)).toBe('logical');
    expect(attrs.logicalBlockId?.renderHTML?.({ logicalBlockId: 'logical' })).toEqual({
      'data-logical-block-id': 'logical',
    });
    expect(attrs.logicalBlockId?.renderHTML?.({ logicalBlockId: null })).toEqual({});

    expect(attrs.clientBlockId?.parseHTML?.(element)).toBe('client');
    expect(attrs.clientBlockId?.renderHTML?.({ clientBlockId: 'client' })).toEqual({
      'data-client-block-id': 'client',
    });
    expect(attrs.clientBlockId?.renderHTML?.({})).toEqual({});

    expect(attrs.source?.parseHTML?.(element)).toBe('ai');
    expect(attrs.source?.parseHTML?.({ getAttribute: () => null })).toBe('manual');
    expect(attrs.source?.renderHTML?.({ source: 'mixed' })).toEqual({ 'data-source': 'mixed' });
    expect(attrs.source?.renderHTML?.({ source: 7 })).toEqual({ 'data-source': 'manual' });

    expect(attrs.locked?.parseHTML?.(element)).toBe(true);
    expect(attrs.locked?.parseHTML?.({ getAttribute: () => 'false' })).toBe(false);
    expect(attrs.locked?.renderHTML?.({ locked: true })).toEqual({
      'data-locked': 'true',
      'aria-label': '已锁定正文块',
    });
    expect(attrs.locked?.renderHTML?.({ locked: false })).toEqual({ 'data-locked': 'false' });

    expect(attrs.contentHash?.parseHTML?.(element)).toBe('hash');
    expect(attrs.contentHash?.renderHTML?.({ contentHash: 'hash' })).toEqual({
      'data-content-hash': 'hash',
    });
    expect(attrs.contentHash?.renderHTML?.({ contentHash: null })).toEqual({});
  });

  it('executes block parse/render hooks and heading fallbacks', () => {
    for (const name of ['paragraph', 'dialogue', 'separator'] as const) {
      const nodeConfig = config(name);
      expect(nodeConfig.parseHTML?.()).toBeDefined();
      expect(
        nodeConfig.renderHTML?.({ node: { attrs: {} }, HTMLAttributes: { class: 'x' } }),
      ).toBeDefined();
    }

    const heading = extension('heading');
    const headingConfig = contractInput<NodeExtensionConfig>(heading.config);
    const headingAttributes = headingConfig.addAttributes?.call(heading);
    if (!headingAttributes?.headingLevel) throw new Error('Missing heading attributes.');
    expect(
      headingAttributes.headingLevel.parseHTML?.({ getAttribute: () => null, tagName: 'H5' }),
    ).toBe(5);
    expect(
      headingAttributes.headingLevel.parseHTML?.({ getAttribute: () => null, tagName: 'H9' }),
    ).toBe(2);
    expect(headingAttributes.headingLevel.parseHTML?.({ getAttribute: () => null })).toBe(2);
    expect(headingAttributes.headingLevel.renderHTML?.({})).toEqual({});
    expect(headingConfig.parseHTML?.()).toHaveLength(6);
    expect(
      headingConfig.renderHTML?.({ node: { attrs: { headingLevel: 3 } }, HTMLAttributes: {} }),
    ).toEqual(['h3', { 'data-block-type': 'heading' }, 0]);
    expect(
      headingConfig.renderHTML?.({ node: { attrs: { headingLevel: 99 } }, HTMLAttributes: {} }),
    ).toEqual(['h2', { 'data-block-type': 'heading' }, 0]);
  });

  it('covers client identity exhaustion and the lock guard no-op transaction path', () => {
    const schema = createWorldforgeEditorSchema();
    const paragraph = schema.nodes.paragraph;
    const document = schema.nodes.chapterDocument;
    if (!paragraph || !document) throw new Error('Incomplete editor schema.');

    const identity = createWorldforgeClientIdentityPlugin(() => 'duplicate');
    const doc = document.create(null, [
      paragraph.create({ clientBlockId: 'duplicate', logicalBlockId: 'one' }, schema.text('甲')),
      paragraph.create({ clientBlockId: null, logicalBlockId: 'two' }, schema.text('乙')),
    ]);
    const identityState = EditorState.create({ doc, plugins: [identity] });
    expect(() => identityState.applyTransaction(identityState.tr.setMeta('noop', true))).toThrow(
      'Unable to assign a unique editor clientBlockId.',
    );

    const lockExtension = extension('worldforgeLockGuard');
    const lockFactory = contractInput<NodeExtensionConfig>(
      lockExtension.config,
    ).addProseMirrorPlugins;
    if (!lockFactory) throw new Error('Missing lock plugin factory.');
    const lockPlugin = lockFactory.call(lockExtension)[0];
    const filter = lockPlugin?.spec.filterTransaction;
    if (!filter) throw new Error('Missing transaction filter.');
    const state = EditorState.create({
      doc: document.create(null, [
        paragraph.create({ clientBlockId: 'one', logicalBlockId: 'one' }, schema.text('甲')),
      ]),
      selection: TextSelection.create(
        document.create(null, [
          paragraph.create({ clientBlockId: 'one', logicalBlockId: 'one' }, schema.text('甲')),
        ]),
        1,
      ),
    });
    expect(filter(state.tr.setMeta('noop', true), state)).toBe(true);

    const identityExtension = extension('worldforgeClientIdentity');
    const identityFactory = contractInput<NodeExtensionConfig>(
      identityExtension.config,
    ).addProseMirrorPlugins;
    expect(identityFactory?.call(identityExtension)).toHaveLength(1);
  });
  it('covers lock guard documents with missing ids and editor JSON fallback metadata', () => {
    const schema = createWorldforgeEditorSchema();
    const paragraph = schema.nodes.paragraph;
    const heading = schema.nodes.heading;
    const document = schema.nodes.chapterDocument;
    if (!paragraph || !heading || !document) throw new Error('Incomplete editor schema.');

    const lockExtension = extension('worldforgeLockGuard');
    const lockFactory = contractInput<NodeExtensionConfig>(
      lockExtension.config,
    ).addProseMirrorPlugins;
    if (!lockFactory) throw new Error('Missing lock plugin factory.');
    const filter = lockFactory.call(lockExtension)[0]?.spec.filterTransaction;
    if (!filter) throw new Error('Missing transaction filter.');

    const missingUnlocked = document.create(null, [
      paragraph.create(
        { clientBlockId: 'missing', logicalBlockId: null, locked: false },
        schema.text('甲'),
      ),
      paragraph.create(
        { clientBlockId: 'open', logicalBlockId: 'open', locked: false },
        schema.text('乙'),
      ),
    ]);
    const unlockedState = EditorState.create({ doc: missingUnlocked });
    expect(filter(unlockedState.tr.insertText('改', 4, 5), unlockedState)).toBe(true);

    const missingLocked = document.create(null, [
      paragraph.create(
        { clientBlockId: 'locked', logicalBlockId: null, locked: true },
        schema.text('甲'),
      ),
      paragraph.create(
        { clientBlockId: 'open', logicalBlockId: 'open', locked: false },
        schema.text('乙'),
      ),
    ]);
    const lockedState = EditorState.create({ doc: missingLocked });
    expect(filter(lockedState.tr.insertText('改', 4, 5), lockedState)).toBe(false);

    expect(
      tiptapJsonToDraftSnapshot(
        {
          type: 'chapterDocument',
          content: [
            { type: 'paragraph' },
            { type: 'heading', attrs: {}, content: [{ type: 'text' }] },
          ],
        },
        () => 'generated',
      ),
    ).toEqual([
      expect.objectContaining({ clientBlockId: 'generated', text: '' }),
      expect.objectContaining({ clientBlockId: 'generated', attributes: {}, text: '' }),
    ]);
  });

  it('covers keymap Enter fallback and persisted heading defaults', () => {
    const schema = createWorldforgeEditorSchema();
    const separator = schema.nodes.separator;
    const document = schema.nodes.chapterDocument;
    if (!separator || !document) throw new Error('Incomplete editor schema.');
    const separatorDoc = document.create(null, [
      separator.create({ logicalBlockId: 'separator', clientBlockId: 'separator' }),
    ]);
    const separatorState = EditorState.create({
      doc: separatorDoc,
      selection: NodeSelection.create(separatorDoc, 0),
    });
    const editing = extension('worldforgeEditingHistory');
    const pluginFactory = contractInput<NodeExtensionConfig>(editing.config).addProseMirrorPlugins;
    const keymapPlugin = pluginFactory
      ?.call(editing)
      .find((plugin) =>
        Boolean(
          contractInput<{ props?: { handleKeyDown?: unknown } }>(plugin).props?.handleKeyDown,
        ),
      );
    const handleKeyDown = contractInput<{
      props: { handleKeyDown: (view: unknown, event: unknown) => boolean };
    }>(keymapPlugin).props.handleKeyDown;
    expect(
      handleKeyDown(
        contractInput({ state: separatorState, composing: false, dispatch: vi.fn() }),
        contractInput({ key: 'Enter', keyCode: 13, which: 13 }),
      ),
    ).toBe(true);

    const heading = schema.nodes.heading;
    if (!heading) throw new Error('Missing heading node.');
    let state = EditorState.create({
      doc: document.create(null, [
        heading.create(
          {
            logicalBlockId: 'heading',
            clientBlockId: 'heading',
            source: 'manual',
            locked: false,
            contentHash: null,
            headingLevel: 4,
          },
          schema.text('标题'),
        ),
      ]),
    });
    const editor = contractInput<Parameters<typeof synchronizePersistedBlockMetadata>[0]>({
      get state() {
        return state;
      },
      view: {
        dispatch(transaction: EditorState['tr']) {
          state = state.apply(transaction);
        },
      },
    });
    const persisted: PersistedEditorBlock = {
      logicalBlockId: 'heading',
      blockType: 'heading',
      text: '标题',
      attributes: {},
      source: 'manual',
      locked: false,
      contentHash: null,
    };
    expect(synchronizePersistedBlockMetadata(editor, [persisted])).toBe(true);
    expect(state.doc.firstChild?.attrs.headingLevel).toBe(2);

    expect(
      documentToTiptapJson([
        {
          logicalBlockId: 'heading-default',
          blockType: 'heading',
          text: '默认标题',
          attributes: {},
          source: 'manual',
          locked: false,
          contentHash: null,
        },
      ]).content?.[0]?.attrs?.headingLevel,
    ).toBe(2);
    expect(() => assertEditorNodeMetadata({ content: [{}] })).toThrow(
      'Unsupported editor block: unknown',
    );
  });
});
