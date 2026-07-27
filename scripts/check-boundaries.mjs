import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { inspectWorkspaces } from './check-workspaces.mjs';

function internalPackageName(specifier) {
  if (!specifier.startsWith('@worldforge/')) return null;
  return specifier.split('/').slice(0, 2).join('/');
}

export function validateImport(sourcePackage, importedSpecifier, policy) {
  if (importedSpecifier.startsWith('node:') && policy.allowNodeBuiltins !== true) {
    return `${sourcePackage} may not import Node built-ins (${importedSpecifier})`;
  }
  const importedPackage = internalPackageName(importedSpecifier);
  if (!importedPackage || importedPackage === sourcePackage) return null;
  if (!new Set(policy.allowedInternalImports).has(importedPackage)) {
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
    if (entry.isFile() && /\.(?:ts|tsx|mts|cts)$/u.test(entry.name)) files.push(target);
  }
  return files;
}

export function importsFrom(source, fileName = 'source.ts') {
  const scriptKind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const imports = [];
  const record = (value) => {
    if (typeof value === 'string') imports.push(value);
  };
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      record(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      if (argument && ts.isStringLiteral(argument)) record(argument.text);
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const expression = node.moduleReference.expression;
      if (expression && ts.isStringLiteral(expression)) record(expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return imports;
}

export async function inspectBoundaries(rootDirectory = process.cwd()) {
  const violations = [];
  const workspaces = await inspectWorkspaces(rootDirectory);
  for (const { directory, manifest, policy } of workspaces) {
    if (!policy.buildable) continue;
    const sourceDirectory = path.join(rootDirectory, directory, 'src');
    for (const file of await listTypeScriptFiles(sourceDirectory)) {
      const source = await readFile(file, 'utf8');
      for (const importedSpecifier of importsFrom(source, file)) {
        const violation = validateImport(manifest.name, importedSpecifier, policy);
        if (violation) violations.push(`${path.relative(rootDirectory, file)}: ${violation}`);
      }
    }
  }
  if (violations.length > 0) throw new Error(violations.join('\n'));
  return workspaces.filter(({ policy }) => policy.buildable).length;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const count = await inspectBoundaries();
  console.log(`Validated AST import boundaries for ${count} workspace layers.`);
}
