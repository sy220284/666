/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const filePath = 'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx';
let source = await readFile(filePath, 'utf8');

const replacements = [
  [
    `  const rememberCurrentSelection = useCallback((): void => {\n    const instance = editor.current;\n    const currentChapter = activeChapter.current;\n    if (!instance || !currentChapter) return;\n    persistEditorSelection(project.projectId, currentChapter.id, instance);\n  }, [project.projectId]);`,
    `  const rememberCurrentSelection = useCallback((): void => {\n    const instance = editor.current;\n    const currentChapter = activeChapter.current;\n    if (!instance || !currentChapter) return;\n    persistEditorSelection(project.projectId, currentChapter.id, instance);\n  }, [project.projectId]);\n\n  const toggleFocusMode = useCallback((): void => {\n    setFocusMode((enabled) => !enabled);\n    window.requestAnimationFrame(() => {\n      const instance = editor.current;\n      const currentChapter = activeChapter.current;\n      if (!instance || !currentChapter) return;\n      const remembered = persistedSelectionByChapter.get(\n        selectionKey(project.projectId, currentChapter.id),\n      );\n      if (remembered) restoreEditorSelection(instance, remembered);\n    });\n  }, [project.projectId]);`,
  ],
  [
    `            aria-pressed={focusMode}\n            data-toggle-focus-mode\n            type="button"\n            onClick={() => setFocusMode((enabled) => !enabled)}`,
    `            aria-pressed={focusMode}\n            data-toggle-focus-mode\n            type="button"\n            onPointerDownCapture={rememberCurrentSelection}\n            onClick={toggleFocusMode}`,
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`沉浸写作缺少预期片段：${before.slice(0, 180)}`);
  source = source.replace(before, after);
}
await writeFile(filePath, source, 'utf8');

const governedPath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
const governed = JSON.parse(await readFile(governedPath, 'utf8'));
const testPath = 'tests/e2e/writing-focus-assistance.spec.ts';
if (!governed.paths.includes(testPath)) governed.paths.push(testPath);
await writeFile(governedPath, `${JSON.stringify(governed, null, 2)}\n`, 'utf8');
console.log('沉浸写作切换已接入选区记录与恢复。');
