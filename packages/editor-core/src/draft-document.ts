import { Editor, Extension, Node, getSchema, type JSONContent } from '@tiptap/core';
import { baseKeymap, joinBackward, splitBlockAs } from '@tiptap/pm/commands';
import { history, redo, undo } from '@tiptap/pm/history';
import { keymap } from '@tiptap/pm/keymap';
import type { Node as ProseMirrorNode, Schema } from '@tiptap/pm/model';
import { Plugin, type Command } from '@tiptap/pm/state';

export { EditorState, TextSelection } from '@tiptap/pm/state';
export { Editor };

export type WorldforgeBlockType = 'paragraph' | 'dialogue' | 'heading' | 'separator';
export type WorldforgeBlockSource = 'manual' | 'ai' | 'mixed' | 'imported';

export interface WorldforgeBlockAttributes {
  readonly headingLevel?: number | undefined;
}

export interface PersistedEditorBlock {
  readonly logicalBlockId: string;
  readonly blockType: WorldforgeBlockType;
  readonly text: string;
  readonly attributes: WorldforgeBlockAttributes;
  readonly source: WorldforgeBlockSource;
  readonly locked: boolean;
  readonly contentHash: string | null;
}

export interface DraftSnapshotEditorBlock {
  readonly clientBlockId: string;
  readonly logicalBlockId: string | null;
  readonly blockType: WorldforgeBlockType;
  readonly text: string;
  readonly attributes: WorldforgeBlockAttributes;
  readonly locked?: boolean | undefined;
}

const supportedBlockTypes = new Set<WorldforgeBlockType>([
  'paragraph',
  'dialogue',
  'heading',
  'separator',
]);
const supportedSources = new Set<WorldforgeBlockSource>(['manual', 'ai', 'mixed', 'imported']);
const LOCK_COMMAND_META = 'worldforgeLockCommand';

function blockAttributes() {
  return {
    logicalBlockId: {
      default: null,
      keepOnSplit: false,
      parseHTML: (element: { getAttribute(name: string): string | null }) =>
        element.getAttribute('data-logical-block-id'),
      renderHTML: (attributes: Record<string, unknown>) =>
        typeof attributes.logicalBlockId === 'string'
          ? { 'data-logical-block-id': attributes.logicalBlockId }
          : {},
    },
    clientBlockId: {
      default: null,
      keepOnSplit: false,
      parseHTML: (element: { getAttribute(name: string): string | null }) =>
        element.getAttribute('data-client-block-id'),
      renderHTML: (attributes: Record<string, unknown>) =>
        typeof attributes.clientBlockId === 'string'
          ? { 'data-client-block-id': attributes.clientBlockId }
          : {},
    },
    source: {
      default: 'manual',
      parseHTML: (element: { getAttribute(name: string): string | null }) =>
        element.getAttribute('data-source') ?? 'manual',
      renderHTML: (attributes: Record<string, unknown>) => ({
        'data-source': typeof attributes.source === 'string' ? attributes.source : 'manual',
      }),
    },
    locked: {
      default: false,
      parseHTML: (element: { getAttribute(name: string): string | null }) =>
        element.getAttribute('data-locked') === 'true',
      renderHTML: (attributes: Record<string, unknown>) => ({
        'data-locked': attributes.locked === true ? 'true' : 'false',
        ...(attributes.locked === true ? { 'aria-label': '已锁定正文块' } : {}),
      }),
    },
    contentHash: {
      default: null,
      parseHTML: (element: { getAttribute(name: string): string | null }) =>
        element.getAttribute('data-content-hash'),
      renderHTML: (attributes: Record<string, unknown>) =>
        typeof attributes.contentHash === 'string'
          ? { 'data-content-hash': attributes.contentHash }
          : {},
    },
  };
}

const ChapterDocument = Node.create({
  name: 'chapterDocument',
  topNode: true,
  content: '(paragraph | dialogue | heading | separator)+',
});
const TextNode = Node.create({ name: 'text', group: 'inline' });
const ParagraphBlock = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'text*',
  addAttributes: blockAttributes,
  parseHTML: () => [{ tag: 'p' }, { tag: 'div' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    { ...HTMLAttributes, 'data-block-type': 'paragraph' },
    0,
  ],
});
const DialogueBlock = Node.create({
  name: 'dialogue',
  group: 'block',
  content: 'text*',
  addAttributes: blockAttributes,
  parseHTML: () => [{ tag: 'p[data-block-type="dialogue"]' }, { tag: 'blockquote' }],
  renderHTML: ({ HTMLAttributes }) => [
    'p',
    { ...HTMLAttributes, 'data-block-type': 'dialogue' },
    0,
  ],
});
const HeadingBlock = Node.create({
  name: 'heading',
  group: 'block',
  content: 'text*',
  addAttributes() {
    return {
      ...blockAttributes(),
      headingLevel: {
        default: 2,
        parseHTML: (element: { tagName?: string }) => {
          const parsed = Number(element.tagName?.slice(1) ?? 2);
          return Number.isInteger(parsed) && parsed >= 1 && parsed <= 6 ? parsed : 2;
        },
        renderHTML: () => ({}),
      },
    };
  },
  parseHTML: () => [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}` })),
  renderHTML: ({ node, HTMLAttributes }) => {
    const level = Number(node.attrs.headingLevel);
    const tag = Number.isInteger(level) && level >= 1 && level <= 6 ? `h${level}` : 'h2';
    return [tag, { ...HTMLAttributes, 'data-block-type': 'heading' }, 0];
  },
});
const SeparatorBlock = Node.create({
  name: 'separator',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes: blockAttributes,
  parseHTML: () => [{ tag: 'hr' }],
  renderHTML: ({ HTMLAttributes }) => ['hr', { ...HTMLAttributes, 'data-block-type': 'separator' }],
});

let temporaryIdSequence = 0;
function temporaryClientBlockId(): string {
  temporaryIdSequence += 1;
  return `temporary-${Date.now().toString(36)}-${temporaryIdSequence.toString(36)}`;
}

function logicalBlockId(node: ProseMirrorNode): string | null {
  return typeof node.attrs.logicalBlockId === 'string' && node.attrs.logicalBlockId.length > 0
    ? node.attrs.logicalBlockId
    : null;
}

function persistedOrder(document: ProseMirrorNode): readonly string[] {
  const result: string[] = [];
  document.forEach((node) => {
    const id = logicalBlockId(node);
    if (id) result.push(id);
  });
  return result;
}

function lockedBlocksPreserved(
  previous: ProseMirrorNode,
  next: ProseMirrorNode,
  allowLockToggle: boolean,
): boolean {
  const nextById = new Map<string, ProseMirrorNode>();
  next.forEach((node) => {
    const id = logicalBlockId(node);
    if (id) nextById.set(id, node);
  });
  const previousOrder = persistedOrder(previous);
  const nextOrder = persistedOrder(next);
  const nextIndex = new Map(nextOrder.map((id, index) => [id, index]));

  let valid = true;
  previous.forEach((node) => {
    if (!valid || node.attrs.locked !== true) return;
    const id = logicalBlockId(node);
    const candidate = id ? nextById.get(id) : undefined;
    if (!id || !candidate) {
      valid = false;
      return;
    }
    const sameSemanticContent =
      node.type.name === candidate.type.name &&
      node.textContent === candidate.textContent &&
      node.attrs.source === candidate.attrs.source &&
      (node.type.name !== 'heading' || node.attrs.headingLevel === candidate.attrs.headingLevel);
    if (!sameSemanticContent || (!allowLockToggle && candidate.attrs.locked !== true)) {
      valid = false;
      return;
    }
    const oldIndex = previousOrder.indexOf(id);
    const newIndex = nextIndex.get(id);
    if (newIndex === undefined) {
      valid = false;
      return;
    }
    for (const otherId of previousOrder) {
      const otherNewIndex = nextIndex.get(otherId);
      if (otherId === id || otherNewIndex === undefined) continue;
      if (
        Math.sign(oldIndex - previousOrder.indexOf(otherId)) !==
        Math.sign(newIndex - otherNewIndex)
      ) {
        valid = false;
        return;
      }
    }
  });
  return valid;
}

function createWorldforgeLockGuardPlugin(): Plugin {
  return new Plugin({
    filterTransaction(transaction, state) {
      if (!transaction.docChanged) return true;
      return lockedBlocksPreserved(
        state.doc,
        transaction.doc,
        transaction.getMeta(LOCK_COMMAND_META) === true,
      );
    },
  });
}

export const toggleWorldforgeBlockLock: Command = (state, dispatch) => {
  const { $from } = state.selection;
  if ($from.depth < 1) return false;
  const targetNode = $from.node(1);
  if (
    !supportedBlockTypes.has(targetNode.type.name as WorldforgeBlockType) ||
    !logicalBlockId(targetNode)
  ) {
    return false;
  }
  if (dispatch) {
    const transaction = state.tr.setNodeMarkup($from.before(1), undefined, {
      ...targetNode.attrs,
      locked: targetNode.attrs.locked !== true,
    });
    transaction.setMeta(LOCK_COMMAND_META, true);
    dispatch(transaction);
  }
  return true;
};

export function splitWorldforgeBlock(
  clientBlockIdFactory: () => string = temporaryClientBlockId,
): Command {
  return splitBlockAs((node) => {
    if (!supportedBlockTypes.has(node.type.name as WorldforgeBlockType) || !node.isTextblock) {
      return null;
    }
    const source = node.attrs.source === 'ai' ? 'mixed' : node.attrs.source;
    return {
      type: node.type,
      attrs: {
        ...node.attrs,
        logicalBlockId: null,
        clientBlockId: clientBlockIdFactory(),
        source,
        locked: false,
        contentHash: null,
      },
    };
  });
}

export const joinWorldforgeBlockBackward: Command = (state, dispatch, view) => {
  if (!state.selection.empty || state.selection.$from.parentOffset !== 0) return false;
  return joinBackward(state, dispatch, view);
};

export function isDestructiveKeyDeferred(
  key: string,
  viewIsComposing: boolean,
  eventIsComposing: boolean,
): boolean {
  return (
    (viewIsComposing || eventIsComposing) &&
    (key === 'Enter' || key === 'Backspace' || key === 'Delete')
  );
}

function compositionSafe(command: Command): Command {
  return (state, dispatch, view) => (view?.composing ? false : command(state, dispatch, view));
}

export const undoWorldforgeCommand: Command = undo;
export const redoWorldforgeCommand: Command = redo;
export function createWorldforgeHistoryPlugin() {
  return history();
}

export function createWorldforgeEditorExtensions(
  clientBlockIdFactory: () => string = temporaryClientBlockId,
) {
  const LockGuard = Extension.create({
    name: 'worldforgeLockGuard',
    addProseMirrorPlugins() {
      return [createWorldforgeLockGuardPlugin()];
    },
  });
  const EditingHistory = Extension.create({
    name: 'worldforgeEditingHistory',
    addProseMirrorPlugins() {
      const commands = { ...baseKeymap };
      const defaultEnter = commands.Enter;
      const splitBlock = splitWorldforgeBlock(clientBlockIdFactory);
      commands.Enter = compositionSafe((state, dispatch, view) => {
        if (splitBlock(state, dispatch, view)) return true;
        return defaultEnter?.(state, dispatch, view) ?? false;
      });
      commands.Backspace = compositionSafe(commands.Backspace ?? joinWorldforgeBlockBackward);
      if (commands.Delete) commands.Delete = compositionSafe(commands.Delete);
      commands['Mod-z'] = undoWorldforgeCommand;
      commands['Shift-Mod-z'] = redoWorldforgeCommand;
      commands['Mod-y'] = redoWorldforgeCommand;
      commands['Mod-Shift-l'] = compositionSafe(toggleWorldforgeBlockLock);
      return [createWorldforgeHistoryPlugin(), keymap(commands)];
    },
  });
  return [
    ChapterDocument,
    TextNode,
    ParagraphBlock,
    DialogueBlock,
    HeadingBlock,
    SeparatorBlock,
    LockGuard,
    EditingHistory,
  ];
}

export function createWorldforgeEditorSchema(): Schema {
  return getSchema(createWorldforgeEditorExtensions());
}

function textContent(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  return (node.content ?? []).map(textContent).join('');
}

function jsonBlock(
  blockType: WorldforgeBlockType,
  text: string,
  attrs: Record<string, unknown>,
): JSONContent {
  return {
    type: blockType,
    attrs,
    ...(blockType !== 'separator' && text.length > 0 ? { content: [{ type: 'text', text }] } : {}),
  };
}

export function documentToTiptapJson(blocks: readonly PersistedEditorBlock[]): JSONContent {
  const source =
    blocks.length > 0
      ? blocks
      : [
          {
            logicalBlockId: temporaryClientBlockId(),
            blockType: 'paragraph' as const,
            text: '',
            attributes: {},
            source: 'manual' as const,
            locked: false,
            contentHash: null,
          },
        ];
  return {
    type: 'chapterDocument',
    content: source.map((block) =>
      jsonBlock(block.blockType, block.text, {
        logicalBlockId: block.logicalBlockId,
        clientBlockId: block.logicalBlockId,
        source: block.source,
        locked: block.locked,
        contentHash: block.contentHash,
        ...(block.blockType === 'heading'
          ? { headingLevel: block.attributes.headingLevel ?? 2 }
          : {}),
      }),
    ),
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function tiptapJsonToDraftSnapshot(
  document: JSONContent,
  clientBlockIdFactory: () => string = temporaryClientBlockId,
): DraftSnapshotEditorBlock[] {
  if (document.type !== 'chapterDocument' || !document.content || document.content.length === 0) {
    throw new RangeError('The editor document must contain at least one supported block.');
  }
  return document.content.map((node) => {
    if (!supportedBlockTypes.has(node.type as WorldforgeBlockType)) {
      throw new RangeError(`Unsupported editor block: ${node.type ?? 'unknown'}`);
    }
    const blockType = node.type as WorldforgeBlockType;
    const attrs = node.attrs ?? {};
    const logicalId = optionalString(attrs.logicalBlockId);
    const clientBlockId =
      optionalString(attrs.clientBlockId) ?? logicalId ?? clientBlockIdFactory();
    const text = blockType === 'separator' ? '' : textContent(node);
    const headingLevel = Number(attrs.headingLevel);
    return {
      clientBlockId,
      logicalBlockId: logicalId,
      blockType,
      text,
      attributes:
        blockType === 'heading' &&
        Number.isInteger(headingLevel) &&
        headingLevel >= 1 &&
        headingLevel <= 6
          ? { headingLevel }
          : {},
      locked: attrs.locked === true,
    };
  });
}

export function plainTextToTiptapContent(
  text: string,
  clientBlockIdFactory: () => string = temporaryClientBlockId,
): JSONContent[] {
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  return (lines.length > 0 ? lines : ['']).map((line) =>
    jsonBlock('paragraph', line, {
      logicalBlockId: null,
      clientBlockId: clientBlockIdFactory(),
      source: 'manual',
      locked: false,
      contentHash: null,
    }),
  );
}

export function synchronizePersistedBlockMetadata(
  editor: Editor,
  blocks: readonly PersistedEditorBlock[],
): boolean {
  if (editor.state.doc.childCount !== blocks.length) return false;
  const transaction = editor.state.tr;
  let matches = true;
  editor.state.doc.forEach((node, offset, index) => {
    const block = blocks[index];
    if (!block || node.type.name !== block.blockType) {
      matches = false;
      return;
    }
    transaction.setNodeMarkup(offset, undefined, {
      ...node.attrs,
      logicalBlockId: block.logicalBlockId,
      clientBlockId: block.logicalBlockId,
      source: block.source,
      locked: block.locked,
      contentHash: block.contentHash,
      ...(block.blockType === 'heading'
        ? { headingLevel: block.attributes.headingLevel ?? 2 }
        : {}),
    });
  });
  if (!matches) return false;
  transaction.setMeta('addToHistory', false);
  transaction.setMeta(LOCK_COMMAND_META, true);
  editor.view.dispatch(transaction);
  return true;
}

export function undoWorldforgeEditor(editor: Editor): boolean {
  return undoWorldforgeCommand(editor.state, editor.view.dispatch);
}
export function redoWorldforgeEditor(editor: Editor): boolean {
  return redoWorldforgeCommand(editor.state, editor.view.dispatch);
}

export function assertEditorNodeMetadata(document: JSONContent): void {
  for (const node of document.content ?? []) {
    if (!supportedBlockTypes.has(node.type as WorldforgeBlockType)) {
      throw new RangeError(`Unsupported editor block: ${node.type ?? 'unknown'}`);
    }
    const source = node.attrs?.source;
    if (source !== undefined && !supportedSources.has(source as WorldforgeBlockSource)) {
      throw new RangeError(`Unsupported editor source: ${String(source)}`);
    }
    const locked = node.attrs?.locked;
    if (locked !== undefined && typeof locked !== 'boolean') {
      throw new RangeError('Editor locked metadata must be boolean.');
    }
  }
}
