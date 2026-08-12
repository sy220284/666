import { copyFile, mkdir } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const styleFiles = [
  'base.css',
  'layout.css',
  'components/01-shell.css',
  'components/02-workspace.css',
  'components/03-dialogs.css',
  'components/04-features.css',
  'components/04-story-knowledge.css',
  'components/05-writing.css',
  'components/06-review.css',
  'themes.css',
];

await mkdir(new URL('./dist/styles/components/', import.meta.url), { recursive: true });
await Promise.all([
  copyFile(
    new URL('./src/index.html', import.meta.url),
    new URL('./dist/index.html', import.meta.url),
  ),
  ...styleFiles.map((fileName) =>
    copyFile(
      new URL(`./src/styles/${fileName}`, import.meta.url),
      new URL(`./dist/styles/${fileName}`, import.meta.url),
    ),
  ),
]);

await build({
  entryPoints: [fileURLToPath(new URL('./src/react-entry.tsx', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/index.js', import.meta.url)),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  sourcemap: false,
  logLevel: 'warning',
});
