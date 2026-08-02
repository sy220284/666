import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDirectory = path.join(root, 'scripts/ar12-generator-source');
const targetDirectory = path.join(root, 'test-results/ar12-generator');
const targetPath = path.join(targetDirectory, 'generate.mjs');
const parts = await Promise.all(
  Array.from({ length: 6 }, (_, index) =>
    readFile(path.join(sourceDirectory, `part-${String(index).padStart(2, '0')}.txt`), 'utf8'),
  ),
);
let source = Buffer.from(parts.join('').replaceAll(/\s/gu, ''), 'base64').toString('utf8');
const originalDigest = createHash('sha256').update(source).digest('hex');
if (originalDigest !== '2f6e11c6a1e31e4b3ff830ca1586a981679bba2aa36eb17f767f3b82c6b5e1af') {
  throw new Error(`AR-12 generator payload digest mismatch: ${originalDigest}`);
}

const originalExportDeclaration = `function exportDeclaration(text, kind) {
  const token = kind === 'async-function' ? 'async function ' : \`\${kind} \`;
  if (!text.startsWith(token)) {
    throw new Error(\`AR-12 export target does not start with \${token}\`);
  }
  return \`export \${text}\`;
}`;
const fixedExportDeclaration = `function exportDeclaration(text, kind) {
  if (text.startsWith('export ')) return text;
  const token = kind === 'async-function' ? 'async function ' : \`\${kind} \`;
  if (!text.startsWith(token)) {
    throw new Error(\`AR-12 export target does not start with \${token}\`);
  }
  return \`export \${text}\`;
}`;
if (!source.includes(originalExportDeclaration)) {
  throw new Error('AR-12 export declaration patch target was not found.');
}
source = source.replace(originalExportDeclaration, fixedExportDeclaration);
const fixedDigest = createHash('sha256').update(source).digest('hex');
if (fixedDigest !== 'dca997245969f57ac14da5ed6a44281b67e36fb3600cf2c563a9bcb7906fda00') {
  throw new Error(`AR-12 fixed generator digest mismatch: ${fixedDigest}`);
}

await mkdir(targetDirectory, { recursive: true });
await writeFile(targetPath, source, 'utf8');
const result = spawnSync(process.execPath, [targetPath], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
