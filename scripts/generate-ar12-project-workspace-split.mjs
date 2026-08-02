import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourceDirectory = path.join(root, 'scripts/ar12-generator-source');
const targetDirectory = path.join(root, 'test-results/ar12-generator');
const targetPath = path.join(targetDirectory, 'generate.mjs');
const partNames = [
  'part-00.txt',
  'part-01.txt',
  'part-02.txt',
  'part-03a.txt',
  'part-03b.txt',
  'part-04.txt',
  'part-05.txt',
];
const parts = await Promise.all(
  partNames.map((partName) => readFile(path.join(sourceDirectory, partName), 'utf8')),
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

const privatePermissionHelper = "const isPermissionFailure = topLevelFunction('isPermissionFailure');";
const exportedPermissionHelper = `const isPermissionFailure = exportDeclaration(
  topLevelFunction('isPermissionFailure'),
  'function',
);`;
const privateInsideHelper = "const isInside = topLevelFunction('isInside');";
const exportedInsideHelper = `const isInside = exportDeclaration(
  topLevelFunction('isInside'),
  'function',
);`;
for (const [target, replacement] of [
  [privatePermissionHelper, exportedPermissionHelper],
  [privateInsideHelper, exportedInsideHelper],
]) {
  if (!source.includes(target)) {
    throw new Error(`AR-12 helper export patch target was not found: ${target}`);
  }
  source = source.replace(target, replacement);
}

const verifierTransformAnchor =
  "    .replaceAll('this.#readProjectRow(database)', 'readProjectRow(database)');";
const verifierTransformPatch = `    .replaceAll('this.#readProjectRow(database)', 'readProjectRow(database)');

  const recoveryPointStart = transformed.indexOf('prepareRecoveryPoint:');
  const recoveryContextArgument = transformed.indexOf('context,', recoveryPointStart);
  if (recoveryPointStart < 0 || recoveryContextArgument < 0) {
    throw new Error('AR-12 migration recovery context patch target was not found.');
  }
  transformed =
    transformed.slice(0, recoveryContextArgument) +
    'recoveryContext,' +
    transformed.slice(recoveryContextArgument + 'context,'.length);
  transformed = transformed.replace(
    'prepareRecoveryPoint: async (context)',
    'prepareRecoveryPoint: async (recoveryContext)',
  );`;
if (!source.includes(verifierTransformAnchor)) {
  throw new Error('AR-12 verifier transform patch anchor was not found.');
}
source = source.replace(verifierTransformAnchor, verifierTransformPatch);
const candidateDigest = createHash('sha256').update(source).digest('hex');
if (candidateDigest !== '95733520917273b39cc99523d67d0d2e52c234b9111a8d3d9c4fd2a7ac0169f7') {
  throw new Error(`AR-12 candidate generator digest mismatch: ${candidateDigest}`);
}

await mkdir(targetDirectory, { recursive: true });
await writeFile(targetPath, source, 'utf8');
const result = spawnSync(process.execPath, [targetPath], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
