import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import prettier from 'prettier';
import ts from 'typescript';

const root = process.cwd();
const outputRoot = path.join(root, 'test-results/ar11-service-split');
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const prettierConfig = (await prettier.resolveConfig('packages/core-service/src/state-proposal.ts')) ?? {};

function parseSource(relativePath) {
  const absolutePath = path.join(root, relativePath);
  return readFile(absolutePath, 'utf8').then((text) => ({
    relativePath,
    absolutePath,
    text,
    sourceFile: ts.createSourceFile(
      absolutePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  }));
}

function nodeName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (node.name && ts.isStringLiteral(node.name)) return node.name.text;
  if (ts.isVariableStatement(node)) {
    const declaration = node.declarationList.declarations[0];
    if (declaration && ts.isIdentifier(declaration.name)) return declaration.name.text;
  }
  return null;
}

function isExported(node) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
}

function declarationKind(node) {
  return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node) ? 'type' : 'value';
}

function collectImports(sourceFile) {
  const bindings = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const moduleName = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause.name) {
      bindings.set(clause.name.text, {
        moduleName,
        importedName: 'default',
        typeOnly: clause.isTypeOnly,
      });
    }
    const namedBindings = clause.namedBindings;
    if (namedBindings && ts.isNamedImports(namedBindings)) {
      for (const element of namedBindings.elements) {
        bindings.set(element.name.text, {
          moduleName,
          importedName: element.propertyName?.text ?? element.name.text,
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        });
      }
    }
  }
  return bindings;
}

function topLevelDeclarations(sourceFile) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) continue;
    const name = nodeName(statement);
    if (name) declarations.set(name, statement);
  }
  return declarations;
}

function classMethod(classNode, methodName) {
  const method = classNode.members.find(
    (member) => ts.isMethodDeclaration(member) && nodeName(member) === methodName,
  );
  if (!method || !ts.isMethodDeclaration(method) || !method.body) {
    throw new Error(`Method ${methodName} was not found.`);
  }
  return method;
}

function methodParameterNames(method) {
  return method.parameters.map((parameter) => {
    if (!ts.isIdentifier(parameter.name)) {
      throw new Error(`AR-11 generator does not support destructured parameter in ${nodeName(method)}.`);
    }
    return parameter.name.text;
  });
}

function methodFunctionText(method, contextType) {
  const name = nodeName(method);
  const parameters = method.parameters.map((parameter) => printer.printNode(
    ts.EmitHint.Unspecified,
    parameter,
    method.getSourceFile(),
  ));
  const returnType = method.type
    ? `: ${printer.printNode(ts.EmitHint.Unspecified, method.type, method.getSourceFile())}`
    : '';
  const asyncPrefix = method.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ? 'async '
    : '';
  let body = method.body.getText(method.getSourceFile());
  body = body
    .replaceAll('this.#workspace', 'context.workspace')
    .replaceAll('this.#clock', 'context.clock')
    .replaceAll('this.#idFactory', 'context.idFactory')
    .replace(/this\.([A-Za-z][A-Za-z0-9_]*)\(\)/gu, '$1(context)')
    .replace(/this\.([A-Za-z][A-Za-z0-9_]*)\(/gu, '$1(context, ');
  return `export ${asyncPrefix}function ${name}(context: ${contextType}${parameters.length ? `, ${parameters.join(', ')}` : ''})${returnType} ${body}`;
}

function facadeMethodText(method) {
  const sourceFile = method.getSourceFile();
  const signature = sourceFile.text.slice(method.getStart(sourceFile), method.body.getStart(sourceFile)).trim();
  const args = methodParameterNames(method).join(', ');
  return `${signature}{\n    return ${nodeName(method)}(this.#context${args ? `, ${args}` : ''});\n  }`;
}

function ensureExport(text) {
  const trimmed = text.trimStart();
  return trimmed.startsWith('export ') ? text : `export ${text}`;
}

function adjustOriginalModule(moduleName) {
  return moduleName.startsWith('./') ? `../${moduleName.slice(2)}` : moduleName;
}

function parseGenerated(filePath, content) {
  return ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function declaredNames(sourceFile) {
  const names = new Set();
  for (const statement of sourceFile.statements) {
    const name = nodeName(statement);
    if (name) names.add(name);
  }
  return names;
}

function referencedIdentifiers(sourceFile) {
  const names = new Set();
  const visit = (node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    ts.forEachChild(node, visit);
  };
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) visit(statement);
  }
  return names;
}

function importLines(content, intendedPath, originalImports, ownership) {
  const sourceFile = parseGenerated(intendedPath, content);
  const locals = declaredNames(sourceFile);
  const references = referencedIdentifiers(sourceFile);
  const byModule = new Map();
  const add = (moduleName, binding) => {
    const entries = byModule.get(moduleName) ?? [];
    entries.push(binding);
    byModule.set(moduleName, entries);
  };
  for (const identifier of references) {
    if (locals.has(identifier)) continue;
    const owned = ownership.get(identifier);
    if (owned && owned.path !== intendedPath) {
      const fromDirectory = path.posix.dirname(intendedPath);
      let relative = path.posix.relative(fromDirectory, owned.path).replace(/\.ts$/u, '.js');
      if (!relative.startsWith('.')) relative = `./${relative}`;
      add(relative, {
        localName: identifier,
        importedName: identifier,
        typeOnly: owned.typeOnly,
      });
      continue;
    }
    const original = originalImports.get(identifier);
    if (original) {
      add(adjustOriginalModule(original.moduleName), {
        localName: identifier,
        importedName: original.importedName,
        typeOnly: original.typeOnly,
      });
    }
  }
  return [...byModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([moduleName, rawEntries]) => {
      const entries = [...new Map(rawEntries.map((entry) => [entry.localName, entry])).values()]
        .sort((left, right) => left.localName.localeCompare(right.localName, 'en'));
      const defaultEntry = entries.find((entry) => entry.importedName === 'default');
      const named = entries.filter((entry) => entry.importedName !== 'default');
      const namedText = named.map((entry) => {
        const imported = entry.importedName === entry.localName
          ? entry.localName
          : `${entry.importedName} as ${entry.localName}`;
        return entry.typeOnly ? `type ${imported}` : imported;
      }).join(', ');
      if (defaultEntry && namedText) {
        return `import ${defaultEntry.localName}, { ${namedText} } from '${moduleName}';`;
      }
      if (defaultEntry) return `import ${defaultEntry.localName} from '${moduleName}';`;
      return `import { ${namedText} } from '${moduleName}';`;
    })
    .join('\n');
}

function declarationText(declarations, names) {
  return names.map((name) => {
    const declaration = declarations.get(name);
    if (!declaration) throw new Error(`Declaration ${name} was not found.`);
    return ensureExport(printer.printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile()));
  }).join('\n\n');
}

function ownershipFor(groups, declarations, methodGroups, contextNames) {
  const map = new Map();
  for (const group of groups) {
    for (const name of group.declarations) {
      const node = declarations.get(name);
      map.set(name, { path: group.path, typeOnly: declarationKind(node) === 'type' });
    }
    for (const name of group.methods ?? []) map.set(name, { path: group.path, typeOnly: false });
  }
  for (const [name, pathValue] of contextNames) {
    map.set(name, { path: pathValue, typeOnly: true });
  }
  for (const [name, pathValue] of methodGroups) {
    map.set(name, { path: pathValue, typeOnly: false });
  }
  return map;
}

async function formatFile(relativePath, content) {
  const importsRemoved = content.replace(/^(?:import[^;]+;\n)+/u, '');
  return prettier.format(importsRemoved, { ...prettierConfig, filepath: relativePath });
}

async function buildService(config) {
  const parsed = await parseSource(config.source);
  const imports = collectImports(parsed.sourceFile);
  const declarations = topLevelDeclarations(parsed.sourceFile);
  const facade = declarations.get(config.facade);
  if (!facade || !ts.isClassDeclaration(facade)) throw new Error(`${config.facade} was not found.`);

  const methodGroups = new Map();
  for (const group of config.groups) {
    for (const method of group.methods ?? []) methodGroups.set(method, group.path);
  }
  const ownership = ownershipFor(
    config.groups,
    declarations,
    methodGroups,
    new Map([[config.contextName, config.contextPath]]),
  );
  const generated = new Map();

  for (const group of config.groups) {
    const pieces = [];
    if (group.contextText) pieces.push(group.contextText);
    if (group.declarations.length) pieces.push(declarationText(declarations, group.declarations));
    for (const methodName of group.methods ?? []) {
      pieces.push(methodFunctionText(classMethod(facade, methodName), config.contextName));
    }
    const body = pieces.join('\n\n');
    const importsText = importLines(body, group.path, imports, ownership);
    generated.set(group.path, await formatFile(group.path, `${importsText}\n\n${body}\n`));
  }

  const publicNames = [...declarations.values()]
    .filter((node) => isExported(node) && node !== facade)
    .map(nodeName)
    .filter(Boolean);
  const allMethodNames = facade.members
    .filter((member) => ts.isMethodDeclaration(member))
    .map(nodeName)
    .filter(Boolean);
  const operationImports = allMethodNames.map((name) => {
    const owner = ownership.get(name);
    const serviceDirectory = path.posix.dirname(config.servicePath);
    let relative = path.posix.relative(serviceDirectory, owner.path).replace(/\.ts$/u, '.js');
    if (!relative.startsWith('.')) relative = `./${relative}`;
    return { name, relative };
  });
  const operationsByModule = new Map();
  for (const operation of operationImports) {
    const names = operationsByModule.get(operation.relative) ?? [];
    names.push(operation.name);
    operationsByModule.set(operation.relative, names);
  }
  const operationImportText = [...operationsByModule.entries()]
    .map(([moduleName, names]) => `import { ${names.join(', ')} } from '${moduleName}';`)
    .join('\n');
  const contextOwner = ownership.get(config.contextName);
  const serviceDirectory = path.posix.dirname(config.servicePath);
  let contextRelative = path.posix.relative(serviceDirectory, contextOwner.path).replace(/\.ts$/u, '.js');
  if (!contextRelative.startsWith('.')) contextRelative = `./${contextRelative}`;
  const publicByModule = new Map();
  for (const name of publicNames) {
    const owner = ownership.get(name);
    if (!owner) throw new Error(`Public declaration ${name} has no owner.`);
    let relative = path.posix.relative(serviceDirectory, owner.path).replace(/\.ts$/u, '.js');
    if (!relative.startsWith('.')) relative = `./${relative}`;
    const names = publicByModule.get(relative) ?? [];
    names.push(name);
    publicByModule.set(relative, names);
  }
  const publicExportText = [...publicByModule.entries()]
    .map(([moduleName, names]) => `export { ${names.join(', ')} } from '${moduleName}';`)
    .join('\n');
  const facadeMethods = facade.members
    .filter((member) => ts.isMethodDeclaration(member))
    .map((method) => facadeMethodText(method))
    .join('\n\n');
  const optionsName = config.optionsName;
  const contextTypeImport = `import type { ${config.contextName}, ${optionsName} } from '${contextRelative}';`;
  const serviceBody = `${operationImportText}\n${contextTypeImport}\nimport type { DatabaseClock } from '../database/index.js';\nimport type { ProjectWorkspaceService } from '../project-workspace.js';\n\n${publicExportText}\n\nconst systemClock: DatabaseClock = { now: () => new Date() };\n\nexport class ${config.facade} {\n  readonly #context: ${config.contextName};\n\n  constructor(workspace: ProjectWorkspaceService, options: ${optionsName} = {}) {\n    this.#context = {\n      workspace,\n      clock: options.clock ?? systemClock,\n      idFactory: options.idFactory ?? randomUUID,\n    };\n  }\n\n${facadeMethods.split('\n').map((line) => `  ${line}`).join('\n')}\n}\n`;
  const serviceImports = importLines(serviceBody, config.servicePath, imports, ownership);
  generated.set(
    config.servicePath,
    await formatFile(config.servicePath, `${serviceImports}\n\n${serviceBody}\n`),
  );
  generated.set(config.source, `export * from './${config.compatibilityTarget}';\n`);
  return generated;
}

const stateConfig = {
  source: 'packages/core-service/src/state-proposal.ts',
  facade: 'StateProposalService',
  optionsName: 'StateProposalServiceOptions',
  contextName: 'StateProposalServiceContext',
  contextPath: 'packages/core-service/src/state/state-row-mappers.ts',
  servicePath: 'packages/core-service/src/state/state-proposal-service.ts',
  compatibilityTarget: 'state/state-proposal-service.js',
  groups: [
    {
      path: 'packages/core-service/src/state/state-row-mappers.ts',
      contextText: `export interface StateProposalServiceContext {\n  readonly workspace: ProjectWorkspaceService;\n  readonly clock: DatabaseClock;\n  readonly idFactory: () => string;\n}`,
      declarations: [
        'ChangeType',
        'InvalidationScope',
        'ProposalRow',
        'ProposalBatchRow',
        'SnapshotRow',
        'InvalidationRow',
        'EntityStateRow',
        'VersionSourceRow',
        'StateProposalServiceErrorCode',
        'StateProposalServiceError',
        'StateProposalServiceOptions',
        'ProviderProposalBatchCompletionInput',
        'parseJson',
        'mapProposal',
        'mapBatch',
        'mapSnapshot',
        'mapInvalidation',
      ],
      methods: [],
    },
    {
      path: 'packages/core-service/src/state/proposal-batch-repository.ts',
      declarations: [
        'ProposalDraft',
        'ProposalBatchInsertInput',
        'authorOnly',
        'assertEntity',
        'assertMilestone',
        'validateVersionBlockEvidence',
        'currentEntityState',
        'applyEntityState',
        'assertMilestoneDependenciesHit',
        'applyArcMilestone',
        'insertProposalBatch',
        'refreshBatchStatus',
        'catalog',
      ],
      methods: ['list', 'generate', 'completeProviderBatch', 'resolve'],
    },
    {
      path: 'packages/core-service/src/state/ending-snapshot-service.ts',
      declarations: [
        'ChapterPosition',
        'HistoricalForeshadowingStatus',
        'ForeshadowingEventRow',
        'assertFinalVersion',
        'chapterPositions',
        'requiredPosition',
        'effectiveAt',
        'historicalForeshadowings',
        'historicalArcMilestones',
        'snapshotContent',
        'snapshotRow',
      ],
      methods: ['refreshSnapshot', 'readSnapshot'],
    },
    {
      path: 'packages/core-service/src/state/derived-invalidation-service.ts',
      declarations: ['scopesFor'],
      methods: ['invalidateDerived'],
    },
  ],
};

const generationConfig = {
  source: 'packages/core-service/src/generation-run.ts',
  facade: 'GenerationRunService',
  optionsName: 'GenerationRunServiceOptions',
  contextName: 'GenerationRunServiceContext',
  contextPath: 'packages/core-service/src/generation/run-repository.ts',
  servicePath: 'packages/core-service/src/generation/generation-run-service.ts',
  compatibilityTarget: 'generation/generation-run-service.js',
  groups: [
    {
      path: 'packages/core-service/src/generation/run-repository.ts',
      contextText: `export interface GenerationRunServiceContext {\n  readonly workspace: ProjectWorkspaceService;\n  readonly clock: DatabaseClock;\n  readonly idFactory: () => string;\n}`,
      declarations: [
        'GenerationRunServiceErrorCode',
        'GenerationRunServiceError',
        'GenerationRunServiceOptions',
        'GenerationRunCreateInput',
        'GenerationInputSourceInput',
        'GenerationRunIdentity',
        'GenerationRunStageInput',
        'GenerationUsage',
        'GenerationProseCandidateInput',
        'GenerationCandidateSourceMappingInput',
        'GenerationSkeletonCandidateInput',
        'GenerationSkeletonCompletionInput',
        'GenerationCompletion',
        'GenerationSkeletonCompletion',
        'GenerationPartialDecision',
        'GenerationContinuationContext',
        'GenerationRunRow',
        'GenerationResultRefRow',
        'PartialBufferRow',
        'DraftBaseRow',
        'DraftHashRow',
        'runSelect',
        'resultRefs',
        'mapRun',
        'readRun',
        'assertActive',
        'auditSources',
        'sha256',
      ],
      methods: [
        'create',
        'get',
        'list',
        'getContinuationContext',
        'markRunning',
        'markStage',
        'updateUsage',
        'cancel',
        'fail',
        'recoverInterrupted',
      ],
    },
    {
      path: 'packages/core-service/src/generation/candidate-persistence.ts',
      declarations: [
        'verifyDraftBase',
        'insertProseCandidate',
        'insertSkeletonCandidate',
        'candidateTypeForPartial',
      ],
      methods: ['completeProseCandidate', 'completeSkeletonCandidates'],
    },
    {
      path: 'packages/core-service/src/generation/partial-result-service.ts',
      declarations: [],
      methods: ['recordPartial', 'savePartial', 'discardPartial'],
    },
    {
      path: 'packages/core-service/src/generation/model-support-repository.ts',
      declarations: [],
      methods: ['getModelSupport', 'upsertModelSupport'],
    },
  ],
};

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const generated = new Map([
  ...(await buildService(stateConfig)),
  ...(await buildService(generationConfig)),
]);
for (const [relativePath, content] of generated) {
  const target = path.join(outputRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
}

const tsconfigPath = path.join(root, 'packages/core-service/tsconfig.json');
const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
if (configFile.error) throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(tsconfigPath),
  { noEmit: true },
  tsconfigPath,
);
const generatedAbsolute = new Map(
  [...generated].map(([relativePath, content]) => [path.normalize(path.join(root, relativePath)), content]),
);
const host = ts.createCompilerHost(parsedConfig.options);
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
});
const diagnostics = ts.getPreEmitDiagnostics(program);
const diagnosticText = diagnostics.map((diagnostic) => {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file || diagnostic.start === undefined) return message;
  const location = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
  return `${path.relative(root, diagnostic.file.fileName)}:${location.line + 1}:${location.character + 1} ${message}`;
}).join('\n');
await writeFile(path.join(outputRoot, 'diagnostics.txt'), `${diagnosticText}\n`, 'utf8');
await writeFile(
  path.join(outputRoot, 'summary.json'),
  `${JSON.stringify({ files: [...generated.keys()], diagnosticCount: diagnostics.length }, null, 2)}\n`,
  'utf8',
);
if (diagnostics.length > 0) throw new Error(`AR-11 candidate has ${diagnostics.length} TypeScript diagnostics.`);
