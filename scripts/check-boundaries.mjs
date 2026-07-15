import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageByPath = new Map([
  ['apps/desktop/main', '@worldforge/main'],
  ['apps/desktop/preload', '@worldforge/preload'],
  ['apps/desktop/renderer', '@worldforge/renderer'],
  ['packages/contracts', '@worldforge/contracts'],
  ['packages/domain', '@worldforge/domain'],
  ['packages/core-service', '@worldforge/core-service'],
  ['packages/editor-core', '@worldforge/editor-core'],
  ['packages/prompts', '@worldforge/prompts'],
  ['packages/testkit', '@worldforge/testkit'],
]);

const allowedInternalImports = new Map([
  ['@worldforge/main', new Set(['@worldforge/contracts'])],
  ['@worldforge/preload', new Set(['@worldforge/contracts'])],
  ['@worldforge/renderer', new Set(['@worldforge/contracts', '@worldforge/editor-core'])],
  ['@worldforge/contracts', new Set()],
  ['@worldforge/domain', new Set()],
  ['@worldforge/core-service', new Set(['@worldforge/contracts', '@worldforge/domain'])],
  ['@worldforge/editor-core', new Set(['@worldforge/contracts', '@worldforge/domain'])],
  ['@worldforge/prompts', new Set(['@worldforge/contracts', '@worldforge/domain'])],
  ['@worldforge/testkit', new Set(packageByPath.values())],
]);

const nodeRestrictedLayers = new Set([
  '@worldforge/renderer',
  '@worldforge/contracts',
  '@worldforge/domain',
]);

export function validateImport(sourcePackage, importedPackage) {
  if (importedPackage.startsWith('node:') && nodeRestrictedLayers.has(sourcePackage)) {
    return `${sourcePackage} may not import Node built-ins (${importedPackage})`;
  }

  if (!importedPackage.startsWith('@worldforge/')) return null;
  if (importedPackage === sourcePackage) return null;

  if (!allowedInternalImports.get(sourcePackage)?.has(importedPackage)) {
    return `${sourcePackage} may not import ${importedPackage}`;
  }

  return null;
}

async function listTypeScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listTypeScriptFiles(target)));
    if (entry.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name)) files.push(target);
  }
  return files;
}

function importsFrom(source) {
  const imports = [];
  const matcher = /(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(matcher)) {
    if (match[1]) imports.push(match[1]);
  }
  return imports;
}

export async function inspectBoundaries(rootDirectory = process.cwd()) {
  const violations = [];

  for (const [relativeDirectory, packageName] of packageByPath) {
    const sourceDirectory = path.join(rootDirectory, relativeDirectory, 'src');
    for (const file of await listTypeScriptFiles(sourceDirectory)) {
      const source = await readFile(file, 'utf8');
      for (const importedPackage of importsFrom(source)) {
        const violation = validateImport(packageName, importedPackage);
        if (violation) violations.push(`${path.relative(rootDirectory, file)}: ${violation}`);
      }
    }
  }

  if (violations.length > 0) throw new Error(violations.join('\n'));
  return packageByPath.size;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const count = await inspectBoundaries();
  console.log(`Validated boundaries for ${count} process and package layers.`);
}
