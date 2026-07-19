import { z } from 'zod';

import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export const ENTITY_CANON_IPC_CHANNELS = {
  listEntities: 'worldforge:canon:list-entities',
  createEntity: 'worldforge:canon:create-entity',
  updateEntity: 'worldforge:canon:update-entity',
  archiveEntity: 'worldforge:canon:archive-entity',
  setCanonFact: 'worldforge:canon:set-fact',
  linkSceneBeatEntity: 'worldforge:canon:link-scene-beat-entity',
  previewDeleteEntity: 'worldforge:canon:preview-delete-entity',
  deleteEntity: 'worldforge:canon:delete-entity',
} as const;

export const ENTITY_CANON_COMMANDS = {
  listEntities: 'canon.listEntities',
  createEntity: 'canon.createEntity',
  updateEntity: 'canon.updateEntity',
  archiveEntity: 'canon.archiveEntity',
  setCanonFact: 'canon.setFact',
  linkSceneBeatEntity: 'canon.linkSceneBeatEntity',
  previewDeleteEntity: 'canon.previewDeleteEntity',
  deleteEntity: 'canon.deleteEntity',
} as const;

export const CanonAuthoritySchema = z.enum(['author', 'ai']);
export const EntityTypeSchema = z.enum([
  'character',
  'location',
  'faction',
  'item',
  'ability',
  'rule',
  'event',
  'custom',
]);
export const EntityStatusSchema = z.enum(['active', 'archived']);
export const CanonFactStatusSchema = z.enum(['current', 'historical']);
export const CanonFactSourceTypeSchema = z.enum(['author', 'import']);
export const SceneBeatEntityRoleSchema = z.enum([
  'character',
  'location',
  'participant',
  'setting',
  'subject',
  'related',
]);
export const EntityNameSchema = z.string().trim().min(1).max(240);
export const EntityAliasesSchema = z.array(EntityNameSchema).max(100);
export const EntitySummarySchema = z.string().trim().max(20_000);
export const CanonFactKeySchema = z.string().trim().min(1).max(120);
export const CanonFactDescriptionSchema = z.string().trim().max(20_000);

export const CanonFactSchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  entityId: z.uuid(),
  factKey: CanonFactKeySchema,
  value: z.json(),
  description: CanonFactDescriptionSchema,
  sourceType: CanonFactSourceTypeSchema,
  sourceId: z.string().min(1).max(512).nullable(),
  status: CanonFactStatusSchema,
  confirmedAt: z.iso.datetime(),
  supersededAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const EntitySchema = z.strictObject({
  id: z.uuid(),
  projectId: ProjectIdSchema,
  entityType: EntityTypeSchema,
  name: EntityNameSchema,
  aliases: EntityAliasesSchema,
  summary: EntitySummarySchema,
  status: EntityStatusSchema,
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  facts: z.array(CanonFactSchema),
});

export const EntityCatalogSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entities: z.array(EntitySchema),
});

export const EntityListInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  includeArchived: z.boolean().optional(),
});
export const EntityCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityType: EntityTypeSchema,
  name: EntityNameSchema,
  aliases: EntityAliasesSchema.default([]),
  summary: EntitySummarySchema.default(''),
});
export const EntityUpdatePatchSchema = z
  .strictObject({
    entityType: EntityTypeSchema.optional(),
    name: EntityNameSchema.optional(),
    aliases: EntityAliasesSchema.optional(),
    summary: EntitySummarySchema.optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, 'At least one Entity field is required.');
export const EntityUpdateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityId: z.uuid(),
  patch: EntityUpdatePatchSchema,
});
export const EntityArchiveInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityId: z.uuid(),
});
export const CanonFactSetInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityId: z.uuid(),
  factKey: CanonFactKeySchema,
  value: z.json(),
  description: CanonFactDescriptionSchema.default(''),
  sourceType: CanonFactSourceTypeSchema.default('author'),
  sourceId: z.string().min(1).max(512).nullable().default(null),
});
export const SceneBeatEntityLinkInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  sceneBeatId: z.uuid(),
  entityId: z.uuid(),
  role: SceneBeatEntityRoleSchema,
});
export const EntityDeletePreviewInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entityId: z.uuid(),
});
export const EntityDeleteInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  authority: CanonAuthoritySchema,
  entityId: z.uuid(),
  confirmName: EntityNameSchema,
});
export const EntityDeletePreviewSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entityId: z.uuid(),
  entityName: EntityNameSchema,
  archived: z.boolean(),
  sceneBeatReferenceCount: z.number().int().nonnegative(),
  canonFactCount: z.number().int().nonnegative(),
  canDelete: z.boolean(),
  blockers: z.array(z.string().min(1).max(512)),
});
export const EntityDeleteResultSchema = z.strictObject({
  projectId: ProjectIdSchema,
  entityId: z.uuid(),
  deleted: z.literal(true),
});

const envelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};
const command = <Command extends string, Payload extends z.ZodType>(
  commandName: Command,
  payload: Payload,
) => z.strictObject({ ...envelope, command: z.literal(commandName), payload });

export const EntityListCommandSchema = command(
  ENTITY_CANON_COMMANDS.listEntities,
  EntityListInputSchema,
);
export const EntityCreateCommandSchema = command(
  ENTITY_CANON_COMMANDS.createEntity,
  EntityCreateInputSchema,
);
export const EntityUpdateCommandSchema = command(
  ENTITY_CANON_COMMANDS.updateEntity,
  EntityUpdateInputSchema,
);
export const EntityArchiveCommandSchema = command(
  ENTITY_CANON_COMMANDS.archiveEntity,
  EntityArchiveInputSchema,
);
export const CanonFactSetCommandSchema = command(
  ENTITY_CANON_COMMANDS.setCanonFact,
  CanonFactSetInputSchema,
);
export const SceneBeatEntityLinkCommandSchema = command(
  ENTITY_CANON_COMMANDS.linkSceneBeatEntity,
  SceneBeatEntityLinkInputSchema,
);
export const EntityDeletePreviewCommandSchema = command(
  ENTITY_CANON_COMMANDS.previewDeleteEntity,
  EntityDeletePreviewInputSchema,
);
export const EntityDeleteCommandSchema = command(
  ENTITY_CANON_COMMANDS.deleteEntity,
  EntityDeleteInputSchema,
);

const commandFailure = z.strictObject({
  ok: z.literal(false),
  requestId: z.uuid(),
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: z.string().min(1).max(512),
    retryable: z.boolean(),
    userAction: z.string().min(1).max(512).optional(),
    diagnosticId: z.string().min(1).max(128).optional(),
  }),
});
const commandResult = <Data extends z.ZodType>(data: Data) =>
  z.union([z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data }), commandFailure]);

export const EntityCatalogResultSchema = commandResult(EntityCatalogSchema);
export const EntityDeletePreviewResultSchema = commandResult(EntityDeletePreviewSchema);
export const EntityDeleteResultEnvelopeSchema = commandResult(EntityDeleteResultSchema);

export const CoreEntityCanonOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.listEntities),
    input: EntityListInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.createEntity),
    input: EntityCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.updateEntity),
    input: EntityUpdateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.archiveEntity),
    input: EntityArchiveInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.setCanonFact),
    input: CanonFactSetInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.linkSceneBeatEntity),
    input: SceneBeatEntityLinkInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.previewDeleteEntity),
    input: EntityDeletePreviewInputSchema,
  }),
  z.strictObject({
    operation: z.literal(ENTITY_CANON_COMMANDS.deleteEntity),
    input: EntityDeleteInputSchema,
  }),
]);

const coreSuccess = <Operation extends string, Data extends z.ZodType>(
  operation: Operation,
  data: Data,
) => z.strictObject({ ok: z.literal(true), operation: z.literal(operation), data });

export const CoreEntityCanonResultSchema = z.union([
  coreSuccess(ENTITY_CANON_COMMANDS.listEntities, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.createEntity, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.updateEntity, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.archiveEntity, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.setCanonFact, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.linkSceneBeatEntity, EntityCatalogSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.previewDeleteEntity, EntityDeletePreviewSchema),
  coreSuccess(ENTITY_CANON_COMMANDS.deleteEntity, EntityDeleteResultSchema),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(ENTITY_CANON_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type CanonAuthority = z.infer<typeof CanonAuthoritySchema>;
export type EntityType = z.infer<typeof EntityTypeSchema>;
export type EntityStatus = z.infer<typeof EntityStatusSchema>;
export type CanonFact = z.infer<typeof CanonFactSchema>;
export type Entity = z.infer<typeof EntitySchema>;
export type EntityCatalog = z.infer<typeof EntityCatalogSchema>;
export type EntityListInput = z.infer<typeof EntityListInputSchema>;
export type EntityCreateInput = z.infer<typeof EntityCreateInputSchema>;
export type EntityUpdateInput = z.infer<typeof EntityUpdateInputSchema>;
export type EntityArchiveInput = z.infer<typeof EntityArchiveInputSchema>;
export type CanonFactSetInput = z.infer<typeof CanonFactSetInputSchema>;
export type SceneBeatEntityLinkInput = z.infer<typeof SceneBeatEntityLinkInputSchema>;
export type EntityDeletePreviewInput = z.infer<typeof EntityDeletePreviewInputSchema>;
export type EntityDeletePreview = z.infer<typeof EntityDeletePreviewSchema>;
export type EntityDeleteInput = z.infer<typeof EntityDeleteInputSchema>;
export type EntityDeleteResult = z.infer<typeof EntityDeleteResultSchema>;
