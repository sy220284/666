import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

const operationStartMarker = '  const allMethodNames = facade.members';
const publicModulesMarker = '  const publicByModule = new Map();';
const operationStart = source.indexOf(operationStartMarker);
const publicModulesStart = source.indexOf(publicModulesMarker, operationStart);
if (operationStart < 0 || publicModulesStart < 0) {
  throw new Error('AR-11 service dependency patch target was not found.');
}
source = `${source.slice(0, operationStart)}  const serviceDirectory = path.posix.dirname(config.servicePath);\n${source.slice(publicModulesStart)}`;

const optionsMarker = '  const optionsName = config.optionsName;';
const serviceBodyMarker = '  const serviceBody =';
const publicExportMarker = '${publicExportText}';
const optionsStart = source.indexOf(optionsMarker);
const optionsLineEnd = source.indexOf('\n', optionsStart);
const serviceBodyStart = source.indexOf(serviceBodyMarker, optionsLineEnd);
const publicExportStart = source.indexOf(publicExportMarker, serviceBodyStart);
if (
  optionsStart < 0 ||
  optionsLineEnd < 0 ||
  serviceBodyStart < 0 ||
  publicExportStart < 0
) {
  throw new Error('AR-11 service import deduplication target was not found.');
}
source =
  source.slice(0, optionsLineEnd + 1) +
  '  const serviceBody = `${publicExportText}' +
  source.slice(publicExportStart + publicExportMarker.length);

const oldForeshadowingDeclarations = `        'historicalForeshadowings',
        'historicalArcMilestones',`;
const newForeshadowingDeclarations = `        'foreshadowingRole',
        'historicalForeshadowings',
        'historicalArcMilestones',`;
if (!source.includes(oldForeshadowingDeclarations)) {
  throw new Error('AR-11 foreshadowing helper patch target was not found.');
}
source = source.replace(oldForeshadowingDeclarations, newForeshadowingDeclarations);

const oldCompilerHost = `const host = ts.createCompilerHost(parsedConfig.options);
const originalReadFile = host.readFile.bind(host);
const originalFileExists = host.fileExists.bind(host);
host.fileExists = (fileName) => generatedAbsolute.has(path.normalize(fileName)) || originalFileExists(fileName);
host.readFile = (fileName) => generatedAbsolute.get(path.normalize(fileName)) ?? originalReadFile(fileName);
host.getSourceFile = (fileName, languageVersion) => {
  const text = host.readFile(fileName);
  return text === undefined ? undefined : ts.createSourceFile(fileName, text, languageVersion, true);
};
const program = ts.createProgram({
  rootNames: parsedConfig.fileNames,
  options: parsedConfig.options,
  host,
});`;
const newCompilerHost = `const generatedDirectories = new Set();
for (const fileName of generatedAbsolute.keys()) {
  let directory = path.dirname(fileName);
  while (directory.startsWith(root)) {
    generatedDirectories.add(path.normalize(directory));
    if (directory === root) break;
    directory = path.dirname(directory);
  }
}
const host = ts.createCompilerHost(parsedConfig.options);
const originalReadFile = host.readFile.bind(host);
const originalFileExists = host.fileExists.bind(host);
const originalDirectoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists;
host.fileExists = (fileName) =>
  generatedAbsolute.has(path.normalize(fileName)) || originalFileExists(fileName);
host.readFile = (fileName) =>
  generatedAbsolute.get(path.normalize(fileName)) ?? originalReadFile(fileName);
host.directoryExists = (directoryName) =>
  generatedDirectories.has(path.normalize(directoryName)) || originalDirectoryExists(directoryName);
host.getSourceFile = (fileName, languageVersion) => {
  const text = host.readFile(fileName);
  return text === undefined ? undefined : ts.createSourceFile(fileName, text, languageVersion, true);
};
const rootNames = [...new Set([...parsedConfig.fileNames, ...generatedAbsolute.keys()])];
const program = ts.createProgram({
  rootNames,
  options: parsedConfig.options,
  host,
});`;
if (!source.includes(oldCompilerHost)) {
  throw new Error('AR-11 compiler host patch target was not found.');
}
source = source.replace(oldCompilerHost, newCompilerHost);

await mkdir(targetDirectory, { recursive: true });
await writeFile(targetPath, source, 'utf8');
const result = spawnSync(process.execPath, [targetPath], {
  cwd: root,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
