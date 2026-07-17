import { z } from 'zod';

import {
  DraftBlockAttributesSchema,
  DraftBlockTextSchema,
  DraftBlockTypeSchema,
  DraftContentHashValueSchema,
  DraftDocumentSchema,
  DraftEntityIdSchema,
  DraftOrderKeySchema,
  DraftSourceSchema,
} from './draft.js';
import { ErrorCodeSchema } from './error-codes.js';
import { ProjectIdSchema, TASK_PROTOCOL_VERSION } from './task-protocol.js';

export * from './candidate.js';

export const VERSION_IPC_CHANNELS = {
  createVersion: 'worldforge:version:create',
  listVersions: 'worldforge:version:list',
  getVersion: 'worldforge:version:get',
  setFinalVersion: 'worldforge:version:set-final',
  restoreVersion: 'worldforge:version:restore',
} as const;

export const VERSION_COMMANDS = {
  createVersion: 'version.create',
  listVersions: 'version.list',
  getVersion: 'version.get',
  setFinalVersion: 'version.setFinal',
  restoreVersion: 'version.restore',
} as const;

export const VersionTypeSchema = z.enum(['manual', 'candidate', 'checkpoint', 'imported']);
export const VersionTitleSchema = z.string().trim().min(1).max(240);
export const VersionDescriptionSchema = z.string().trim().max(2_000);
export const VersionLabelSchema = z.string().trim().min(1).max(120).nullable();

export const VersionBlockSchema = z.strictObject({
  logicalBlockId: DraftEntityIdSchema,
  orderKey: DraftOrderKeySchema,
  blockType: DraftBlockTypeSchema,
  text: DraftBlockTextSchema,
  attributes: DraftBlockAttributesSchema,
  source: DraftSourceSchema,
  locked: z.boolean(),
  contentHash: DraftContentHashValueSchema,
});

export const VersionSummarySchema = z.strictObject({
  versionId: DraftEntityIdSchema,
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  sourceDraftId: DraftEntityIdSchema,
  sourceRevision: z.number().int().nonnegative(),
  versionType: VersionTypeSchema,
  parentVersionId: DraftEntityIdSchema.nullable(),
  sourceCandidateId: DraftEntityIdSchema.nullable(),
  title: VersionTitleSchema,
  description: VersionDescriptionSchema,
  label: VersionLabelSchema,
  wordCount: z.number().int().nonnegative(),
  contentHash: DraftContentHashValueSchema,
  createdAt: z.iso.datetime(),
  finalized: z.boolean(),
});

export const VersionDocumentSchema = VersionSummarySchema.extend({
  blocks: z.array(VersionBlockSchema).min(1).max(50_000),
}).strict();

export const VersionListSchema = z.strictObject({
  versions: z.array(VersionSummarySchema),
  finalVersionId: DraftEntityIdSchema.nullable(),
});

export const VersionCreateInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
  draftId: DraftEntityIdSchema,
  baseRevision: z.number().int().nonnegative(),
  versionType: VersionTypeSchema.default('manual'),
  parentVersionId: DraftEntityIdSchema.nullable().optional(),
  sourceCandidateId: DraftEntityIdSchema.nullable().optional(),
  title: VersionTitleSchema,
  description: VersionDescriptionSchema.optional(),
  label: VersionLabelSchema.optional(),
});
export const VersionChapterInputSchema = z.strictObject({
  projectId: ProjectIdSchema,
  chapterId: DraftEntityIdSchema,
});
export const VersionGetInputSchema = VersionChapterInputSchema.extend({
  versionId: DraftEntityIdSchema,
}).strict();
export const VersionSetFinalInputSchema = VersionGetInputSchema;
export const VersionRestoreInputSchema = VersionGetInputSchema;

const commandEnvelope = {
  protocolVersion: z.literal(TASK_PROTOCOL_VERSION),
  requestId: z.uuid(),
  sentAt: z.iso.datetime(),
};

export const VersionCreateCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(VERSION_COMMANDS.createVersion),
  payload: VersionCreateInputSchema,
});
export const VersionListCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(VERSION_COMMANDS.listVersions),
  payload: VersionChapterInputSchema,
});
export const VersionGetCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(VERSION_COMMANDS.getVersion),
  payload: VersionGetInputSchema,
});
export const VersionSetFinalCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(VERSION_COMMANDS.setFinalVersion),
  payload: VersionSetFinalInputSchema,
});
export const VersionRestoreCommandSchema = z.strictObject({
  ...commandEnvelope,
  command: z.literal(VERSION_COMMANDS.restoreVersion),
  payload: VersionRestoreInputSchema,
});

const failureSchema = z.strictObject({
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
const resultSchema = <Schema extends z.ZodType>(schema: Schema) =>
  z.union([
    z.strictObject({ ok: z.literal(true), requestId: z.uuid(), data: schema }),
    failureSchema,
  ]);

export const VersionDocumentResultSchema = resultSchema(VersionDocumentSchema);
export const VersionListResultSchema = resultSchema(VersionListSchema);
export const VersionSummaryResultSchema = resultSchema(VersionSummarySchema);
export const VersionRestoreResultSchema = resultSchema(DraftDocumentSchema);

export const CoreVersionOperationSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal(VERSION_COMMANDS.createVersion),
    input: VersionCreateInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VERSION_COMMANDS.listVersions),
    input: VersionChapterInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VERSION_COMMANDS.getVersion),
    input: VersionGetInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VERSION_COMMANDS.setFinalVersion),
    input: VersionSetFinalInputSchema,
  }),
  z.strictObject({
    operation: z.literal(VERSION_COMMANDS.restoreVersion),
    input: VersionRestoreInputSchema,
  }),
]);

export const CoreVersionResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(VERSION_COMMANDS.createVersion),
    data: VersionDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(VERSION_COMMANDS.listVersions),
    data: VersionListSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(VERSION_COMMANDS.getVersion),
    data: VersionDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(VERSION_COMMANDS.setFinalVersion),
    data: VersionSummarySchema,
  }),
  z.strictObject({
    ok: z.literal(true),
    operation: z.literal(VERSION_COMMANDS.restoreVersion),
    data: DraftDocumentSchema,
  }),
  z.strictObject({
    ok: z.literal(false),
    operation: z.enum(VERSION_COMMANDS),
    errorCode: ErrorCodeSchema,
  }),
]);

export type VersionType = z.infer<typeof VersionTypeSchema>;
export type VersionBlock = z.infer<typeof VersionBlockSchema>;
export type VersionSummary = z.infer<typeof VersionSummarySchema>;
export type VersionDocument = z.infer<typeof VersionDocumentSchema>;
export type VersionList = z.infer<typeof VersionListSchema>;
export type VersionCreateInput = z.infer<typeof VersionCreateInputSchema>;
export type VersionChapterInput = z.infer<typeof VersionChapterInputSchema>;
export type VersionGetInput = z.infer<typeof VersionGetInputSchema>;
export type VersionSetFinalInput = z.infer<typeof VersionSetFinalInputSchema>;
export type VersionRestoreInput = z.infer<typeof VersionRestoreInputSchema>;
