from pathlib import Path


path = Path('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx')
source = path.read_text()

old_selection_model = """const persistedSelectionByChapter = new Map<
  string,
  { readonly from: number; readonly to: number }
>();

function selectionKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}
"""
new_selection_model = """interface PersistedEditorSelection {
  readonly from: number;
  readonly to: number;
  readonly anchorPath?: readonly number[];
  readonly anchorOffset?: number;
  readonly focusPath?: readonly number[];
  readonly focusOffset?: number;
}

const persistedSelectionByChapter = new Map<string, PersistedEditorSelection>();

function selectionKey(projectId: string, chapterId: string): string {
  return `${projectId}:${chapterId}`;
}

function pathFromEditorRoot(root: Node, node: Node): readonly number[] | null {
  const path: number[] = [];
  let current: Node | null = node;
  while (current && current !== root) {
    const parent = current.parentNode;
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

function restoreEditorSelection(instance: Editor, remembered: PersistedEditorSelection): void {
  const maximum = Math.max(1, instance.state.doc.content.size);
  instance.commands.setTextSelection({
    from: Math.min(Math.max(1, remembered.from), maximum),
    to: Math.min(Math.max(1, remembered.to), maximum),
  });
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
  root.ownerDocument.getSelection()?.setBaseAndExtent(
    anchorNode,
    clampEditorSelectionOffset(anchorNode, remembered.anchorOffset),
    focusNode,
    clampEditorSelectionOffset(focusNode, remembered.focusOffset),
  );
}
"""
if source.count(old_selection_model) != 1:
    raise SystemExit(f'selection model count was {source.count(old_selection_model)}')
source = source.replace(old_selection_model, new_selection_model, 1)

old_capture = """        persistedSelectionByChapter.set(selectionKey(project.projectId, currentChapter.id), {
          from: instance.state.selection.from,
          to: instance.state.selection.to,
        });"""
new_capture = """        persistedSelectionByChapter.set(
          selectionKey(project.projectId, currentChapter.id),
          captureEditorSelection(instance),
        );"""
if source.count(old_capture) != 1:
    raise SystemExit(f'destroy selection capture count was {source.count(old_capture)}')
source = source.replace(old_capture, new_capture, 1)

editor_anchor = """      const instance = new Editor({"""
early_read = """      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, nextChapter.id),
      );
      const instance = new Editor({"""
if source.count(editor_anchor) != 1:
    raise SystemExit(f'editor construction anchor count was {source.count(editor_anchor)}')
source = source.replace(editor_anchor, early_read, 1)

old_restore = """      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, nextChapter.id),
      );
      if (remembered) {
        const maximum = Math.max(1, instance.state.doc.content.size);
        instance.commands.setTextSelection({
          from: Math.min(Math.max(1, remembered.from), maximum),
          to: Math.min(Math.max(1, remembered.to), maximum),
        });
        instance.commands.focus();
      }"""
new_restore = """      if (remembered) restoreEditorSelection(instance, remembered);"""
if source.count(old_restore) != 1:
    raise SystemExit(f'late selection restore count was {source.count(old_restore)}')
source = source.replace(old_restore, new_restore, 1)

path.write_text(source)
