import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDirectory = path.join(root, 'scripts/ar11-generator-source');
const targetDirectory = path.join(root, 'test-results/ar11-generator');
const targetPath = path.join(targetDirectory, 'generate-fixed.mjs');
const parts = await Promise.all(
  Array.from({ length: 6 }, (_, index) =>
    readFile(path.join(sourceDirectory, `part-${String(index).padStart(2, '0')}.txt`), 'utf8'),
  ),
);
const source = Buffer.from(parts.join('').replaceAll(/\s/gu, ''), 'base64').toString('utf8');
const digest = createHash('sha256').update(source).digest('hex');
if (digest !== '0d847410ffca990c1bfa005abb4f699178b5514d3459e5df2e1e83efff5fbaa5') {
  throw new Error(`AR-11 generator payload digest mismatch: ${digest}`);
}

await mkdir(targetDirectory, { recursive: true });
await writeFile(targetPath, source, 'utf8');
const result = spawnSync(process.execPath, [targetPath], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
