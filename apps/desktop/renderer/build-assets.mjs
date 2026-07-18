import { copyFile, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';

import { build } from 'esbuild';

await mkdir(new URL('./dist/', import.meta.url), { recursive: true });
await Promise.all([
  copyFile(
    new URL('./src/index.html', import.meta.url),
    new URL('./dist/index.html', import.meta.url),
  ),
  copyFile(
    new URL('./src/styles.css', import.meta.url),
    new URL('./dist/styles.css', import.meta.url),
  ),
]);

await build({
  entryPoints: [new URL('./src/entry.ts', import.meta.url).pathname],
  outfile: new URL('./dist/index.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
  sourcemap: false,
  logLevel: 'warning',
});
