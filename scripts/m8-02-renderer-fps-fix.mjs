import { readFile, writeFile } from 'node:fs/promises';

const path = 'tests/e2e/electron-shell.spec.ts';
const before = await readFile(path, 'utf8');
const needle = `      { length: 320 },`;
const first = before.indexOf(needle);
if (first < 0) throw new Error('MISSING:renderer-fps-paragraph-count');
if (before.indexOf(needle, first + needle.length) >= 0) {
  throw new Error('MULTIPLE:renderer-fps-paragraph-count');
}
const after = before.slice(0, first) + `      { length: 96 },` + before.slice(first + needle.length);
await writeFile(path, after, 'utf8');
console.log('M8-02 Renderer FPS fixture reduced to 96 paragraphs.');
