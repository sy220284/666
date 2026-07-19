from pathlib import Path

ROOT = Path.cwd()

def read(path: str) -> str:
    return (ROOT / path).read_text(encoding='utf-8')

def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding='utf-8')

def replace_once(path: str, old: str, new: str) -> None:
    source = read(path)
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'{path} anchor count {count} for: {old[:120]!r}')
    write(path, source.replace(old, new, 1))

replace_once('packages/domain/src/index.ts', "export * from './canon.js';\n", "export * from './canon.js';\nexport * from './continuity.js';\n")
replace_once('packages/core-service/src/index.ts', "export * from './entity-canon.js';\n", "export * from './entity-canon.js';\nexport * from './continuity.js';\n")
replace_once('packages/contracts/src/project-workspace.ts', "import { CoreEntityCanonOperationSchema, CoreEntityCanonResultSchema } from './entity-canon.js';\n", "import { CoreEntityCanonOperationSchema, CoreEntityCanonResultSchema } from './entity-canon.js';\nimport { CoreContinuityOperationSchema, CoreContinuityResultSchema } from './continuity.js';\n")
replace_once('packages/contracts/src/project-workspace.ts', '  CoreEntityCanonOperationSchema,\n  CoreDraftOperationSchema,', '  CoreEntityCanonOperationSchema,\n  CoreContinuityOperationSchema,\n  CoreDraftOperationSchema,')
replace_once('packages/contracts/src/project-workspace.ts', '  CoreEntityCanonResultSchema,\n  CoreDraftResultSchema,', '  CoreEntityCanonResultSchema,\n  CoreContinuityResultSchema,\n  CoreDraftResultSchema,')

continuity_import = """import {
  CONTINUITY_COMMANDS,
  CONTINUITY_IPC_CHANNELS,
  ContinuityListCommandSchema,
  EntityStateSetCommandSchema,
  KnowledgeStateSetCommandSchema,
  TimelineEventSaveCommandSchema,
  type ContinuityCatalog,
  type ContinuityListInput,
  type EntityStateSetInput,
  type KnowledgeStateSetInput,
  type TimelineEventSaveInput,
} from './continuity.js';
"""
replace_once('packages/contracts/src/index.ts', "} from './entity-canon.js';\nimport {\n  DRAFT_COMMANDS,", "} from './entity-canon.js';\n" + continuity_import + "import {\n  DRAFT_COMMANDS,")
replace_once('packages/contracts/src/index.ts', "export * from './entity-canon.js';\n", "export * from './entity-canon.js';\nexport * from './continuity.js';\n")
replace_once('packages/contracts/src/index.ts', '  ...ENTITY_CANON_IPC_CHANNELS,\n  ...DRAFT_IPC_CHANNELS,', '  ...ENTITY_CANON_IPC_CHANNELS,\n  ...CONTINUITY_IPC_CHANNELS,\n  ...DRAFT_IPC_CHANNELS,')
replace_once('packages/contracts/src/index.ts', '  ...ENTITY_CANON_COMMANDS,\n  ...DRAFT_COMMANDS,', '  ...ENTITY_CANON_COMMANDS,\n  ...CONTINUITY_COMMANDS,\n  ...DRAFT_COMMANDS,')
replace_once('packages/contracts/src/index.ts', '  EntityDeleteCommandSchema,\n  DraftOpenCommandSchema,', '  EntityDeleteCommandSchema,\n  ContinuityListCommandSchema,\n  EntityStateSetCommandSchema,\n  TimelineEventSaveCommandSchema,\n  KnowledgeStateSetCommandSchema,\n  DraftOpenCommandSchema,')
bridge_anchor = """  readonly canon: {
    readonly list: (input: EntityListInput) => Promise<CommandResult<EntityCatalog>>;
    readonly create: (input: EntityCreateInput) => Promise<CommandResult<EntityCatalog>>;
    readonly update: (input: EntityUpdateInput) => Promise<CommandResult<EntityCatalog>>;
    readonly archive: (input: EntityArchiveInput) => Promise<CommandResult<EntityCatalog>>;
    readonly setFact: (input: CanonFactSetInput) => Promise<CommandResult<EntityCatalog>>;
    readonly linkSceneBeat: (
      input: SceneBeatEntityLinkInput,
    ) => Promise<CommandResult<EntityCatalog>>;
    readonly previewDelete: (
      input: EntityDeletePreviewInput,
    ) => Promise<CommandResult<EntityDeletePreview>>;
    readonly delete: (input: EntityDeleteInput) => Promise<CommandResult<EntityDeleteResult>>;
  };
"""
bridge_replacement = bridge_anchor + """  readonly continuity: {
    readonly list: (input: ContinuityListInput) => Promise<CommandResult<ContinuityCatalog>>;
    readonly setEntityState: (
      input: EntityStateSetInput,
    ) => Promise<CommandResult<ContinuityCatalog>>;
    readonly saveTimelineEvent: (
      input: TimelineEventSaveInput,
    ) => Promise<CommandResult<ContinuityCatalog>>;
    readonly setKnowledgeState: (
      input: KnowledgeStateSetInput,
    ) => Promise<CommandResult<ContinuityCatalog>>;
  };
"""
replace_once('packages/contracts/src/index.ts', bridge_anchor, bridge_replacement)

replace_once('packages/core-service/src/utility-entry.ts', '  ENTITY_CANON_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,', '  ENTITY_CANON_COMMANDS,\n  CONTINUITY_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,')
replace_once('packages/core-service/src/utility-entry.ts', "import { EntityCanonService, EntityCanonServiceError } from './entity-canon.js';\n", "import { EntityCanonService, EntityCanonServiceError } from './entity-canon.js';\nimport { ContinuityService, ContinuityServiceError } from './continuity.js';\n")
replace_once('packages/core-service/src/utility-entry.ts', 'const entityCanon = new EntityCanonService(projectWorkspace);\n', 'const entityCanon = new EntityCanonService(projectWorkspace);\nconst continuity = new ContinuityService(projectWorkspace);\n')
replace_once('packages/core-service/src/utility-entry.ts', "  if (error instanceof EntityCanonServiceError) {\n    if (error.code === 'ENTITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';\n    if (error.code === 'ENTITY_INVALID' || error.code === 'CANON_AUTHOR_REQUIRED') {\n      return 'COMMON_INVALID_INPUT_001';\n    }\n    return 'COMMON_CONFLICT_003';\n  }\n", "  if (error instanceof EntityCanonServiceError) {\n    if (error.code === 'ENTITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';\n    if (error.code === 'ENTITY_INVALID' || error.code === 'CANON_AUTHOR_REQUIRED') {\n      return 'COMMON_INVALID_INPUT_001';\n    }\n    return 'COMMON_CONFLICT_003';\n  }\n  if (error instanceof ContinuityServiceError) {\n    if (error.code === 'CONTINUITY_NOT_FOUND') return 'COMMON_NOT_FOUND_002';\n    if (error.code === 'CONTINUITY_INVALID' || error.code === 'CONTINUITY_AUTHOR_REQUIRED') {\n      return 'COMMON_INVALID_INPUT_001';\n    }\n    return 'COMMON_CONFLICT_003';\n  }\n")
continuity_cases = """      case CONTINUITY_COMMANDS.listContinuity:
        return CoreProjectResultSchema.parse({ ok: true, operation: operation.operation, data: continuity.list(operation.input) });
      case CONTINUITY_COMMANDS.setEntityState:
        return CoreProjectResultSchema.parse({ ok: true, operation: operation.operation, data: await continuity.setEntityState(requestId, operation.input) });
      case CONTINUITY_COMMANDS.saveTimelineEvent:
        return CoreProjectResultSchema.parse({ ok: true, operation: operation.operation, data: await continuity.saveTimelineEvent(requestId, operation.input) });
      case CONTINUITY_COMMANDS.setKnowledgeState:
        return CoreProjectResultSchema.parse({ ok: true, operation: operation.operation, data: await continuity.setKnowledgeState(requestId, operation.input) });
"""
replace_once('packages/core-service/src/utility-entry.ts', '      case PROJECT_STRUCTURE_COMMANDS.listStructure:\n', continuity_cases + '      case PROJECT_STRUCTURE_COMMANDS.listStructure:\n')

replace_once('apps/desktop/main/src/ipc-handlers.ts', '  ENTITY_CANON_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,', '  ENTITY_CANON_COMMANDS,\n  CONTINUITY_COMMANDS,\n  PROJECT_WORKSPACE_COMMANDS,')
replace_once('apps/desktop/main/src/ipc-handlers.ts', '  SceneBeatEntityLinkCommandSchema,\n  ProjectListTrashCommandSchema,', '  SceneBeatEntityLinkCommandSchema,\n  ContinuityListCommandSchema,\n  EntityStateSetCommandSchema,\n  TimelineEventSaveCommandSchema,\n  KnowledgeStateSetCommandSchema,\n  ProjectListTrashCommandSchema,')
replace_once('apps/desktop/main/src/ipc-handlers.ts', '    IPC_CHANNELS.deleteEntity,\n    IPC_CHANNELS.listStructure,', '    IPC_CHANNELS.deleteEntity,\n    IPC_CHANNELS.listContinuity,\n    IPC_CHANNELS.setEntityState,\n    IPC_CHANNELS.saveTimelineEvent,\n    IPC_CHANNELS.setKnowledgeState,\n    IPC_CHANNELS.listStructure,')
main_loop_anchor = """    [IPC_CHANNELS.deleteEntity, EntityDeleteCommandSchema, ENTITY_CANON_COMMANDS.deleteEntity],
  ] as const) {
"""
main_loop_replacement = """    [IPC_CHANNELS.deleteEntity, EntityDeleteCommandSchema, ENTITY_CANON_COMMANDS.deleteEntity],
    [IPC_CHANNELS.listContinuity, ContinuityListCommandSchema, CONTINUITY_COMMANDS.listContinuity],
    [IPC_CHANNELS.setEntityState, EntityStateSetCommandSchema, CONTINUITY_COMMANDS.setEntityState],
    [IPC_CHANNELS.saveTimelineEvent, TimelineEventSaveCommandSchema, CONTINUITY_COMMANDS.saveTimelineEvent],
    [IPC_CHANNELS.setKnowledgeState, KnowledgeStateSetCommandSchema, CONTINUITY_COMMANDS.setKnowledgeState],
  ] as const) {
"""
replace_once('apps/desktop/main/src/ipc-handlers.ts', main_loop_anchor, main_loop_replacement)

replace_once('apps/desktop/preload/src/index.ts', '  SceneBeatEntityLinkCommandSchema,\n  ProjectListTrashCommandSchema,', '  SceneBeatEntityLinkCommandSchema,\n  ContinuityCatalogResultSchema,\n  ContinuityListCommandSchema,\n  EntityStateSetCommandSchema,\n  TimelineEventSaveCommandSchema,\n  KnowledgeStateSetCommandSchema,\n  ProjectListTrashCommandSchema,')
preload_anchor = """  canon: {
    list: (input) =>
      invoke(
        IPC_CHANNELS.listEntities,
        EntityListCommandSchema.parse(envelope(APP_COMMANDS.listEntities, input)),
        EntityCatalogResultSchema,
      ),
    create: (input) =>
      invoke(
        IPC_CHANNELS.createEntity,
        EntityCreateCommandSchema.parse(envelope(APP_COMMANDS.createEntity, input)),
        EntityCatalogResultSchema,
      ),
    update: (input) =>
      invoke(
        IPC_CHANNELS.updateEntity,
        EntityUpdateCommandSchema.parse(envelope(APP_COMMANDS.updateEntity, input)),
        EntityCatalogResultSchema,
      ),
    archive: (input) =>
      invoke(
        IPC_CHANNELS.archiveEntity,
        EntityArchiveCommandSchema.parse(envelope(APP_COMMANDS.archiveEntity, input)),
        EntityCatalogResultSchema,
      ),
    setFact: (input) =>
      invoke(
        IPC_CHANNELS.setCanonFact,
        CanonFactSetCommandSchema.parse(envelope(APP_COMMANDS.setCanonFact, input)),
        EntityCatalogResultSchema,
      ),
    linkSceneBeat: (input) =>
      invoke(
        IPC_CHANNELS.linkSceneBeatEntity,
        SceneBeatEntityLinkCommandSchema.parse(envelope(APP_COMMANDS.linkSceneBeatEntity, input)),
        EntityCatalogResultSchema,
      ),
    previewDelete: (input) =>
      invoke(
        IPC_CHANNELS.previewDeleteEntity,
        EntityDeletePreviewCommandSchema.parse(envelope(APP_COMMANDS.previewDeleteEntity, input)),
        EntityDeletePreviewResultSchema,
      ),
    delete: (input) =>
      invoke(
        IPC_CHANNELS.deleteEntity,
        EntityDeleteCommandSchema.parse(envelope(APP_COMMANDS.deleteEntity, input)),
        EntityDeleteResultEnvelopeSchema,
      ),
  },
"""
preload_continuity = preload_anchor + """  continuity: {
    list: (input) => invoke(IPC_CHANNELS.listContinuity, ContinuityListCommandSchema.parse(envelope(APP_COMMANDS.listContinuity, input)), ContinuityCatalogResultSchema),
    setEntityState: (input) => invoke(IPC_CHANNELS.setEntityState, EntityStateSetCommandSchema.parse(envelope(APP_COMMANDS.setEntityState, input)), ContinuityCatalogResultSchema),
    saveTimelineEvent: (input) => invoke(IPC_CHANNELS.saveTimelineEvent, TimelineEventSaveCommandSchema.parse(envelope(APP_COMMANDS.saveTimelineEvent, input)), ContinuityCatalogResultSchema),
    setKnowledgeState: (input) => invoke(IPC_CHANNELS.setKnowledgeState, KnowledgeStateSetCommandSchema.parse(envelope(APP_COMMANDS.setKnowledgeState, input)), ContinuityCatalogResultSchema),
  },
"""
replace_once('apps/desktop/preload/src/index.ts', preload_anchor, preload_continuity)
