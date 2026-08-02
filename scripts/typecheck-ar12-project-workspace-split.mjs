import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const root = process.cwd();
const outputRoot = path.join(root, 'test-results/ar12-project-workspace');
const summaryPath = path.join(outputRoot, 'summary.json');
const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
const generated = new Map();
for (const relativePath of summary.files) {
  generated.set(
    path.normalize(path.join(root, relativePath)),
    await readFile(path.join(outputRoot, relativePath), 'utf8'),
  );
}
const generatedDirectories = new Set();
for (const fileName of generated.keys()) {
  let directory = path.dirname(fileName);
  while (directory.startsWith(root)) {
    generatedDirectories.add(path.normalize(directory));
    if (directory === root) break;
    directory = path.dirname(directory);
  }
}

const tsconfigPath = path.join(root, 'packages/core-service/tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (configFile.error) {
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
}
const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(tsconfigPath),
  { noEmit: true },
  tsconfigPath,
);
const host = ts.createCompilerHost(parsed.options);
const originalReadFile = host.readFile.bind(host);
const originalFileExists = host.fileExists.bind(host);
const originalDirectoryExists = host.directoryExists?.bind(host) ?? ts.sys.directoryExists;
host.fileExists = (fileName) =>
  generated.has(path.normalize(fileName)) || originalFileExists(fileName);
host.readFile = (fileName) => generated.get(path.normalize(fileName)) ?? originalReadFile(fileName);
host.directoryExists = (directoryName) =>
  generatedDirectories.has(path.normalize(directoryName)) || originalDirectoryExists(directoryName);
host.getSourceFile = (fileName, languageVersion) => {
  const text = host.readFile(fileName);
  return text === undefined
    ? undefined
    : ts.createSourceFile(fileName, text, languageVersion, true);
};
const rootNames = [...new Set([...parsed.fileNames, ...generated.keys()])];
const program = ts.createProgram({ rootNames, options: parsed.options, host });
const diagnostics = ts.getPreEmitDiagnostics(program);
const diagnosticText = diagnostics
  .map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${path.relative(root, diagnostic.file.fileName)}:${location.line + 1}:${location.character + 1} ${message}`;
  })
  .join('\n');
await writeFile(path.join(outputRoot, 'diagnostics.txt'), `${diagnosticText}\n`, 'utf8');
await writeFile(
  summaryPath,
  `${JSON.stringify({ ...summary, diagnosticCount: diagnostics.length }, null, 2)}\n`,
  'utf8',
);
if (diagnostics.length > 0) {
  throw new Error(`AR-12 candidate has ${diagnostics.length} TypeScript diagnostics.`);
}
