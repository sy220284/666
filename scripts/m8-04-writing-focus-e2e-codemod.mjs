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
  [
    `  useEffect(() => {\n    if (initialChapterRequested.current) return;\n    initialChapterRequested.current = true;\n    let active = true;\n    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {\n      if (!active || outcome.state !== 'success') return;\n      const chapters = outcome.data.volumes.flatMap((volume) => volume.chapters);\n      const requestedChapter = navigationChapterId\n        ? chapters.find((candidate) => candidate.id === navigationChapterId)\n        : undefined;\n      const continuedChapter =\n        initialContinuation?.status === 'ready'\n          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)\n          : undefined;\n      const nextChapter = requestedChapter ?? continuedChapter ?? chapters[0];\n      if (requestedChapter) {\n        handledNavigationKey.current = navigationKey(\n          panel,\n          navigationChapterId,\n          navigationLogicalBlockId,\n          navigationVersionId,\n        );\n      }\n      if (nextChapter) {\n        if (initialContinuation?.status === 'stale') {\n          onStatus('上次写作位置已经变化，已安全回到首个可用章节。');\n        }\n        void openChapter(nextChapter);\n      }\n    });\n    return () => {\n      active = false;\n    };\n  }, [\n    bridge,\n    initialContinuation,\n    navigationChapterId,\n    navigationLogicalBlockId,\n    navigationVersionId,\n    onStatus,\n    openChapter,\n    panel,\n    project.projectId,\n  ]);`,
    `  useEffect(() => {\n    if (initialChapterRequested.current) return;\n    let active = true;\n    void bridge.planning.listStructure(project.projectId, { mode: 'replace' }).then((outcome) => {\n      if (!active || outcome.state !== 'success' || initialChapterRequested.current) return;\n      initialChapterRequested.current = true;\n      const chapters = outcome.data.volumes.flatMap((volume) => volume.chapters);\n      const requestedChapter = navigationChapterId\n        ? chapters.find((candidate) => candidate.id === navigationChapterId)\n        : undefined;\n      const continuedChapter =\n        initialContinuation?.status === 'ready'\n          ? chapters.find((candidate) => candidate.id === initialContinuation.chapterId)\n          : undefined;\n      const nextChapter = requestedChapter ?? continuedChapter ?? chapters[0];\n      if (requestedChapter) {\n        handledNavigationKey.current = navigationKey(\n          panel,\n          navigationChapterId,\n          navigationLogicalBlockId,\n          navigationVersionId,\n        );\n      }\n      if (nextChapter) {\n        if (initialContinuation?.status === 'stale') {\n          onStatus('上次写作位置已经变化，已安全回到首个可用章节。');\n        }\n        void openChapter(nextChapter);\n      }\n    });\n    return () => {\n      active = false;\n    };\n  }, [\n    bridge,\n    initialContinuation,\n    navigationChapterId,\n    navigationLogicalBlockId,\n    navigationVersionId,\n    onStatus,\n    openChapter,\n    panel,\n    project.projectId,\n  ]);`,
  ],
];

for (const [before, after] of replacements) {
  if (!source.includes(before)) throw new Error(`沉浸写作缺少预期片段：${before.slice(0, 180)}`);
  source = source.replace(before, after);
}
await writeFile(filePath, source, 'utf8');

const playwrightPath = 'tests/e2e/playwright.config.ts';
let playwright = await readFile(playwrightPath, 'utf8');
const testAnchor = `    'provider-settings.spec.ts',\n`;
if (!playwright.includes(testAnchor)) throw new Error('桌面测试配置缺少用例清单锚点。');
playwright = playwright.replace(
  testAnchor,
  `${testAnchor}    'm8-04-author-experience.spec.ts',\n    'writing-focus-assistance.spec.ts',\n`,
);
await writeFile(playwrightPath, playwright, 'utf8');

const governedPath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
const governed = JSON.parse(await readFile(governedPath, 'utf8'));
for (const testPath of [
  'tests/e2e/m8-04-author-experience.spec.ts',
  'tests/e2e/writing-focus-assistance.spec.ts',
]) {
  if (!governed.paths.includes(testPath)) governed.paths.push(testPath);
}
await writeFile(governedPath, `${JSON.stringify(governed, null, 2)}\n`, 'utf8');
console.log('首次章节打开竞态已修复，沉浸写作选区恢复与桌面用例已登记。');
