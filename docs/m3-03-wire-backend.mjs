import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(before)) throw new Error(`Missing anchor in ${path}: ${before.slice(0, 80)}`);
  if (source.includes(after)) return;
  await writeFile(path, source.replace(before, after), 'utf8');
}

const contractsIndex = 'packages/contracts/src/index.ts';
await replaceExact(
  contractsIndex,
  `} from './scene-beat.js';\nimport {\n  DRAFT_COMMANDS,`,
  `} from './scene-beat.js';\nimport {\n  ENTITY_CANON_COMMANDS,\n  ENTITY_CANON_IPC_CHANNELS,\n  CanonFactSetCommandSchema,\n  EntityArchiveCommandSchema,\n  EntityCreateCommandSchema,\n  EntityDeleteCommandSchema,\n  EntityDeletePreviewCommandSchema,\n  EntityListCommandSchema,\n  EntityUpdateCommandSchema,\n  SceneBeatEntityLinkCommandSchema,\n  type CanonFactSetInput,\n  type EntityArchiveInput,\n  type EntityCatalog,\n  type EntityCreateInput,\n  type EntityDeleteInput,\n  type EntityDeletePreview,\n  type EntityDeletePreviewInput,\n  type EntityDeleteResult,\n  type EntityListInput,\n  type EntityUpdateInput,\n  type SceneBeatEntityLinkInput,\n} from './entity-canon.js';\nimport {\n  DRAFT_COMMANDS,`,
);
await replaceExact(
  contractsIndex,
  `export * from './scene-beat.js';\nexport * from './draft.js';`,
  `export * from './scene-beat.js';\nexport * from './entity-canon.js';\nexport * from './draft.js';`,
);
await replaceExact(
  contractsIndex,
  `  ...SCENE_BEAT_IPC_CHANNELS,\n  ...DRAFT_IPC_CHANNELS,`,
  `  ...SCENE_BEAT_IPC_CHANNELS,\n  ...ENTITY_CANON_IPC_CHANNELS,\n  ...DRAFT_IPC_CHANNELS,`,
);
await replaceExact(
  contractsIndex,
  `  ...SCENE_BEAT_COMMANDS,\n  ...DRAFT_COMMANDS,`,
  `  ...SCENE_BEAT_COMMANDS,\n  ...ENTITY_CANON_COMMANDS,\n  ...DRAFT_COMMANDS,`,
);
await replaceExact(
  contractsIndex,
  `  SceneBeatConvertBlocksCommandSchema,\n  DraftOpenCommandSchema,`,
  `  SceneBeatConvertBlocksCommandSchema,\n  EntityListCommandSchema,\n  EntityCreateCommandSchema,\n  EntityUpdateCommandSchema,\n  EntityArchiveCommandSchema,\n  CanonFactSetCommandSchema,\n  SceneBeatEntityLinkCommandSchema,\n  EntityDeletePreviewCommandSchema,\n  EntityDeleteCommandSchema,\n  DraftOpenCommandSchema,`,
);
await replaceExact(
  contractsIndex,
  `  };\n  readonly trash: {`,
  `  };\n  readonly canon: {\n    readonly list: (input: EntityListInput) => Promise<CommandResult<EntityCatalog>>;\n    readonly create: (input: EntityCreateInput) => Promise<CommandResult<EntityCatalog>>;\n    readonly update: (input: EntityUpdateInput) => Promise<CommandResult<EntityCatalog>>;\n    readonly archive: (input: EntityArchiveInput) => Promise<CommandResult<EntityCatalog>>;\n    readonly setFact: (input: CanonFactSetInput) => Promise<CommandResult<EntityCatalog>>;\n    readonly linkSceneBeat: (\n      input: SceneBeatEntityLinkInput,\n    ) => Promise<CommandResult<EntityCatalog>>;\n    readonly previewDelete: (\n      input: EntityDeletePreviewInput,\n    ) => Promise<CommandResult<EntityDeletePreview>>;\n    readonly delete: (input: EntityDeleteInput) => Promise<CommandResult<EntityDeleteResult>>;\n  };\n  readonly trash: {`,
);

const projectWorkspace = 'packages/contracts/src/project-workspace.ts';
await replaceExact(
  projectWorkspace,
  `import { CoreSceneBeatOperationSchema, CoreSceneBeatResultSchema } from './scene-beat.js';\n`,
  `import { CoreSceneBeatOperationSchema, CoreSceneBeatResultSchema } from './scene-beat.js';\nimport { CoreEntityCanonOperationSchema, CoreEntityCanonResultSchema } from './entity-canon.js';\n`,
);
await replaceExact(
  projectWorkspace,
  `  CoreSceneBeatOperationSchema,\n  CoreDraftOperationSchema,`,
  `  CoreSceneBeatOperationSchema,\n  CoreEntityCanonOperationSchema,\n  CoreDraftOperationSchema,`,
);
await replaceExact(
  projectWorkspace,
  `  CoreSceneBeatResultSchema,\n  CoreDraftResultSchema,`,
  `  CoreSceneBeatResultSchema,\n  CoreEntityCanonResultSchema,\n  CoreDraftResultSchema,`,
);

const utility = 'packages/core-service/src/utility-entry.ts';
await replaceExact(
  utility,
  `  SCENE_BEAT_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,`,
  `  SCENE_BEAT_COMMANDS,\n  ENTITY_CANON_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,`,
);
await replaceExact(
  utility,
  `import { SceneBeatService, SceneBeatServiceError } from './scene-beat.js';\n`,
  `import { SceneBeatService, SceneBeatServiceError } from './scene-beat.js';\nimport { EntityCanonService, EntityCanonServiceError } from './entity-canon.js';\n`,
);
await replaceExact(
  utility,
  `const sceneBeats = new SceneBeatService(projectWorkspace);\nconst structureOperations`,
  `const sceneBeats = new SceneBeatService(projectWorkspace);\nconst entityCanon = new EntityCanonService(projectWorkspace);\nconst structureOperations`,
);
await replaceExact(
  utility,
  `  if (error instanceof ProjectStructureError) {`,
  `  if (error instanceof EntityCanonServiceError) {\n    if (error.code === 'ENTITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';\n    if (error.code === 'ENTITY_INVALID' || error.code === 'CANON_AUTHOR_REQUIRED') {\n      return 'COMMON_INVALID_INPUT_001';\n    }\n    return 'COMMON_CONFLICT_003';\n  }\n  if (error instanceof ProjectStructureError) {`,
);
await replaceExact(
  utility,
  `      case PROJECT_STRUCTURE_COMMANDS.listStructure:`,
  `      case ENTITY_CANON_COMMANDS.listEntities:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: entityCanon.list(operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.createEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.create(requestId, operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.updateEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.update(requestId, operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.archiveEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.archive(requestId, operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.setCanonFact:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.setFact(requestId, operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.linkSceneBeatEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.linkSceneBeat(requestId, operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.previewDeleteEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: entityCanon.previewDelete(operation.input),\n        });\n      case ENTITY_CANON_COMMANDS.deleteEntity:\n        return CoreProjectResultSchema.parse({\n          ok: true,\n          operation: operation.operation,\n          data: await entityCanon.delete(requestId, operation.input),\n        });\n      case PROJECT_STRUCTURE_COMMANDS.listStructure:`,
);

console.log('M3-03 backend wiring applied.');
