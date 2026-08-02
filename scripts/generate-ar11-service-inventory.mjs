import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';

const repositoryRoot = process.cwd();
const outputRoot = path.join(repositoryRoot, 'test-results/ar11-service-inventory');
const inputs = [
  {
    key: 'stateProposal',
    path: 'packages/core-service/src/state-proposal.ts',
    facade: 'StateProposalService',
  },
  {
    key: 'generation',
    path: 'packages/core-service/src/generation-run.ts',
    facade: 'GenerationRunService',
  },
];

function nameOf(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (node.name && ts.isStringLiteral(node.name)) return node.name.text;
  return null;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function collectReferencedIdentifiers(node) {
  const names = new Set();
  const visit = (current) => {
    if (ts.isIdentifier(current)) names.add(current.text);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return [...names].sort((left, right) => left.localeCompare(right, 'en'));
}

function inventoryFor(sourcePath, facadeName) {
  return readFile(sourcePath, 'utf8').then((sourceText) => {
    const sourceFile = ts.createSourceFile(
      sourcePath,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const functions = [];
    const interfaces = [];
    const types = [];
    const classes = [];
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        functions.push({
          name: statement.name.text,
          line: lineOf(sourceFile, statement),
          endLine: lineOf(sourceFile, statement.getLastToken(sourceFile)),
          async: Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)),
          references: collectReferencedIdentifiers(statement.body ?? statement),
        });
      } else if (ts.isInterfaceDeclaration(statement)) {
        interfaces.push({ name: statement.name.text, line: lineOf(sourceFile, statement) });
      } else if (ts.isTypeAliasDeclaration(statement)) {
        types.push({ name: statement.name.text, line: lineOf(sourceFile, statement) });
      } else if (ts.isClassDeclaration(statement) && statement.name) {
        classes.push({
          name: statement.name.text,
          line: lineOf(sourceFile, statement),
          methods: statement.members
            .filter((member) => ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member))
            .map((member) => ({
              name: ts.isConstructorDeclaration(member) ? 'constructor' : nameOf(member),
              line: lineOf(sourceFile, member),
              endLine: lineOf(sourceFile, member.getLastToken(sourceFile)),
              private: Boolean(
                member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword),
              ),
              references: collectReferencedIdentifiers(member.body ?? member),
            })),
        });
      }
    }
    const facade = classes.find((candidate) => candidate.name === facadeName);
    if (!facade) throw new Error(`${facadeName} was not found in ${sourcePath}.`);
    return {
      source: path.relative(repositoryRoot, sourcePath),
      lines: sourceText.split('\n').length,
      facade,
      functions,
      interfaces,
      types,
    };
  });
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const result = {};
for (const input of inputs) {
  result[input.key] = await inventoryFor(path.join(repositoryRoot, input.path), input.facade);
}
await writeFile(
  path.join(outputRoot, 'inventory.json'),
  `${JSON.stringify(result, null, 2)}\n`,
  'utf8',
);
