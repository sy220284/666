/* global console */
import { readFile, writeFile } from 'node:fs/promises';

const workbenchPath =
  'apps/desktop/renderer/src/features/writing/writing-core-workbench.tsx';
let workbench = await readFile(workbenchPath, 'utf8');

const replacements = [
  [
    `import { StructureNavigator } from '../planning/planning-workbench.js';\nimport {`,
    `import { StructureNavigator } from '../planning/planning-workbench.js';\nimport { WritingAssistancePanel } from './writing-assistance-panel.js';\nimport {`,
  ],
  [
    '正文、历史版本和候选稿都保存在当前项目中；采用前可预览，保存后可追溯。',
    '正文、历史版本和建议稿都保存在当前作品中；采用前可预览，保存后可追溯。',
  ],
  ['>\n            候选稿\n          </button>', '>\n            建议稿\n          </button>'],
  [
    `{contextVisible ? '收起上下文' : '展开上下文'}`,
    `{contextVisible ? '收起写作辅助' : '展开写作辅助'}`,
  ],
  [
    `        {contextVisible && !focusMode ? (\n          <aside className="writing-context feature-card" aria-label="正文上下文">\n            <h2>当前写作状态</h2>\n            <p>{chapter?.title ?? '尚未选择章节'}</p>\n            <p>{draft ? \`已保存修订 \${draft.revision}\` : '尚未打开正文'}</p>\n            <p>\n              {readOnly\n                ? '只读保护：可以浏览和复制，写入已停用。'\n                : '停止输入约1秒后自动保存，事务确认后才显示成功。'}\n            </p>\n            <p>切换章节、工作台或关闭项目之前会先完成当前保存。</p>\n          </aside>\n        ) : null}`,
    `        {contextVisible && !focusMode && chapter ? (\n          <WritingAssistancePanel\n            bridge={bridge}\n            projectId={project.projectId}\n            chapterId={chapter.id}\n            savedRevision={draft?.revision ?? null}\n            readOnly={readOnly}\n          />\n        ) : null}`,
  ],
];

for (const [before, after] of replacements) {
  if (!workbench.includes(before)) {
    throw new Error(`写作工作台缺少预期片段：${before.slice(0, 160)}`);
  }
  workbench = workbench.replace(before, after);
}
await writeFile(workbenchPath, workbench, 'utf8');

const cssPath = 'apps/desktop/renderer/src/m3.css';
let css = await readFile(cssPath, 'utf8');
const cssAnchor = `.worldforge-editor {\n  min-height: 31rem;`;
if (!css.includes(cssAnchor)) throw new Error('写作样式缺少编辑器锚点。');
css = css.replace(
  cssAnchor,
  `.writing-assistance__sections {\n  display: grid;\n  gap: 0.9rem;\n}\n\n.writing-assistance__sections > section {\n  padding-top: 0.75rem;\n  border-top: 1px solid var(--border, rgba(120, 120, 120, 0.22));\n}\n\n.writing-assistance__sections h3 {\n  margin: 0 0 0.45rem;\n}\n\n.writing-assistance__cards,\n.writing-assistance__item {\n  display: grid;\n  gap: 0.35rem;\n}\n\n.writing-assistance__cards article,\n.writing-assistance__item {\n  padding: 0.65rem;\n  border-radius: 0.65rem;\n  background: var(--surface-muted, rgba(120, 120, 120, 0.1));\n}\n\n.writing-assistance blockquote {\n  max-height: 15rem;\n  margin: 0.5rem 0 0;\n  overflow: auto;\n  white-space: pre-wrap;\n}\n\n.writing-workbench[data-focus-mode='true']\n  .writing-heading\n  .feature-heading__actions\n  button:not([data-toggle-focus-mode]),\n.writing-workbench[data-focus-mode='true'] .draft-toolbar,\n.writing-workbench[data-focus-mode='true'] .draft-find {\n  display: none;\n}\n\n.writing-workbench[data-focus-mode='true'] .draft-metrics span:not(:nth-child(2)) {\n  display: none;\n}\n\n.worldforge-editor {\n  min-height: 31rem;`,
);
await writeFile(cssPath, css, 'utf8');

const governedPath = 'docs/product/AUTHOR_LANGUAGE_GOVERNED_PATHS.json';
const governed = JSON.parse(await readFile(governedPath, 'utf8'));
for (const filePath of [
  'apps/desktop/renderer/src/features/writing/writing-assistance.ts',
  'apps/desktop/renderer/src/features/writing/writing-assistance-panel.tsx',
  'tests/unit/writing-assistance.test.ts',
]) {
  if (!governed.paths.includes(filePath)) governed.paths.push(filePath);
}
await writeFile(governedPath, `${JSON.stringify(governed, null, 2)}\n`, 'utf8');

console.log('写作辅助与沉浸写作展示已接入现有编辑器。');
