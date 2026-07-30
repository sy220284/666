import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputRoot = process.argv[2];
if (!outputRoot) throw new Error('Output directory is required.');

const replacements = [
  {
    from: String.raw`/^自动保存完成 · 保存序号 \d+$/u`,
    to: String.raw`/^自动保存完成$/u`,
  },
  {
    from: String.raw`/^已手动保存 · 保存序号 \d+$/u`,
    to: String.raw`/^已手动保存$/u`,
  },
];

const testFiles = [
  'tests/e2e/continuation-panel-race.spec.ts',
  'tests/e2e/electron-shell.spec.ts',
  'tests/e2e/structure-recovery.spec.ts',
  'tests/e2e/unreadable-project-recovery.spec.ts',
];

let replacementCount = 0;
for (const file of testFiles) {
  let source = await readFile(file, 'utf8');
  for (const replacement of replacements) {
    const occurrences = source.split(replacement.from).length - 1;
    replacementCount += occurrences;
    source = source.split(replacement.from).join(replacement.to);
  }
  const destination = path.join(outputRoot, file);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, source);
}

if (replacementCount !== 9) {
  throw new Error(`Expected 9 legacy save-state assertions, found ${replacementCount}.`);
}

const cssPath = 'apps/desktop/renderer/src/m8-07.css';
let css = await readFile(cssPath, 'utf8');
const anchor = `input,\nselect,\ntextarea {\n  border-color: var(--color-border-strong);\n  background: var(--color-bg-elevated);\n}\n`;
const editorRule = `${anchor}\n.worldforge-editor {\n  color: var(--color-text-primary);\n  background: var(--color-bg-paper);\n}\n`;
if (!css.includes(anchor)) throw new Error('M8-07 editor theme anchor is missing.');
css = css.replace(anchor, editorRule);
const cssDestination = path.join(outputRoot, cssPath);
await mkdir(path.dirname(cssDestination), { recursive: true });
await writeFile(cssDestination, css);

console.log(`Prepared ${testFiles.length + 1} patched files with ${replacementCount} assertion updates.`);
