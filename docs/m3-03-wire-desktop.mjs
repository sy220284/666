import { readFile, writeFile } from 'node:fs/promises';

async function replaceExact(path, before, after) {
  const source = await readFile(path, 'utf8');
  if (!source.includes(before)) throw new Error(`Missing anchor in ${path}: ${before.slice(0, 80)}`);
  if (source.includes(after)) return;
  await writeFile(path, source.replace(before, after), 'utf8');
}

const preload = 'apps/desktop/preload/src/index.ts';
await replaceExact(
  preload,
  `  SceneBeatMovePreviewResultSchema,\n  ProjectListTrashCommandSchema,`,
  `  SceneBeatMovePreviewResultSchema,\n  CanonFactSetCommandSchema,\n  EntityArchiveCommandSchema,\n  EntityCatalogResultSchema,\n  EntityCreateCommandSchema,\n  EntityDeleteCommandSchema,\n  EntityDeletePreviewCommandSchema,\n  EntityDeletePreviewResultSchema,\n  EntityDeleteResultEnvelopeSchema,\n  EntityListCommandSchema,\n  EntityUpdateCommandSchema,\n  SceneBeatEntityLinkCommandSchema,\n  ProjectListTrashCommandSchema,`,
);
await replaceExact(
  preload,
  `  },\n  trash: {`,
  `  },\n  canon: {\n    list: (input) =>\n      invoke(\n        IPC_CHANNELS.listEntities,\n        EntityListCommandSchema.parse(envelope(APP_COMMANDS.listEntities, input)),\n        EntityCatalogResultSchema,\n      ),\n    create: (input) =>\n      invoke(\n        IPC_CHANNELS.createEntity,\n        EntityCreateCommandSchema.parse(envelope(APP_COMMANDS.createEntity, input)),\n        EntityCatalogResultSchema,\n      ),\n    update: (input) =>\n      invoke(\n        IPC_CHANNELS.updateEntity,\n        EntityUpdateCommandSchema.parse(envelope(APP_COMMANDS.updateEntity, input)),\n        EntityCatalogResultSchema,\n      ),\n    archive: (input) =>\n      invoke(\n        IPC_CHANNELS.archiveEntity,\n        EntityArchiveCommandSchema.parse(envelope(APP_COMMANDS.archiveEntity, input)),\n        EntityCatalogResultSchema,\n      ),\n    setFact: (input) =>\n      invoke(\n        IPC_CHANNELS.setCanonFact,\n        CanonFactSetCommandSchema.parse(envelope(APP_COMMANDS.setCanonFact, input)),\n        EntityCatalogResultSchema,\n      ),\n    linkSceneBeat: (input) =>\n      invoke(\n        IPC_CHANNELS.linkSceneBeatEntity,\n        SceneBeatEntityLinkCommandSchema.parse(\n          envelope(APP_COMMANDS.linkSceneBeatEntity, input),\n        ),\n        EntityCatalogResultSchema,\n      ),\n    previewDelete: (input) =>\n      invoke(\n        IPC_CHANNELS.previewDeleteEntity,\n        EntityDeletePreviewCommandSchema.parse(\n          envelope(APP_COMMANDS.previewDeleteEntity, input),\n        ),\n        EntityDeletePreviewResultSchema,\n      ),\n    delete: (input) =>\n      invoke(\n        IPC_CHANNELS.deleteEntity,\n        EntityDeleteCommandSchema.parse(envelope(APP_COMMANDS.deleteEntity, input)),\n        EntityDeleteResultEnvelopeSchema,\n      ),\n  },\n  trash: {`,
);

const main = 'apps/desktop/main/src/ipc-handlers.ts';
await replaceExact(
  main,
  `  SCENE_BEAT_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,`,
  `  SCENE_BEAT_COMMANDS,\n  ENTITY_CANON_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,`,
);
await replaceExact(
  main,
  `  SceneBeatConvertBlocksCommandSchema,\n  ProjectListTrashCommandSchema,`,
  `  SceneBeatConvertBlocksCommandSchema,\n  CanonFactSetCommandSchema,\n  EntityArchiveCommandSchema,\n  EntityCreateCommandSchema,\n  EntityDeleteCommandSchema,\n  EntityDeletePreviewCommandSchema,\n  EntityListCommandSchema,\n  EntityUpdateCommandSchema,\n  SceneBeatEntityLinkCommandSchema,\n  ProjectListTrashCommandSchema,`,
);
await replaceExact(
  main,
  `    IPC_CHANNELS.convertBlocksToSceneBeat,\n    IPC_CHANNELS.listStructure,`,
  `    IPC_CHANNELS.convertBlocksToSceneBeat,\n    IPC_CHANNELS.listEntities,\n    IPC_CHANNELS.createEntity,\n    IPC_CHANNELS.updateEntity,\n    IPC_CHANNELS.archiveEntity,\n    IPC_CHANNELS.setCanonFact,\n    IPC_CHANNELS.linkSceneBeatEntity,\n    IPC_CHANNELS.previewDeleteEntity,\n    IPC_CHANNELS.deleteEntity,\n    IPC_CHANNELS.listStructure,`,
);
await replaceExact(
  main,
  `  register(IPC_CHANNELS.listStructure, async (event, raw) => {`,
  `  for (const [channel, schema, operation] of [\n    [IPC_CHANNELS.listEntities, EntityListCommandSchema, ENTITY_CANON_COMMANDS.listEntities],\n    [IPC_CHANNELS.createEntity, EntityCreateCommandSchema, ENTITY_CANON_COMMANDS.createEntity],\n    [IPC_CHANNELS.updateEntity, EntityUpdateCommandSchema, ENTITY_CANON_COMMANDS.updateEntity],\n    [IPC_CHANNELS.archiveEntity, EntityArchiveCommandSchema, ENTITY_CANON_COMMANDS.archiveEntity],\n    [IPC_CHANNELS.setCanonFact, CanonFactSetCommandSchema, ENTITY_CANON_COMMANDS.setCanonFact],\n    [\n      IPC_CHANNELS.linkSceneBeatEntity,\n      SceneBeatEntityLinkCommandSchema,\n      ENTITY_CANON_COMMANDS.linkSceneBeatEntity,\n    ],\n    [\n      IPC_CHANNELS.previewDeleteEntity,\n      EntityDeletePreviewCommandSchema,\n      ENTITY_CANON_COMMANDS.previewDeleteEntity,\n    ],\n    [IPC_CHANNELS.deleteEntity, EntityDeleteCommandSchema, ENTITY_CANON_COMMANDS.deleteEntity],\n  ] as const) {\n    register(channel, async (event, raw) => {\n      const rejected = rejectUntrusted(event, raw);\n      if (rejected) return rejected;\n      const parsed = schema.safeParse(raw);\n      if (!parsed.success) return invalidRequest(raw);\n      return invokeProject(parsed.data.requestId, {\n        operation,\n        input: parsed.data.payload,\n      } as Parameters<CoreSupervisor['invokeProjectOperation']>[1]);\n    });\n  }\n\n  register(IPC_CHANNELS.listStructure, async (event, raw) => {`,
);

console.log('M3-03 desktop bridge wiring applied.');
