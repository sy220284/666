from pathlib import Path


path = Path('apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx')
source = path.read_text()

late_read = """      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, nextChapter.id),
      );
      if (remembered) {"""
if source.count(late_read) != 1:
    raise SystemExit(f'late selection read count was {source.count(late_read)}')
source = source.replace(late_read, '      if (remembered) {', 1)

editor_anchor = """      const instance = new Editor({"""
early_read = """      const remembered = persistedSelectionByChapter.get(
        selectionKey(project.projectId, nextChapter.id),
      );
      const instance = new Editor({"""
if source.count(editor_anchor) != 1:
    raise SystemExit(f'editor construction anchor count was {source.count(editor_anchor)}')
source = source.replace(editor_anchor, early_read, 1)

path.write_text(source)
