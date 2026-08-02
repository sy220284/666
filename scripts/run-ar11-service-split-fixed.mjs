import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const sourcePath = path.join(root, 'scripts/generate-ar11-service-split.mjs');
const targetDirectory = path.join(root, 'test-results/ar11-generator');
const targetPath = path.join(targetDirectory, 'generate-fixed.mjs');
let source = await readFile(sourcePath, 'utf8');

const oldFormat = `async function formatFile(relativePath, content) {
  const importsRemoved = content.replace(/^(?:import[^;]+;\\n)+/u, '');
  return prettier.format(importsRemoved, { ...prettierConfig, filepath: relativePath });
}`;
const newFormat = `async function formatFile(relativePath, content) {
  return prettier.format(content, { ...prettierConfig, filepath: relativePath });
}`;
if (!source.includes(oldFormat)) throw new Error('AR-11 format patch target was not found.');
source = source.replace(oldFormat, newFormat);

const oldExports = `  const publicExportText = [...publicByModule.entries()]
    .map(([moduleName, names]) => \`export { \${names.join(', ')} } from '\${moduleName}';\`)
    .join('\\n');`;
const newExports = `  const publicExportText = [...publicByModule.entries()]
    .flatMap(([moduleName, names]) => {
      const valueNames = names.filter((name) => !ownership.get(name)?.typeOnly);
      const typeNames = names.filter((name) => ownership.get(name)?.typeOnly);
      return [
        valueNames.length ? \`export { \${valueNames.join(', ')} } from '\${moduleName}';\` : '',
        typeNames.length ? \`export type { \${typeNames.join(', ')} } from '\${moduleName}';\` : '',
      ].filter(Boolean);
    })
    .join('\\n');`;
if (!source.includes(oldExports)) throw new Error('AR-11 export patch target was not found.');
source = source.replace(oldExports, newExports);

await mkdir(targetDirectory, { recursive: true });
await writeFile(targetPath, source, 'utf8');
const result = spawnSync(process.execPath, [targetPath], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
