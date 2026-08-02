import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';
import ts from 'typescript';

const repositoryRoot = process.cwd();
const sourcePath = path.join(repositoryRoot, 'apps/desktop/main/src/ipc-handlers.ts');
const outputRoot = path.join(repositoryRoot, 'test-results/ar10-main-ipc-split');
const sourceText = await readFile(sourcePath, 'utf8');
const sourceFile = ts.createSourceFile(
  sourcePath,
  sourceText,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TS,
);
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const prettierConfig = (await prettier.resolveConfig(sourcePath)) ?? {};

const importBindings = new Map();
for (const statement of sourceFile.statements) {
  if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
  const moduleName = statement.moduleSpecifier.text;
  const clause = statement.importClause;
  if (clause.name) {
    importBindings.set(clause.name.text, {
      moduleName,
      importedName: 'default',
      typeOnly: clause.isTypeOnly,
    });
  }
  const bindings = clause.namedBindings;
  if (bindings && ts.isNamedImports(bindings)) {
    for (const element of bindings.elements) {
      importBindings.set(element.name.text, {
        moduleName,
        importedName: element.propertyName?.text ?? element.name.text,
        typeOnly: clause.isTypeOnly || element.isTypeOnly,
      });
    }
  }
}

const registerFunction = sourceFile.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'registerIpcHandlers',
);
if (!registerFunction?.body) throw new Error('registerIpcHandlers was not found.');

const topLevelSupport = sourceFile.statements.filter(
  (statement) =>
    !ts.isImportDeclaration(statement) &&
    statement !== registerFunction &&
    !ts.isExportDeclaration(statement),
);

function statementText(statement) {
  return printer.printNode(ts.EmitHint.Unspecified, statement, sourceFile);
}

function declarationName(statement) {
  if (!ts.isVariableStatement(statement)) return null;
  const declaration = statement.declarationList.declarations[0];
  return declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : null;
}

const bodyStatements = [...registerFunction.body.statements];
const sharedNames = new Set(['appDataFailure', 'cancelledSelection', 'invokeProject']);
const ignoredNames = new Set(['invokeChannels']);
const sharedStatements = bodyStatements.filter((statement) =>
  sharedNames.has(declarationName(statement)),
);
const providerStatement = bodyStatements.find(
  (statement) => declarationName(statement) === 'disposeProviderHandlers',
);
if (!providerStatement) throw new Error('Provider handler registration was not found.');

const contextSetupStatements = bodyStatements.filter((statement) => {
  const name = declarationName(statement);
  return name === 'register' || name === 'rejectUntrusted' || name === 'invalidRequest';
});

const registrationStatements = bodyStatements.filter((statement) => {
  const name = declarationName(statement);
  if (name && (sharedNames.has(name) || ignoredNames.has(name))) return false;
  if (statement === providerStatement) return false;
  if (ts.isReturnStatement(statement)) return false;
  const text = statementText(statement);
  return (
    text.includes('register(') ||
    text.includes('connectTaskEvents') ||
    text.includes('taskConnectEvents') ||
    name === 'diagnostics'
  );
});

function classify(statement) {
  const text = statementText(statement);
  if (
    text.includes('taskConnectEvents') ||
    text.includes('connectTaskEvents') ||
    text.includes('TaskGetSnapshotCommandSchema') ||
    text.includes('TaskCancelCommandSchema') ||
    text.includes('TaskListActiveCommandSchema') ||
    text.includes('TaskPortConnectSchema')
  ) {
    return 'task';
  }
  if (
    text.includes('Recovery') ||
    text.includes('RECOVERY_COMMANDS') ||
    text.includes('ImportPreviewCommandSchema') ||
    text.includes('ImportCommitCommandSchema') ||
    text.includes('ExportVersionListCommandSchema') ||
    text.includes('ExportVersionsCommandSchema') ||
    text.includes('TEXT_IO_COMMANDS')
  ) {
    return 'recovery';
  }
  if (
    text.includes('Entity') ||
    text.includes('CanonFact') ||
    text.includes('ENTITY_CANON_COMMANDS')
  ) {
    return 'canon';
  }
  if (
    text.includes('ProjectGetBriefCommandSchema') ||
    text.includes('PlotNode') ||
    text.includes('SceneBeat') ||
    text.includes('PROJECT_PLANNING_COMMANDS') ||
    text.includes('SCENE_BEAT_COMMANDS')
  ) {
    return 'planning';
  }
  if (
    text.includes('Structure') ||
    text.includes('Volume') ||
    text.includes('Chapter') ||
    text.includes('Trash') ||
    text.includes('PermanentDelete') ||
    text.includes('SplitChapter') ||
    text.includes('MergeChapters') ||
    text.includes('MoveBlocks') ||
    text.includes('PROJECT_STRUCTURE_COMMANDS')
  ) {
    return 'structure';
  }
  if (
    text.includes('Draft') ||
    text.includes('Candidate') ||
    text.includes('VersionCreateCommandSchema') ||
    text.includes('VersionGetCommandSchema') ||
    text.includes('VersionListCommandSchema') ||
    text.includes('VersionRestoreCommandSchema') ||
    text.includes('VersionSetFinalCommandSchema') ||
    text.includes('VERSION_COMMANDS') ||
    text.includes('AiSetCredentialCommandSchema') ||
    text.includes('AiRemoveCredentialCommandSchema') ||
    text.includes('AiHasCredentialCommandSchema') ||
    text.includes('CANDIDATE_COMMANDS')
  ) {
    return 'writing';
  }
  if (
    text.includes('ProjectGetActiveCommandSchema') ||
    text.includes('ProjectGetContinuationCommandSchema') ||
    text.includes('ProjectSaveContinuationCommandSchema') ||
    text.includes('ProjectCreateCommandSchema') ||
    text.includes('ProjectOpenSelectedCommandSchema') ||
    text.includes('ProjectOpenRecentCommandSchema') ||
    text.includes('ProjectCloseCommandSchema') ||
    text.includes('ProjectMoveCommandSchema') ||
    text.includes('PROJECT_WORKSPACE_COMMANDS')
  ) {
    return 'project';
  }
  return 'app';
}

const groupNames = [
  'app',
  'project',
  'recovery',
  'planning',
  'canon',
  'structure',
  'writing',
  'task',
];
const groups = new Map(groupNames.map((name) => [name, []]));
for (const statement of registrationStatements) groups.get(classify(statement)).push(statement);

function collectIdentifiers(nodes) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  for (const node of nodes) visit(node);
  return names;
}

function importText(nodes) {
  const identifiers = collectIdentifiers(nodes);
  const byModule = new Map();
  for (const identifier of identifiers) {
    const binding = importBindings.get(identifier);
    if (!binding) continue;
    const entries = byModule.get(binding.moduleName) ?? [];
    entries.push({ localName: identifier, ...binding });
    byModule.set(binding.moduleName, entries);
  }
  return [...byModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([moduleName, entries]) => {
      const unique = [...new Map(entries.map((entry) => [entry.localName, entry])).values()].sort(
        (left, right) => left.localName.localeCompare(right.localName),
      );
      const defaultEntry = unique.find((entry) => entry.importedName === 'default');
      const named = unique.filter((entry) => entry.importedName !== 'default');
      const namedText = named
        .map((entry) => {
          const imported =
            entry.importedName === entry.localName
              ? entry.localName
              : `${entry.importedName} as ${entry.localName}`;
          return entry.typeOnly ? `type ${imported}` : imported;
        })
        .join(', ');
      if (defaultEntry && namedText) {
        return `import ${defaultEntry.localName}, { ${namedText} } from '${moduleName}';`;
      }
      if (defaultEntry) return `import ${defaultEntry.localName} from '${moduleName}';`;
      return `import { ${namedText} } from '${moduleName}';`;
    })
    .join('\n');
}

function exportOptionsInterface(text) {
  return text.replace(/^interface IpcHandlerOptions/u, 'export interface IpcHandlerOptions');
}

function indent(text, spaces) {
  const prefix = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join('\n');
}

const supportText = topLevelSupport.map(statementText).map(exportOptionsInterface).join('\n\n');
const contextNodes = [...topLevelSupport, ...contextSetupStatements, ...sharedStatements];
const contextImports = importText(contextNodes);
const registerSetup = contextSetupStatements
  .map(statementText)
  .join('\n\n')
  .replace(
    'options.ipcMain.handle(channel, async (event, input) => {',
    "invokeChannels.add(channel);\n    options.ipcMain.handle(channel, async (event, input) => {",
  );
const sharedText = sharedStatements.map(statementText).join('\n\n');
const guardSource = `${contextImports}\n\n${supportText}\n\nexport function createIpcHandlerContext(options: IpcHandlerOptions) {\n  const invokeChannels = new Set<string>();\n\n${indent(registerSetup, 2)}\n\n${indent(sharedText, 2)}\n\n  const disposeInvokeHandlers = (): void => {\n    for (const channel of invokeChannels) options.ipcMain.removeHandler(channel);\n    invokeChannels.clear();\n  };\n\n  return {\n    options,\n    register,\n    rejectUntrusted,\n    invalidRequest,\n    appDataFailure,\n    cancelledSelection,\n    invokeProject,\n    trustedSender,\n    success,\n    failure,\n    disposeInvokeHandlers,\n  };\n}\n\nexport type IpcHandlerContext = ReturnType<typeof createIpcHandlerContext>;\n`;

const contextNames = [
  'options',
  'register',
  'rejectUntrusted',
  'invalidRequest',
  'appDataFailure',
  'cancelledSelection',
  'invokeProject',
  'trustedSender',
  'success',
  'failure',
];

function registrarFile(groupName, statements) {
  const identifiers = collectIdentifiers(statements);
  const destructured = contextNames.filter((name) => identifiers.has(name));
  const imports = importText(statements);
  const functionName = `register${groupName[0].toUpperCase()}${groupName.slice(1)}IpcHandlers`;
  const body = statements.map(statementText).join('\n\n');
  const returnType = groupName === 'task' ? '() => void' : 'void';
  const tail =
    groupName === 'task'
      ? "\n\n  return () => options.ipcMain.removeListener(IPC_CHANNELS.taskConnectEvents, connectTaskEvents);"
      : '';
  return `${imports}${imports ? '\n\n' : ''}import type { IpcHandlerContext } from './handler-guard.js';\n\nexport function ${functionName}(context: IpcHandlerContext): ${returnType} {\n  const { ${destructured.join(', ')} } = context;\n\n${indent(body, 2)}${tail}\n}\n`;
}

const rootSource = `import { createIpcHandlerContext, type IpcHandlerOptions } from './handler-guard.js';\nimport { registerProviderIpcHandlers } from './provider-ipc-handlers.js';\nimport { registerAppIpcHandlers } from './app-ipc-handlers.js';\nimport { registerProjectIpcHandlers } from './project-ipc-handlers.js';\nimport { registerRecoveryIpcHandlers } from './recovery-ipc-handlers.js';\nimport { registerPlanningIpcHandlers } from './planning-ipc-handlers.js';\nimport { registerCanonIpcHandlers } from './canon-ipc-handlers.js';\nimport { registerStructureIpcHandlers } from './structure-ipc-handlers.js';\nimport { registerWritingIpcHandlers } from './writing-ipc-handlers.js';\nimport { registerTaskIpcHandlers } from './task-ipc-handlers.js';\n\nexport type { IpcHandlerOptions } from './handler-guard.js';\n\nexport function registerIpcHandlers(options: IpcHandlerOptions): () => void {\n  const context = createIpcHandlerContext(options);\n  const disposeProviderHandlers = registerProviderIpcHandlers({\n    ipcMain: options.ipcMain,\n    supervisor: options.supervisor,\n    credentialBroker: options.credentialBroker,\n    rendererUrl: options.rendererUrl,\n    logger: options.logger,\n  });\n\n  registerAppIpcHandlers(context);\n  registerProjectIpcHandlers(context);\n  registerRecoveryIpcHandlers(context);\n  registerPlanningIpcHandlers(context);\n  registerCanonIpcHandlers(context);\n  registerStructureIpcHandlers(context);\n  registerWritingIpcHandlers(context);\n  const disposeTaskHandlers = registerTaskIpcHandlers(context);\n\n  return () => {\n    disposeProviderHandlers();\n    context.disposeInvokeHandlers();\n    disposeTaskHandlers();\n  };\n}\n`;

async function formatAndWrite(relativePath, content) {
  const formatted = await prettier.format(content, { ...prettierConfig, filepath: relativePath });
  const targetPath = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, formatted, 'utf8');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
await formatAndWrite('ipc-handlers.ts', rootSource);
await formatAndWrite('handler-guard.ts', guardSource);
for (const [groupName, statements] of groups) {
  await formatAndWrite(`${groupName}-ipc-handlers.ts`, registrarFile(groupName, statements));
}
await writeFile(
  path.join(outputRoot, 'generation-summary.json'),
  `${JSON.stringify(
    {
      source: path.relative(repositoryRoot, sourcePath),
      groups: Object.fromEntries([...groups].map(([name, statements]) => [name, statements.length])),
      files: [
        'ipc-handlers.ts',
        'handler-guard.ts',
        ...[...groups.keys()].map((name) => `${name}-ipc-handlers.ts`),
      ],
    },
    null,
    2,
  )}\n`,
  'utf8',
);
