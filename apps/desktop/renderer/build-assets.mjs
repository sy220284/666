import { copyFile, mkdir } from 'node:fs/promises';
import { URL } from 'node:url';

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
