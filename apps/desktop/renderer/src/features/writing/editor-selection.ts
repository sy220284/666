import type { Chapter, DraftDocument, RewriteSelectionAnchor } from '@worldforge/contracts';
import type { Editor } from '@worldforge/editor-core';

interface PersistedEditorSelection {
  readonly from: number;
  readonly to: number;
  readonly anchorPath?: readonly number[];
  readonly anchorOffset?: number;
  readonly focusPath?: readonly number[];
  readonly focusOffset?: number;
}

const persistedSelectionByChapter = new Map<string, PersistedEditorSelection>();

async function sha256Text(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function captureRewriteSelectionAnchor(
  instance: Editor,
  projectId: string,
  chapter: Chapter,
  draft: DraftDocument,
): Promise<RewriteSelectionAnchor | null> {
  const selection = instance.state.selection;
  if (selection.empty) return null;
  const blockAt = (position: typeof selection.$from) => {
    for (let depth = position.depth; depth >= 1; depth -= 1) {
      const node = position.node(depth);
      const attributes = node.attrs as Record<string, unknown>;
      if (
        typeof attributes.logicalBlockId === 'string' &&
        typeof attributes.contentHash === 'string'
      ) {
        return { depth, node, attributes };
      }
    }
    return null;
  };
  const start = blockAt(selection.$from);
  const end = blockAt(selection.$to);
  if (
    !start ||
    !end ||
    start.attributes.logicalBlockId !== end.attributes.logicalBlockId ||
    start.attributes.locked === true
  ) {
    return null;
  }
  const selectionStart = selection.from - selection.$from.start(start.depth);
  const selectionEnd = selection.to - selection.$to.start(end.depth);
  const selectedText = start.node.textContent.slice(selectionStart, selectionEnd);
  if (!selectedText) return null;
  return {
    projectId,
    chapterId: chapter.id,
    draftId: draft.draftId,
    baseRevision: draft.revision,
    logicalBlockId: String(start.attributes.logicalBlockId),
    expectedBlockHash: String(start.attributes.contentHash),
    selectionStart,
    selectionEnd,
    selectedTextHash: await sha256Text(selectedText),
  };
}

/**
 * The writing workbench is remounted when entering Candidate review. Reconstruct the last editor
 * selection against the freshly re-opened saved Draft instead of silently widening a lost
 * selection to every unlocked block.
 */
export async function capturePersistedRewriteSelectionAnchor(
  projectId: string,
  chapter: Chapter,
  draft: DraftDocument,
): Promise<RewriteSelectionAnchor | null> {
  const remembered = getPersistedEditorSelection(projectId, chapter.id);
  if (!remembered || remembered.from === remembered.to) return null;
  const from = Math.min(remembered.from, remembered.to);
  const to = Math.max(remembered.from, remembered.to);
  let documentOffset = 0;

  for (const block of draft.blocks) {
    if (block.blockType === 'separator') {
      documentOffset += 1;
      continue;
    }
    const contentStart = documentOffset + 1;
    const contentEnd = contentStart + block.text.length;
    if (from >= contentStart && to <= contentEnd) {
      if (block.locked || !block.contentHash) return null;
      const selectionStart = from - contentStart;
      const selectionEnd = to - contentStart;
      const selectedText = block.text.slice(selectionStart, selectionEnd);
      if (!selectedText) return null;
      return {
        projectId,
        chapterId: chapter.id,
        draftId: draft.draftId,
        baseRevision: draft.revision,
        logicalBlockId: block.logicalBlockId,
        expectedBlockHash: block.contentHash,
        selectionStart,
        selectionEnd,
        selectedTextHash: await sha256Text(selectedText),
      };
    }
    documentOffset += block.text.length + 2;
  }

  return null;
}

function selectionKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function pathFromEditorRoot(root: Node, node: Node): readonly number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent: ParentNode | null = current.parentNode;
    if (!parent) return null;
    const index = Array.prototype.indexOf.call(parent.childNodes, current) as number;
    if (index < 0) return null;
    path.unshift(index);
    current = parent;
  }
  return current === root ? path : null;
}

function nodeFromEditorPath(root: Node, path: readonly number[]): Node | null {
  let current: Node = root;
  for (const index of path) {
    const next = current.childNodes.item(index);
    if (!next) return null;
    current = next;
  }
  return current;
}

function clampEditorSelectionOffset(node: Node, offset: number): number {
  const maximum = node.nodeType === 3 ? (node.textContent?.length ?? 0) : node.childNodes.length;
  return Math.min(Math.max(0, offset), maximum);
}

export function clampEditorTextSelection(
  from: number,
  to: number,
  contentSize: number,
): { readonly from: number; readonly to: number } {
  const maximum = Math.max(1, contentSize);
  return {
    from: Math.min(Math.max(1, from), maximum),
    to: Math.min(Math.max(1, to), maximum),
  };
}

function captureEditorSelection(instance: Editor): PersistedEditorSelection {
  const persisted: PersistedEditorSelection = {
    from: instance.state.selection.from,
    to: instance.state.selection.to,
  };
  const root = instance.view.dom;
  const selection = root.ownerDocument.getSelection();
  if (!selection?.anchorNode || !selection.focusNode) return persisted;
  if (!root.contains(selection.anchorNode) || !root.contains(selection.focusNode)) return persisted;
  const anchorPath = pathFromEditorRoot(root, selection.anchorNode);
  const focusPath = pathFromEditorRoot(root, selection.focusNode);
  if (!anchorPath || !focusPath) return persisted;
  return {
    ...persisted,
    anchorPath,
    anchorOffset: selection.anchorOffset,
    focusPath,
    focusOffset: selection.focusOffset,
  };
}

export function persistEditorSelection(
  projectId: string,
  chapterId: string,
  instance: Editor,
): void {
  const key = selectionKey(projectId, chapterId);
  const captured = captureEditorSelection(instance);
  const existing = persistedSelectionByChapter.get(key);
  if (
    !captured.anchorPath &&
    existing?.anchorPath &&
    existing.from === captured.from &&
    existing.to === captured.to
  ) {
    return;
  }
  persistedSelectionByChapter.set(key, captured);
}

export function persistEditorSelectionRange(
  projectId: string,
  chapterId: string,
  from: number,
  to: number,
): void {
  persistedSelectionByChapter.set(selectionKey(projectId, chapterId), { from, to });
}

export function getPersistedEditorSelection(
  projectId: string,
  chapterId: string,
): PersistedEditorSelection | undefined {
  return persistedSelectionByChapter.get(selectionKey(projectId, chapterId));
}

export function restoreEditorSelection(
  instance: Editor,
  remembered: PersistedEditorSelection,
): void {
  instance.commands.setTextSelection(
    clampEditorTextSelection(remembered.from, remembered.to, instance.state.doc.content.size),
  );
  instance.view.focus();
  if (
    !remembered.anchorPath ||
    remembered.anchorOffset === undefined ||
    !remembered.focusPath ||
    remembered.focusOffset === undefined
  ) {
    return;
  }
  const root = instance.view.dom;
  const anchorNode = nodeFromEditorPath(root, remembered.anchorPath);
  const focusNode = nodeFromEditorPath(root, remembered.focusPath);
  if (!anchorNode || !focusNode) return;
  root.ownerDocument
    .getSelection()
    ?.setBaseAndExtent(
      anchorNode,
      clampEditorSelectionOffset(anchorNode, remembered.anchorOffset),
      focusNode,
      clampEditorSelectionOffset(focusNode, remembered.focusOffset),
    );
}
