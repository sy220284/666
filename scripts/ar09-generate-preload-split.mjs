import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { format, resolveConfig } from 'prettier';
import ts from 'typescript';

const sourcePath = path.resolve('apps/desktop/preload/src/index.ts');
const outputDirectory = path.resolve(
  process.argv[2] ?? 'test-results/unit/ar09-generated/apps/desktop/preload/src',
);
const source = await readFile(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const prettierConfig = (await resolveConfig(sourcePath)) ?? {};

function fail(message) {
  throw new Error(`AR-09 preload split generation failed: ${message}`);
}

const contractsImport = sourceFile.statements.find(
  (statement) =>
    ts.isImportDeclaration(statement) && statement.moduleSpecifier.text === '@worldforge/contracts',
);
if (!contractsImport || !contractsImport.importClause?.namedBindings) {
  fail('contracts import not found');
}
if (!ts.isNamedImports(contractsImport.importClause.namedBindings)) {
  fail('contracts import is not named');
}

const contractImports = new Map();
for (const specifier of contractsImport.importClause.namedBindings.elements) {
  contractImports.set(specifier.name.text, {
    imported: specifier.propertyName?.text ?? specifier.name.text,
    typeOnly: contractsImport.importClause.isTypeOnly || specifier.isTypeOnly,
  });
}

let candidateBridgeNode;
let bridgeObject;
for (const statement of sourceFile.statements) {
  if (ts.isTypeAliasDeclaration(statement) && statement.name.text === 'CandidateBridge') {
    candidateBridgeNode = statement;
  }
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === 'bridge' &&
      declaration.initializer &&
      ts.isObjectLiteralExpression(declaration.initializer)
    ) {
      bridgeObject = declaration.initializer;
    }
  }
}
if (!candidateBridgeNode) fail('CandidateBridge type not found');
if (!bridgeObject) fail('bridge object not found');

const properties = new Map();
for (const property of bridgeObject.properties) {
  if (!ts.isPropertyAssignment(property) || !ts.isIdentifier(property.name)) continue;
  properties.set(property.name.text, property);
}

function collectContractIdentifiers(node, extra = []) {
  const used = new Set(extra);
  function visit(current) {
    if (ts.isIdentifier(current) && contractImports.has(current.text)) used.add(current.text);
    ts.forEachChild(current, visit);
  }
  visit(node);
  return used;
}

function formatContractImport(identifiers) {
  const values = [];
  const types = [];
  for (const name of [...identifiers].sort()) {
    const metadata = contractImports.get(name);
    if (!metadata) fail(`unknown contract import ${name}`);
    const rendered = metadata.imported === name ? name : `${metadata.imported} as ${name}`;
    (metadata.typeOnly ? types : values).push(rendered);
  }
  const entries = [...values, ...types.map((entry) => `type ${entry}`)];
  return entries.length === 0
    ? ''
    : `import {\n${entries.map((entry) => `  ${entry},`).join('\n')}\n} from '@worldforge/contracts';\n`;
}

const groups = [
  {
    file: 'app-bridge-factory.ts',
    functionName: 'createAppBridge',
    keys: ['app', 'providers', 'generation', 'settings', 'ai'],
  },
  {
    file: 'recovery-bridge-factory.ts',
    functionName: 'createRecoveryBridge',
    keys: ['recovery', 'textIo'],
  },
  {
    file: 'project-bridge-factory.ts',
    functionName: 'createProjectBridge',
    keys: ['project', 'trash'],
  },
  {
    file: 'planning-bridge-factory.ts',
    functionName: 'createPlanningBridge',
    keys: ['planning', 'canon'],
  },
];

function requireProperties(keys) {
  return keys.map((key) => {
    const property = properties.get(key);
    if (!property) fail(`bridge property ${key} not found`);
    return property;
  });
}

function pickType(keys) {
  return `Pick<WorldforgeBridge, ${keys.map((key) => `'${key}'`).join(' | ')}>`;
}

async function writeGenerated(fileName, content) {
  const filePath = path.join(outputDirectory, fileName);
  const formatted = await format(`${content.trim()}\n`, {
    ...prettierConfig,
    filepath: filePath,
  });
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(filePath, formatted, 'utf8');
}

await writeGenerated(
  'bridge-runtime.ts',
  `import { PROTOCOL_VERSION } from '@worldforge/contracts';
import { ipcRenderer } from 'electron';

export interface Parser<Result> {
  parse(input: unknown): Result;
}

export function envelope(
  command: string,
  payload: unknown,
  projectId?: string,
): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    requestId: globalThis.crypto.randomUUID(),
    command,
    ...(projectId ? { projectId } : {}),
    payload,
    sentAt: new Date().toISOString(),
  };
}

export async function invoke<Result>(
  channel: string,
  command: unknown,
  resultSchema: Parser<Result>,
): Promise<Result> {
  const raw: unknown = await ipcRenderer.invoke(channel, command);
  return resultSchema.parse(raw);
}`,
);

for (const group of groups) {
  const groupProperties = requireProperties(group.keys);
  const used = new Set(['WorldforgeBridge']);
  for (const property of groupProperties) {
    for (const identifier of collectContractIdentifiers(property)) used.add(identifier);
  }
  const body = groupProperties.map((property) => property.getText(sourceFile)).join(',\n');
  await writeGenerated(
    group.file,
    `${formatContractImport(used)}import { envelope, invoke } from './bridge-runtime.js';

export function ${group.functionName}(): ${pickType(group.keys)} {
  return {
${body}
  };
}`,
  );
}

const writingProperties = requireProperties(['draft', 'candidate', 'version']);
const writingUsed = new Set(['WorldforgeBridge']);
for (const identifier of collectContractIdentifiers(candidateBridgeNode)) writingUsed.add(identifier);
for (const property of writingProperties) {
  for (const identifier of collectContractIdentifiers(property)) writingUsed.add(identifier);
}
await writeGenerated(
  'writing-bridge-factory.ts',
  `${formatContractImport(writingUsed)}import { envelope, invoke } from './bridge-runtime.js';

export ${candidateBridgeNode.getText(sourceFile)}

export function createWritingBridge(): Pick<WorldforgeBridge, 'draft' | 'version'> & CandidateBridge {
  return {
${writingProperties.map((property) => property.getText(sourceFile)).join(',\n')}
  };
}`,
);

const taskProperty = properties.get('task');
if (!taskProperty) fail('task bridge property not found');
const taskUsed = collectContractIdentifiers(taskProperty, ['WorldforgeBridge']);
const taskInitializer = taskProperty.initializer.getText(sourceFile).replaceAll('bridge.task', 'task');
await writeGenerated(
  'task-bridge-factory.ts',
  `${formatContractImport(taskUsed)}import { ipcRenderer } from 'electron';

import { envelope, invoke } from './bridge-runtime.js';

interface IsolatedMessagePort {
  onmessage: ((event: { readonly data: unknown }) => void) | null;
  postMessage(message: unknown): void;
  start(): void;
  close(): void;
}

interface IsolatedMessageChannel {
  readonly port1: IsolatedMessagePort;
  readonly port2: IsolatedMessagePort;
}

const MessageChannelConstructor = (
  globalThis as unknown as {
    readonly MessageChannel: new () => IsolatedMessageChannel;
  }
).MessageChannel;

export function createTaskBridge(): Pick<WorldforgeBridge, 'task'> {
  const task: WorldforgeBridge['task'] = ${taskInitializer};
  return { task };
}`,
);

await writeGenerated(
  'index.ts',
  `import type { WorldforgeBridge } from '@worldforge/contracts';
import { contextBridge } from 'electron';

import { createAppBridge } from './app-bridge-factory.js';
import { rendererLifecycleBridge } from './lifecycle-bridge.js';
import { createPlanningBridge } from './planning-bridge-factory.js';
import { createProjectBridge } from './project-bridge-factory.js';
import { createRecoveryBridge } from './recovery-bridge-factory.js';
import { createTaskBridge } from './task-bridge-factory.js';
import {
  createWritingBridge,
  type CandidateBridge,
} from './writing-bridge-factory.js';

const bridge: WorldforgeBridge & CandidateBridge = {
  lifecycle: rendererLifecycleBridge,
  ...createAppBridge(),
  ...createRecoveryBridge(),
  ...createProjectBridge(),
  ...createPlanningBridge(),
  ...createWritingBridge(),
  ...createTaskBridge(),
};

contextBridge.exposeInMainWorld('worldforge', bridge);

export const preloadLayer = {
  name: '@worldforge/preload',
  responsibility: 'validated-minimal-renderer-bridge',
} as const;`,
);

console.log(`Generated AR-09 preload split in ${outputDirectory}`);
