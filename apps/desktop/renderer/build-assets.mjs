import { copyFile, mkdir } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';

import { build } from 'esbuild';

await mkdir(new URL('./dist/styles/', import.meta.url), { recursive: true });
await Promise.all([
  copyFile(
    new URL('./src/index.html', import.meta.url),
    new URL('./dist/index.html', import.meta.url),
  ),
  ...['base.css', 'layout.css', 'components.css', 'themes.css'].map((fileName) =>
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
